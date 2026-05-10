import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';

const statusLabels = {
  assigned: 'Designado', picked_up: 'Retirado',
  in_transit: 'Em trânsito', arriving: 'Chegando', delivered: 'Entregue'
};

const statusColors = {
  assigned: 'badge-primary', picked_up: 'badge-info',
  in_transit: 'badge-info', arriving: 'badge-accent', delivered: 'badge-success'
};

const nextStatus = {
  assigned: 'picked_up',
  picked_up: 'in_transit',
  in_transit: 'arriving',
  arriving: 'delivered'
};

const nextStatusLabel = {
  assigned: 'Retirei o pedido',
  picked_up: 'Indo entregar',
  in_transit: 'Chegando',
  arriving: 'Entregue'
};

export default function MotoboyDashboard() {
  const { user, apiFetch, logout } = useAuth();
  const { socket, setToast } = useSocket();
  const [availableOrders, setAvailableOrders] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [store, setStore] = useState(null);
  const [route, setRoute] = useState(null);
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [selectedTab, setSelectedTab] = useState('available');

  useEffect(() => {
    loadData();
    apiFetch('/stores').then(d => {
      if (d.data && d.data.length > 0) setStore(d.data[0]);
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
      setMyOrders(mine.data.filter(o => o.motoboy_id === user?.id && !['delivered','cancelled'].includes(o.status)));
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
      <div className="header" style={{ background: 'linear-gradient(135deg, #1565C0, #0D47A1)' }}>
        <div className="flex-row">
          {store?.logo && (
            <img src={store.logo} alt="Logo" style={{ width: 36, height: 36, borderRadius: 8, objectFit: 'contain' }} />
          )}
          <div>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Olá, {user?.name?.split(' ')[0]}</div>
            <div className="header-title">Entregas</div>
          </div>
        </div>
        <div className="flex-row">
          <div className="toggle-switch" onClick={() => {
            setOnline(!online);
            if (!online) sendLocation();
          }}>
            <input type="checkbox" checked={online} readOnly />
            <span className="toggle-slider" />
          </div>
          <span style={{ fontSize: 12, color: 'white' }}>{online ? 'Online' : 'Offline'}</span>
          <button className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 12 }}
            onClick={logout}>Sair</button>
        </div>
      </div>

      <div className="container">
        <div className="flex-row" style={{ marginBottom: 16 }}>
          <button className={`btn btn-sm ${selectedTab === 'available' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setSelectedTab('available')}>
            Disponíveis ({availableOrders.length})
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
                <p>Nenhum pedido disponível no momento</p>
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
                    <button className="btn btn-sm btn-primary" onClick={() => acceptOrder(order.id)}>
                      Aceitar Entrega
                    </button>
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
      </div>
    </div>
  );
}
