import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { MapContainer, TileLayer, Marker, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const statusLabels = {
  assigned: 'Aguardando retirada', picked_up: 'A caminho',
  arriving: 'Chegando', delivered: 'Entregue'
};

const statusColors = {
  assigned: 'badge-primary', picked_up: 'badge-info',
  arriving: 'badge-accent', delivered: 'badge-success'
};

const nextStatus = {
  assigned: 'picked_up',
  picked_up: 'arriving',
  arriving: 'delivered'
};

const nextStatusLabel = {
  assigned: 'Retirei o pedido',
  picked_up: 'Chegando',
  arriving: 'Entregue'
};

export default function MotoboyDashboard() {
  const { user, apiFetch, logout } = useAuth();
  const { socket, setToast } = useSocket();
  const [availableOrders, setAvailableOrders] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [store, setStore] = useState(null);
  const [route, setRoute] = useState(null);
  const [pixKey, setPixKey] = useState(() => localStorage.getItem('motoboy_pix_key') || '');
  const [pixSaving, setPixSaving] = useState(false);
  const [pixMsg, setPixMsg] = useState('');
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [selectedTab, setSelectedTab] = useState('available');
  const [isEmployee, setIsEmployee] = useState(false);
  const [earnings, setEarnings] = useState({ total: 0, pending: 0, list: [] });

  useEffect(() => {
    loadData();
    apiFetch('/stores').then(d => {
      if (d.data && d.data.length > 0) setStore(d.data[0]);
    });
    apiFetch('/motoboy/profile').then(d => {
      if (d.employments && d.employments.some(e => e.employee)) {
        setIsEmployee(true);
      }
      if (d.total !== undefined) setEarnings({ total: d.total, pending: d.pending, list: d.earnings || [] });
    });
    const interval = setInterval(loadData, 10000);
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('order_updated', () => loadData());
    socket.on('new_order', () => loadData());
    return () => {
      socket.off('order_updated');
      socket.off('new_order');
    };
  }, [socket]);

  async function loadData() {
    const [avail, mine] = await Promise.all([
      apiFetch('/motoboy/available'),
      apiFetch('/orders')
    ]);
    if (avail.data) setAvailableOrders(avail.data);
    if (mine.data) {
      setMyOrders(mine.data.filter(o => o.motoboy_id === user?.id));
    }
    setLoading(false);
  }

  async function acceptOrder(orderId) {
    await apiFetch(`/motoboy/accept/${orderId}`, { method: 'POST' });
    setToast('Pedido aceito!');
    loadData();
  }

  async function updateStatus(orderId) {
    const order = myOrders.find(o => o.id === orderId);
    if (!order) return;
    const next = nextStatus[order.status];
    if (!next) return;

    await apiFetch(`/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next })
    });

    if (next === 'arriving') {
      setToast('Cliente será notificado que você está chegando!');
    }

    loadData();
  }

  async function optimizeRoute() {
    const activeIds = myOrders.map(o => o.id);
    const data = await apiFetch('/motoboy/optimize-route', {
      method: 'POST',
      body: JSON.stringify({ orderIds: activeIds })
    });
    if (data.route) {
      setRoute({ store: data.store, route: data.route });
    }
  }

  async function sendLocation() {
    if (!navigator.geolocation) {
      const lat = -23.5505 + (Math.random() - 0.5) * 0.02;
      const lng = -46.6333 + (Math.random() - 0.5) * 0.02;
      await apiFetch('/motoboy/location', {
        method: 'POST',
        body: JSON.stringify({ lat, lng, online: online ? 1 : 0 })
      });
      return;
    }

    navigator.geolocation.getCurrentPosition(async (pos) => {
      await apiFetch('/motoboy/location', {
        method: 'POST',
        body: JSON.stringify({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          online: online ? 1 : 0
        })
      });
    }, async () => {
      const lat = -23.5505 + (Math.random() - 0.5) * 0.02;
      const lng = -46.6333 + (Math.random() - 0.5) * 0.02;
      await apiFetch('/motoboy/location', {
        method: 'POST',
        body: JSON.stringify({ lat, lng, online: online ? 1 : 0 })
      });
    });
  }

  useEffect(() => {
    if (online) {
      sendLocation();
      const interval = setInterval(sendLocation, 15000);
      return () => clearInterval(interval);
    }
  }, [online]);

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div>
      <div className="header">
        <div className="header-left" style={{ gap: 10 }}>
          <img src="/logomarca.png" alt="Pé de Açaí"
            style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'contain', flexShrink: 0 }} />
          <div>
            <div className="header-title" style={{ fontSize: 18 }}>Pé de Açaí</div>
            <div style={{ fontSize: 11, color: 'var(--text-light)' }}>Motoboy</div>
          </div>
        </div>
        <div className="header-right" style={{ gap: 6 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            onClick={() => setSelectedTab('profile')}>
            {user?.photo_url ? (
              <img src={user.photo_url} alt="Foto"
                style={{ width: 30, height: 30, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                onError={e => { e.target.style.display = 'none'; }} />
            ) : (
              <div style={{
                width: 30, height: 30, borderRadius: '50%',
                background: 'linear-gradient(135deg, #42A5F5, #1565C0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 700, fontSize: 13, flexShrink: 0
              }}>
                {user?.name?.charAt(0)?.toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{user?.name?.split(' ')[0]}</div>
              <div onClick={(e) => { e.stopPropagation(); logout(); }}
                style={{ fontSize: 9, color: 'var(--text-light)', cursor: 'pointer' }}>
                Sair
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 8 }}>
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: online ? 'linear-gradient(135deg, #E8F5E9, #C8E6C9)' : 'linear-gradient(135deg, #F5F5F5, #EEEEEE)',
          borderRadius: 14, padding: '12px 16px', marginBottom: 16,
          border: online ? '1px solid #A5D6A7' : '1px solid #E0E0E0',
          transition: 'all 0.3s'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 12, height: 12, borderRadius: '50%',
              background: online ? '#2E7D32' : '#BDBDBD',
              boxShadow: online ? '0 0 0 3px rgba(46,125,50,0.2), 0 0 8px rgba(46,125,50,0.3)' : 'none',
              transition: 'all 0.3s'
            }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: online ? '#1B5E20' : '#757575', transition: 'color 0.3s' }}>
                {online ? 'Online - Aceitando entregas' : 'Offline'}
              </div>
              <div style={{ fontSize: 11, color: online ? '#2E7D32' : '#999', marginTop: 1 }}>
                {online ? 'Você está disponível para receber corridas' : 'Ative para receber pedidos'}
              </div>
            </div>
          </div>
          <div className="toggle-switch" onClick={() => {
            setOnline(!online);
            if (!online) sendLocation();
          }}>
            <input type="checkbox" checked={online} readOnly />
            <span className="toggle-slider" />
          </div>
        </div>

        {isEmployee && (
          <div className="card" style={{ background: '#E8F5E9', border: '1px solid #C8E6C9', textAlign: 'center', padding: 10, marginBottom: 12 }}>
            <span style={{ fontWeight: 600, color: '#2E7D32', fontSize: 13 }}>
              Você é parceiro desta loja — os pedidos chegam automaticamente, sem precisar aceitar
            </span>
          </div>
        )}

        {earnings.total > 0 && (
          <div className="card" style={{ background: 'linear-gradient(135deg, #E3F2FD, #BBDEFB)', border: '1px solid #90CAF9', textAlign: 'center', padding: 14, marginBottom: 12 }}>
            <div className="text-xs text-muted" style={{ marginBottom: 4 }}>Seus ganhos</div>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#1565C0' }}>R$ {earnings.total.toFixed(2)}</div>
            {earnings.pending > 0 && (
              <div className="text-xs" style={{ color: '#E65100', marginTop: 4 }}>
                R$ {earnings.pending.toFixed(2)} a receber
              </div>
            )}
          </div>
        )}

        <div className="flex-row" style={{ marginBottom: 16, justifyContent: 'space-between', overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none' }}>
          <div className="flex-row">
            <button className={`btn btn-sm ${selectedTab === 'available' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSelectedTab('available')}>
              {isEmployee ? 'Pedidos da Loja' : 'Disponiveis'} ({availableOrders.length})
            </button>
            <button className={`btn btn-sm ${selectedTab === 'mine' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setSelectedTab('mine')}>
              Minhas ({myOrders.length})
            </button>
            <button className={`btn btn-sm ${selectedTab === 'route' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => {
                setSelectedTab('route');
                optimizeRoute();
            }}>
            Rota
          </button>
        </div>
      </div>

        {selectedTab === 'available' && (
          <>
            <div className="page-title" style={{ color: '#1565C0' }}>Pedidos Disponíveis</div>
            {availableOrders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <circle cx="32" cy="28" r="16" stroke="var(--border)" strokeWidth="2"/>
                    <path d="M32 20v8l5 5" stroke="var(--border)" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <p>{isEmployee ? 'Nenhum pedido pendente da loja' : 'Nenhum pedido disponível no momento'}</p>
              </div>
            ) : (
              availableOrders.map(order => (
                <div key={order.id} className="card">
                  <div className="flex-between" style={{ marginBottom: 6 }}>
                    <div>
                      <span className="font-bold">#{order.id.slice(0, 8)}</span>
                      <span className="text-sm text-muted" style={{ marginLeft: 8 }}>
                        {order.customer_name}
                      </span>
                    </div>
                    <span className="badge badge-success">R$ {order.total.toFixed(2)}</span>
                  </div>
                  <div className="text-sm text-muted" style={{ marginBottom: 6 }}>
                    Loja: {order.store_name} | {order.store_address}
                  </div>
                  <div className="text-sm text-muted" style={{ marginBottom: 8 }}>
                    Entrega: {order.customer_address}
                  </div>
                  <div className="flex-between">
                    <span className={`badge ${statusColors[order.status] || 'badge-primary'}`}>
                      {statusLabels[order.status] || order.status}
                    </span>
                    {!isEmployee && (
                      <button className="btn btn-sm btn-primary" onClick={() => acceptOrder(order.id)}>
                        Aceitar Entrega
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {selectedTab === 'mine' && (
          <>
            <div className="page-title" style={{ color: '#1565C0' }}>Minhas Entregas</div>
            {myOrders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <path d="M20 48V24l8-12h8l8 12v24" stroke="var(--border)" strokeWidth="2" strokeLinejoin="round"/>
                    <circle cx="32" cy="36" r="4" stroke="var(--border)" strokeWidth="2"/>
                  </svg>
                </div>
                <p>Aceite pedidos para começar</p>
              </div>
            ) : (
              myOrders.map(order => (
                <div key={order.id} className="card">
                  <div className="flex-between" style={{ marginBottom: 6 }}>
                    <div>
                      <span className="font-bold">#{order.id.slice(0, 8)}</span>
                      <span className="text-sm text-muted" style={{ marginLeft: 8 }}>
                        {order.customer_name}
                      </span>
                    </div>
                    <span className={`badge ${statusColors[order.status] || 'badge-primary'}`}>
                      {statusLabels[order.status] || order.status}
                    </span>
                  </div>
                  <div className="text-sm text-muted" style={{ marginBottom: 6 }}>
                    Retirar: {order.store_name}
                  </div>
                  <div className="text-sm text-muted" style={{ marginBottom: 8 }}>
                    Entregar: {order.customer_address}
                  </div>

                  {(order.store_lat || order.customer_lat) && (
                    <div style={{ height: 200, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 8 }}>
                      <MapContainer
                        center={[
                          (order.store_lat + (order.customer_lat || order.store_lat)) / 2,
                          ((order.store_lng || 0) + (order.customer_lng || order.store_lng || 0)) / 2
                        ]}
                        zoom={13}
                        style={{ height: '100%', width: '100%' }}
                        key={`order-map-${order.id}`}
                        scrollWheelZoom={false}
                      >
                        <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                        {order.store_lat && order.store_lng && (
                          <Marker position={[order.store_lat, order.store_lng]} />
                        )}
                        {order.customer_lat && order.customer_lng && (
                          <Marker position={[order.customer_lat, order.customer_lng]} />
                        )}
                        {order.store_lat && order.store_lng && order.customer_lat && order.customer_lng && (
                          <Polyline
                            positions={[[order.store_lat, order.store_lng], [order.customer_lat, order.customer_lng]]}
                            pathOptions={{ color: '#1565C0', weight: 3, dashArray: '8 4' }}
                          />
                        )}
                      </MapContainer>
                    </div>
                  )}

                  {order.status === 'in_transit' && (
                    <div className="card mt-2" style={{ background: '#FFF3E0', border: '1px solid #FFE0B2', padding: 8 }}>
                      <button className="btn btn-sm btn-accent w-full" onClick={sendLocation}>
                        Atualizar minha localização (GPS)
                      </button>
                    </div>
                  )}

                  <div className="flex-between" style={{ marginTop: 8 }}>
                    <span className="badge badge-success">R$ {order.total.toFixed(2)}</span>
                    {nextStatus[order.status] && (
                      <button className="btn btn-sm btn-primary"
                        onClick={() => updateStatus(order.id)}>
                        {nextStatusLabel[order.status]}
                      </button>
                    )}
                  </div>
                </div>
              ))
            )}
          </>
        )}

        {selectedTab === 'route' && (
          <>
            <div className="page-title" style={{ color: '#1565C0' }}>Rota Otimizada</div>
            {route ? (
              <div>
                {route.store && (
                  <div className="card" style={{ background: '#E8F5E9', marginBottom: 12 }}>
                    <div className="text-sm font-bold" style={{ marginBottom: 4, color: 'var(--secondary)' }}>
                      Ponto de Partida (Loja)
                    </div>
                    <div className="font-bold">{route.store.name}</div>
                    <div className="text-xs text-muted">{route.store.address}</div>
                  </div>
                )}

                <div className="card" style={{ background: '#E3F2FD' }}>
                  <p className="text-sm font-bold" style={{ marginBottom: 8 }}>
                    Melhor ordem de entrega (menor distância):
                  </p>
                  {route.route.map((r, i) => (
                    <div key={r.id} className="flex-row card" style={{
                      padding: 10, marginBottom: 6,
                      borderLeft: `4px solid ${i === 0 ? 'var(--secondary)' : 'var(--primary)'}`
                    }}>
                      <div style={{
                        width: 28, height: 28, borderRadius: '50%',
                        background: i === 0 ? 'var(--secondary)' : 'var(--primary)',
                        color: 'white', display: 'flex', alignItems: 'center',
                        justifyContent: 'center', fontWeight: 700, fontSize: 13,
                        flexShrink: 0
                      }}>
                        {r.stop}
                      </div>
                      <div>
                        <div className="font-bold text-sm">{r.customer_name}</div>
                        <div className="text-xs text-muted">{r.customer_address}</div>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="map-container" style={{ height: 200, background: '#E8EAF6', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: 16 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginBottom: 12 }}>
                    <div style={{
                      width: 20, height: 20, borderRadius: '50%', background: '#2E7D32',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      color: 'white', fontSize: 10
                    }}>L</div>
                    {route.route.map((r, i) => (
                      <div key={r.id} className="flex-row" style={{ alignItems: 'center' }}>
                        <div style={{
                          width: 30, height: 3, background: i === 0 ? '#2E7D32' : '#6A1B9A'
                        }} />
                        <div style={{
                          width: 20, height: 20, borderRadius: '50%', background: '#6A1B9A',
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          color: 'white', fontSize: 10
                        }}>{r.stop}</div>
                      </div>
                    ))}
                  </div>
                  <p className="text-xs text-muted">Rota visual (simulada)</p>
                </div>
              </div>
            ) : (
              <div className="card text-center">
                <p>Aceite pedidos primeiro para gerar a rota otimizada</p>
                <button className="btn btn-primary mt-2" onClick={optimizeRoute}>
                  Gerar Rota
                </button>
              </div>
            )}
          </>
        )}

        {selectedTab === 'profile' && (
          <div className="card" style={{ textAlign: 'left' }}>
            <div className="page-title" style={{ fontSize: 20 }}>Meu Perfil</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              {user?.photo_url ? (
                <img src={user.photo_url} alt="Foto"
                  style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }}
                  onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #42A5F5, #1565C0)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 700, fontSize: 24
                }}>
                  {user?.name?.charAt(0)?.toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 800, fontSize: 16 }}>{user?.name}</div>
                <div style={{ fontSize: 12, color: '#888' }}>Motoboy</div>
              </div>
            </div>
            <div className="form-group">
              <label className="label">Telefone</label>
              <div style={{ fontWeight: 600 }}>{user?.phone}</div>
            </div>
            <div className="form-group">
              <label className="label">Chave PIX (para receber entregas)</label>
              <input className="input" type="text" value={pixKey}
                onChange={e => setPixKey(e.target.value)}
                placeholder="CPF, telefone, e-mail ou chave aleatoria" />
              <span className="text-xs text-muted">Taxa de entrega sera enviada para esta chave</span>
            </div>
            {pixMsg && (
              <div style={{
                fontSize: 13, fontWeight: 600, padding: '10px 14px', borderRadius: 8, marginBottom: 12,
                background: pixMsg.includes('Erro') ? '#FFEBEE' : '#E8F5E9',
                color: pixMsg.includes('Erro') ? '#C62828' : '#2E7D32'
              }}>
                {pixMsg}
              </div>
            )}
            <button className="btn btn-primary" onClick={async () => {
              setPixSaving(true);
              try {
                localStorage.setItem('motoboy_pix_key', pixKey);
                const res = await apiFetch('/motoboy/profile', {
                  method: 'PATCH',
                  body: JSON.stringify({ pix_key: pixKey })
                });
                setPixMsg(res.ok ? 'Chave PIX salva!' : (res.error || 'Salvo localmente. Execute ALTER TABLE no Supabase.'));
              } catch {
                localStorage.setItem('motoboy_pix_key', pixKey);
                setPixMsg('Chave PIX salva localmente!');
              }
              setPixSaving(false);
              setTimeout(() => setPixMsg(''), 3000);
            }} disabled={pixSaving}>
              {pixSaving ? 'Salvando...' : 'Salvar'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
