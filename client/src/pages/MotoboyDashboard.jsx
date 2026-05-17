import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { MapContainer, TileLayer, Marker, Polyline } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const statusColors = {
  assigned: 'badge-primary', picked_up: 'badge-info',
  arriving: 'badge-accent', delivered: 'badge-success'
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

  const tabKeys = [
    { key: 'available', icon: '🏠', label: 'Início' },
    { key: 'mine', icon: '📋', label: 'Pedidos' },
    { key: 'route', icon: '🗺️', label: 'Rota' },
    { key: 'profile', icon: '👤', label: 'Perfil' },
  ];

  return (
    <div style={{ paddingBottom: 70, background: '#f7f4fb', minHeight: '100vh' }}>
      {/* Header */}
        <div className="header" style={{ padding: '10px 16px' }}>
        <div className="header-left" style={{ gap: 8 }}>
          <img src="/logomarca.png" alt="Pé de Açaí"
            style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'contain', flexShrink: 0 }} />
          <div>
            <div style={{ fontSize: 15, fontWeight: 800, color: 'var(--primary-dark)', letterSpacing: '-0.02em' }}>Pé de Açaí</div>
          </div>
        </div>
        <div className="header-right" style={{ gap: 8 }}>
          <div onClick={() => setSelectedTab('profile')} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}>
            {user?.photo_url ? (
              <img src={user.photo_url} alt="Foto"
                style={{ width: 32, height: 32, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                onError={e => { e.target.style.display = 'none'; }} />
            ) : (
              <div style={{
                width: 32, height: 32, borderRadius: '50%',
                background: 'linear-gradient(135deg, #42A5F5, #1565C0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 700, fontSize: 14, flexShrink: 0
              }}>
                {user?.name?.charAt(0)?.toUpperCase()}
              </div>
            )}
            <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text)' }}>Olá, {user?.name?.split(' ')[0]}</span>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 12 }}>
        {/* Partner banner */}
        {isEmployee && (
          <div style={{
            background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)',
            borderRadius: 12, padding: '10px 14px', marginBottom: 14,
            fontSize: 12, fontWeight: 600, color: '#2E7D32', textAlign: 'center'
          }}>
            Parceiro da loja — pedidos chegam automaticamente
          </div>
        )}

        {/* Online status card */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: online ? 'linear-gradient(135deg, #E8F5E9, #C8E6C9)' : 'linear-gradient(135deg, #F5F5F5, #EEEEEE)',
          borderRadius: 14, padding: '10px 16px', marginBottom: 14
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 12, height: 12, borderRadius: '50%',
              background: online ? '#4CAF50' : '#BDBDBD',
              boxShadow: online ? '0 0 8px rgba(76,175,80,0.4)' : 'none',
              transition: 'all 0.3s'
            }} />
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: online ? '#2E7D32' : '#999' }}>
                {online ? 'Online' : 'Offline'}
              </div>
              <div style={{ fontSize: 11, color: '#888' }}>
                {online ? 'Recebendo chamadas' : 'Toque para ficar online'}
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

        {/* Earnings card */}
        {earnings.total > 0 && (
          <div style={{
            background: 'linear-gradient(135deg, #E3F2FD, #BBDEFB)',
            borderRadius: 14, padding: '14px 18px', marginBottom: 14,
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                background: 'white', display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 20
              }}>💰</div>
              <div>
                <div style={{ fontSize: 11, color: '#1565C0', fontWeight: 600 }}>Seus ganhos</div>
                <div style={{ fontSize: 22, fontWeight: 800, color: '#0D47A1' }}>R$ {earnings.total.toFixed(2)}</div>
              </div>
            </div>
            {earnings.pending > 0 && (
              <div style={{
                background: 'rgba(255,255,255,0.7)', borderRadius: 10,
                padding: '6px 12px', textAlign: 'center'
              }}>
                <div style={{ fontSize: 10, color: '#E65100' }}>a receber</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#BF360C' }}>R$ {earnings.pending.toFixed(2)}</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Tabs */}
      <div style={{
        display: 'flex', gap: 12, padding: '0 16px 12px',
        overflowX: 'auto', WebkitOverflowScrolling: 'touch', scrollbarWidth: 'none'
      }}>
        {[
          { key: 'available', label: isEmployee ? 'Pedidos da Loja' : 'Disponíveis' },
          { key: 'mine', label: 'Minhas' },
          { key: 'route', label: 'Rota' },
        ].map(tab => (
          <button key={tab.key}
            onClick={() => {
              setSelectedTab(tab.key);
              if (tab.key === 'route') optimizeRoute();
            }}
            style={{
              flex: '1 0 auto', padding: '10px 16px',
              border: 'none', borderRadius: 24,
              background: selectedTab === tab.key ? 'var(--primary)' : 'white',
              color: selectedTab === tab.key ? 'white' : '#666',
              fontSize: 13, fontWeight: selectedTab === tab.key ? 700 : 500,
              cursor: 'pointer', transition: 'all 0.2s',
              boxShadow: selectedTab === tab.key ? '0 2px 8px rgba(106,27,154,0.2)' : '0 1px 3px rgba(0,0,0,0.05)'
            }}>
            {tab.label}
          </button>
        ))}
      </div>

      {/* Content area */}
      <div style={{ padding: '0 16px' }}>
        {selectedTab === 'available' && (
          <>
            {availableOrders.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🛵</div>
                <p>{isEmployee ? 'Nenhum pedido pendente da loja' : 'Nenhum pedido disponível no momento'}</p>
              </div>
            ) : (
              availableOrders.map(order => (
                <div key={order.id} className="card" style={{ marginBottom: 10, padding: 14 }}>
                  <div className="flex-between" style={{ marginBottom: 6 }}>
                    <span style={{ fontWeight: 700, fontSize: 14 }}>#{order.id.slice(0, 8)}</span>
                    <span style={{ fontWeight: 700, color: 'var(--primary-dark)', fontSize: 15 }}>
                      R$ {order.total.toFixed(2)}
                    </span>
                  </div>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 4 }}>
                    🏪 {order.store_name}
                  </div>
                  <div style={{ fontSize: 13, color: '#666', marginBottom: 10 }}>
                    📍 {order.customer_address}
                  </div>
                  <div className="flex-between">
                    <span className="badge badge-success" style={{ fontSize: 11 }}>Pronto para retirada</span>
                    {!isEmployee && (
                      <button className="btn btn-sm btn-primary" onClick={() => acceptOrder(order.id)}>
                        Aceitar
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
            {myOrders.length === 0 ? (
              <div className="empty-state" style={{ padding: '40px 20px' }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>📋</div>
                <p>Aceite pedidos para começar</p>
              </div>
            ) : (
              myOrders.map(order => (
                <div key={order.id} className="card" style={{ marginBottom: 10, padding: 14 }}>
                  <div className="flex-between" style={{ marginBottom: 6 }}>
                    <div>
                      <span style={{ fontWeight: 700, fontSize: 14 }}>#{order.id.slice(0, 8)}</span>
                      <span style={{ fontSize: 12, color: '#888', marginLeft: 8 }}>{order.customer_name}</span>
                    </div>
                    <span className={`badge ${statusColors[order.status] || 'badge-primary'}`}>
                      {statusLabels[order.status] || order.status}
                    </span>
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 4 }}>
                    Retirar: {order.store_name}
                  </div>
                  <div style={{ fontSize: 12, color: '#888', marginBottom: 8 }}>
                    Entregar: {order.customer_address}
                  </div>

                  {(order.store_lat || order.customer_lat) && (
                    <div style={{ height: 160, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 8 }}>
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

                  <div className="flex-between" style={{ marginTop: 4 }}>
                    <span style={{ fontWeight: 700, color: 'var(--primary-dark)' }}>R$ {order.total.toFixed(2)}</span>
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
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary-dark)', marginBottom: 14 }}>Rota</div>
            {route ? (
              <div>
                {route.store && (
                  <div className="card" style={{ background: '#E8F5E9', marginBottom: 12, padding: 14 }}>
                    <div style={{ fontSize: 12, fontWeight: 700, color: '#2E7D32', marginBottom: 4 }}>Ponto de Partida</div>
                    <div style={{ fontWeight: 700 }}>{route.store.name}</div>
                    <div className="text-xs text-muted">{route.store.address}</div>
                  </div>
                )}
                <div className="card" style={{ background: '#E3F2FD', padding: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#1565C0', marginBottom: 10 }}>
                    Melhor ordem de entrega
                  </div>
                  {route.route.map((r, i) => (
                    <div key={r.id} style={{
                      display: 'flex', alignItems: 'center', gap: 12,
                      padding: '10px 0', borderBottom: i < route.route.length - 1 ? '1px solid #E0E0E0' : 'none'
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
                        <div style={{ fontWeight: 700, fontSize: 13 }}>{r.customer_name}</div>
                        <div style={{ fontSize: 11, color: '#888' }}>{r.customer_address}</div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="card" style={{ textAlign: 'center', padding: 24 }}>
                <div style={{ fontSize: 40, marginBottom: 8 }}>🗺️</div>
                <p style={{ marginBottom: 12 }}>Aceite pedidos para gerar a rota</p>
                <button className="btn btn-primary btn-sm" onClick={optimizeRoute}>
                  Gerar Rota
                </button>
              </div>
            )}
          </>
        )}

        {selectedTab === 'profile' && (
          <div className="card" style={{ padding: 18, textAlign: 'left' }}>
            <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary-dark)', marginBottom: 16 }}>Meu Perfil</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              {user?.photo_url ? (
                <img src={user.photo_url} alt="Foto"
                  style={{ width: 48, height: 48, borderRadius: '50%', objectFit: 'cover' }}
                  onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <div style={{
                  width: 48, height: 48, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #42A5F5, #1565C0)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 700, fontSize: 20
                }}>
                  {user?.name?.charAt(0)?.toUpperCase()}
                </div>
              )}
              <div>
                <div style={{ fontWeight: 800, fontSize: 15 }}>{user?.name}</div>
                <div style={{ fontSize: 12, color: '#888' }}>{user?.phone}</div>
              </div>
            </div>
            <div className="form-group">
              <label className="label">Chave PIX</label>
              <input className="input" type="text" value={pixKey}
                onChange={e => setPixKey(e.target.value)}
                placeholder="CPF, telefone, e-mail ou chave aleatória"
                style={{ fontSize: 14 }} />
              <span className="text-xs text-muted">Receba o valor das entregas nesta chave</span>
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
            <button className="btn btn-primary btn-sm" onClick={async () => {
              setPixSaving(true);
              try {
                localStorage.setItem('motoboy_pix_key', pixKey);
                const res = await apiFetch('/motoboy/profile', {
                  method: 'PATCH',
                  body: JSON.stringify({ pix_key: pixKey })
                });
                setPixMsg(res.ok ? 'Chave PIX salva!' : (res.error || 'Salvo localmente.'));
              } catch {
                localStorage.setItem('motoboy_pix_key', pixKey);
                setPixMsg('Chave PIX salva localmente!');
              }
              setPixSaving(false);
              setTimeout(() => setPixMsg(''), 3000);
            }} disabled={pixSaving} style={{ width: '100%' }}>
              {pixSaving ? 'Salvando...' : 'Salvar'}
            </button>
            <div onClick={logout} style={{
              textAlign: 'center', marginTop: 16, color: '#C62828',
              fontSize: 13, fontWeight: 600, cursor: 'pointer'
            }}>
              Sair da conta
            </div>
          </div>
        )}
      </div>

      {/* Bottom Navbar */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0,
        background: 'white', borderTop: '1px solid var(--border)',
        display: 'flex', justifyContent: 'space-around',
        padding: '8px 0', zIndex: 200,
        boxShadow: '0 -2px 10px rgba(0,0,0,0.04)'
      }}>
        {tabKeys.map(item => (
          <div key={item.key}
            onClick={() => {
              setSelectedTab(item.key);
              if (item.key === 'route') optimizeRoute();
            }}
            style={{
              display: 'flex', flexDirection: 'column', alignItems: 'center',
              gap: 2, cursor: 'pointer', padding: '4px 12px',
              color: selectedTab === item.key ? 'var(--primary)' : '#999',
              transition: 'color 0.2s'
            }}>
            <span style={{ fontSize: 20 }}>{item.icon}</span>
            <span style={{ fontSize: 10, fontWeight: selectedTab === item.key ? 700 : 500 }}>{item.label}</span>
          </div>
        ))}
      </div>
    </div>
  );
}
