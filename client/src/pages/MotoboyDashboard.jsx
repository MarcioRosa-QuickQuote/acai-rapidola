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
  const [editName, setEditName] = useState('');
  const [editCpf, setEditCpf] = useState('');
  const [editPlate, setEditPlate] = useState('');

  function maskCpf(v) {
    const nums = v.replace(/\D/g, '').slice(0, 11);
    return nums.replace(/^(\d{3})(\d{3})?(\d{3})?(\d{2})?$/, (_, a, b, c, d) =>
      a + (b ? '.' + b : '') + (c ? '.' + c : '') + (d ? '-' + d : '')
    );
  }
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [selectedTab, setSelectedTab] = useState('available');
  const [pageTab, setPageTab] = useState('inicio');
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

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <img className="spin" src="/saco_acai.png" />
    </div>
  );

  const tabs = [
    { key: 'inicio', label: 'Início', icon: '🏠' },
    { key: 'pedidos', label: 'Pedidos', icon: '📋' },
    { key: 'saldo', label: 'Saldo', icon: '💰' },
    { key: 'perfil', label: 'Perfil', icon: '👤' },
  ];

  function renderInicio() {
    return (
      <>
        <div className="card" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: online ? 'linear-gradient(135deg, #E8F5E9, #C8E6C9)' : 'linear-gradient(135deg, #F5F5F5, #EEEEEE)',
          marginBottom: 16,
          border: online ? '1px solid #A6D7A7' : '1px solid #E0E0E0'
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{ width: 12, height: 12, borderRadius: '50%',
              background: online ? '#2E7D32' : '#BDBDBD',
              boxShadow: online ? '0 0 0 3px rgba(46,125,50,0.2), 0 0 8px rgba(46,125,50,0.3)' : 'none' }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: online ? '#1B5E20' : '#757575' }}>
                {online ? 'Online - Aceitando entregas' : 'Offline'}
              </div>
              <div style={{ fontSize: 11, color: online ? '#2E7D32' : '#999', marginTop: 1 }}>
                {online ? 'Você está disponível para receber corridas' : 'Ative para receber pedidos'}
              </div>
            </div>
          </div>
          <div className="toggle-switch" onClick={() => { setOnline(!online); if (!online) sendLocation(); }}>
            <input type="checkbox" checked={online} readOnly />
            <span className="toggle-slider" />
          </div>
        </div>
        {isEmployee ? (
          <div className="card" style={{ background: '#E8F5E9', border: '1px solid #C8E6C9', textAlign: 'center', marginBottom: 12 }}>
            <span style={{ fontWeight: 600, color: '#2E7D32', fontSize: 13 }}>
              Você é parceiro desta loja — os pedidos chegam automaticamente
            </span>
          </div>
        ) : availableOrders.length === 0 ? (
          <div className="card empty-state" style={{ paddingTop: 40, paddingBottom: 40 }}>
            <div className="empty-state-icon">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <circle cx="32" cy="28" r="16" stroke="var(--border)" strokeWidth="2"/>
                <path d="M32 20v8l5 5" stroke="var(--border)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <p>Nenhum pedido disponível no momento</p>
          </div>
        ) : (
          availableOrders.map(order => (
            <div key={order.id} className="card">
              <div className="flex-between" style={{ marginBottom: 6 }}>
                <div>
                  <span className="font-bold">#{order.id.slice(0, 8)}</span>
                  <span className="text-sm text-muted" style={{ marginLeft: 8 }}>{order.customer_name}</span>
                </div>
                <span className="badge badge-success">R$ {order.total.toFixed(2)}</span>
              </div>
              <div className="text-sm text-muted" style={{ marginBottom: 6 }}>Loja: {order.store_name}</div>
              <div className="text-sm text-muted" style={{ marginBottom: 8 }}>Entrega: {order.customer_address}</div>
              <div className="flex-between">
                <span className={`badge ${statusColors[order.status] || 'badge-primary'}`}>{statusLabels[order.status] || order.status}</span>
                {!isEmployee && (
                  <button className="btn btn-sm btn-primary" onClick={() => acceptOrder(order.id)}>Aceitar Entrega</button>
                )}
              </div>
            </div>
          ))
        )}
      </>
    );
  }

  function renderPedidos() {
    if (myOrders.length === 0) {
      return (
        <div className="empty-state" style={{ paddingTop: 40 }}>
          <div className="empty-state-icon">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <path d="M20 48V24l8-12h8l8 12v24" stroke="var(--border)" strokeWidth="2" strokeLinejoin="round"/>
              <circle cx="32" cy="36" r="4" stroke="var(--border)" strokeWidth="2"/>
            </svg>
          </div>
          <p>Nenhum pedido ainda</p>
        </div>
      );
    }
    return myOrders.map(order => (
      <div key={order.id} className="card" style={{ cursor: 'pointer' }}
        onClick={() => setSelectedTab(order.id === selectedTab ? null : order.id)}>
        <div className="flex-between" style={{ marginBottom: 6 }}>
          <div>
            <span className="font-bold">#{order.id.slice(0, 8)}</span>
            <span className="text-sm text-muted" style={{ marginLeft: 8 }}>{order.customer_name}</span>
          </div>
          <span className={`badge ${statusColors[order.status] || 'badge-primary'}`}>{statusLabels[order.status] || order.status}</span>
        </div>
        <div className="text-sm text-muted" style={{ marginBottom: 6 }}>Retirar: {order.store_name}</div>
        <div className="text-sm text-muted" style={{ marginBottom: 8 }}>Entregar: {order.customer_address}</div>
        {selectedTab === order.id && order.store_lat && order.customer_lat && (
          <div style={{ height: 200, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 8 }}>
            <MapContainer center={[(order.store_lat + order.customer_lat) / 2, ((order.store_lng || 0) + (order.customer_lng || 0)) / 2]}
              zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
              <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              {order.store_lat && order.store_lng && <Marker position={[order.store_lat, order.store_lng]} />}
              {order.customer_lat && order.customer_lng && <Marker position={[order.customer_lat, order.customer_lng]} />}
              {order.store_lat && order.store_lng && order.customer_lat && order.customer_lng && (
                <Polyline positions={[[order.store_lat, order.store_lng], [order.customer_lat, order.customer_lng]]}
                  pathOptions={{ color: '#1565C0', weight: 3, dashArray: '8 4' }} />
              )}
            </MapContainer>
          </div>
        )}
        <div className="flex-between" style={{ marginTop: 8 }}>
          <span className="badge badge-success">R$ {order.total.toFixed(2)}</span>
          {nextStatus[order.status] && (
            <button className="btn btn-sm btn-primary" onClick={(e) => { e.stopPropagation(); updateStatus(order.id); }}>
              {nextStatusLabel[order.status]}
            </button>
          )}
        </div>
      </div>
    ));
  }

  function renderSaldo() {
    const dailyTotal = earnings?.list?.reduce((s, e) => s + e.amount, 0) || earnings.total || 0;
    return (
      <div style={{ textAlign: 'center' }}>
        <div className="card" style={{
          background: 'linear-gradient(135deg, #1565C0, #0D47A1)',
          color: 'white', marginBottom: 16
        }}>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>Seus ganhos</div>
          <div style={{ fontSize: 42, fontWeight: 800, marginBottom: 4 }}>R$ {dailyTotal.toFixed(2)}</div>
          <div style={{ fontSize: 12, opacity: 0.7 }}>Total acumulado</div>
          {earnings.pending > 0 && (
            <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px 16px', display: 'inline-block' }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>A receber: </span>
              <span style={{ fontWeight: 700 }}>R$ {earnings.pending.toFixed(2)}</span>
            </div>
          )}
        </div>
        {earnings?.list?.length > 0 && (
          <div className="card" style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: '#1565C0' }}>Histórico</div>
            {earnings.list.slice(-10).reverse().map((e, i) => (
              <div key={i} className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid #F5F5F5', fontSize: 13 }}>
                <span>R$ {e.amount.toFixed(2)}</span>
                <span className={e.status === 'paid' ? 'badge badge-success' : 'badge badge-warning'}>
                  {e.status === 'paid' ? 'Pago' : 'Pendente'}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    );
  }

  function renderPerfil() {
    return (
      <div className="card" style={{ textAlign: 'left' }}>
        <div className="page-title" style={{ fontSize: 20 }}>Meu Perfil</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <label style={{ cursor: 'pointer', position: 'relative' }}>
            {user?.photo_url ? (
              <img src={user.photo_url} alt="Foto" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }}
                onError={e => { e.target.style.display = 'none'; }} />
            ) : (
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #42A5F5, #1565C0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 24 }}>
                {user?.name?.charAt(0)?.toUpperCase()}
              </div>
            )}
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const formData = new FormData();
                formData.append('image', file);
                const res = await fetch('/api/products/upload-image', {
                  method: 'POST',
                  headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
                  body: formData
                });
                const data = await res.json();
                if (data.url) {
                  await apiFetch('/auth/profile', { method: 'PATCH', body: JSON.stringify({ photo_url: data.url }) });
                  window.location.reload();
                }
              }} />
            <div style={{ fontSize: 9, color: '#888', textAlign: 'center', marginTop: 2 }}>Alterar foto</div>
          </label>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{user?.name}</div>
            <div style={{ fontSize: 12, color: '#888' }}>Motoboy</div>
          </div>
        </div>
        <div className="form-group">
          <label className="label">Nome</label>
          <input className="input" type="text" value={editName || user?.name || ''}
            onChange={e => setEditName(e.target.value)} placeholder="Seu nome" />
        </div>
        <div className="form-group"><label className="label">Telefone</label><div style={{ fontWeight: 600 }}>{user?.phone}</div></div>
        <div className="form-group">
          <label className="label">CPF</label>
          <input className="input" type="text" value={editCpf}
            onChange={e => setEditCpf(maskCpf(e.target.value))} placeholder="000.000.000-00" maxLength={14} />
        </div>
        <div className="form-group">
          <label className="label">Placa da moto</label>
          <input className="input" type="text" value={editPlate}
            onChange={e => setEditPlate(e.target.value.toUpperCase().slice(0, 8))} placeholder="ABC-1234" />
        </div>
        <div className="form-group">
          <label className="label">Chave PIX</label>
          <input className="input" type="text" value={pixKey} onChange={e => setPixKey(e.target.value)}
            placeholder="CPF, telefone, e-mail ou chave aleatoria" />
        </div>
        <div className="form-group">
          <label className="label">CPF</label>
          <input className="input" type="text" placeholder="000.000.000-00" />
        </div>
        <div className="form-group">
          <label className="label">Placa da moto</label>
          <input className="input" type="text" placeholder="ABC-1234" />
        </div>
        {pixMsg && <div style={{ fontSize: 13, fontWeight: 600, padding: '10px 14px', borderRadius: 8, marginBottom: 12,
          background: pixMsg.includes('Erro') ? '#FFEBEE' : '#E8F5E9', color: pixMsg.includes('Erro') ? '#C62828' : '#2E7D32' }}>{pixMsg}</div>}
        <button className="btn btn-primary" onClick={async () => {
          setPixSaving(true);
          try {
            localStorage.setItem('motoboy_pix_key', pixKey);
            const body = { pix_key: pixKey };
            if (editName) body.name = editName;
            if (editCpf.replace(/\D/g, '').length === 11) body.cpf = editCpf;
            const res = await apiFetch('/motoboy/profile', { method: 'PATCH', body: JSON.stringify(body) });
            setPixMsg(res.ok ? 'Salvo com sucesso!' : (res.error || 'Erro ao salvar'));
            if (res.ok && editName) { user.name = editName; window.location.reload(); }
          } catch { localStorage.setItem('motoboy_pix_key', pixKey); setPixMsg('Salvo localmente!'); }
          setPixSaving(false);
          setTimeout(() => setPixMsg(''), 4000);
        }} disabled={pixSaving}>{pixSaving ? 'Salvando...' : 'Salvar'}</button>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div className="header">
        <div className="header-left" style={{ gap: 10 }}>
          <img src="/logomarca.png" alt="Pé de Açaí" style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'contain', flexShrink: 0 }} />
          <div>
            <div className="header-title" style={{ fontSize: 18 }}>Pé de Açaí</div>
            <div style={{ fontSize: 11, color: 'var(--text-light)' }}>Motoboy</div>
          </div>
        </div>
        <div className="header-right">
          <div style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer' }}
            onClick={() => setPageTab('perfil')}>
            {user?.photo_url ? (
              <img src={user.photo_url} alt="Foto"
                style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                onError={e => { e.target.style.display = 'none'; }} />
            ) : (
              <div style={{
                width: 42, height: 42, borderRadius: '50%',
                background: 'linear-gradient(135deg, #42A5F5, #1565C0)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 700, fontSize: 18, flexShrink: 0
              }}>
                {user?.name?.charAt(0)?.toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)' }}>{user?.name?.split(' ')[0]}</div>
              <div onClick={(e) => { e.stopPropagation(); logout(); }}
                style={{ fontSize: 12, color: 'var(--text-light)', cursor: 'pointer' }}>
                Sair
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ flex: 1, paddingBottom: 80 }}>
        {pageTab === 'inicio' && renderInicio()}
        {pageTab === 'pedidos' && renderPedidos()}
        {pageTab === 'saldo' && renderSaldo()}
        {pageTab === 'perfil' && renderPerfil()}
      </div>

      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 300,
        background: 'white', borderTop: '1px solid var(--border)',
        display: 'flex', padding: '6px 0', paddingBottom: 'env(safe-area-inset-bottom, 6px)'
      }}>
        {tabs.map(tab => (
          <button key={tab.key}
            onClick={() => setPageTab(tab.key)}
            style={{
              flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2,
              padding: '6px 0', border: 'none', background: 'none', cursor: 'pointer',
              opacity: pageTab === tab.key ? 1 : 0.4, transition: 'opacity 0.2s'
            }}>
            <span style={{ fontSize: 22 }}>{tab.icon}</span>
            <span style={{
              fontSize: 11, fontWeight: pageTab === tab.key ? 700 : 500,
              color: pageTab === tab.key ? 'var(--primary)' : '#999'
            }}>
              {tab.label}
            </span>
          </button>
        ))}
      </div>
    </div>
  );
}
