import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';

const statusSteps = ['pending', 'preparing', 'picked_up', 'delivered'];
const statusLabels = {
  pending: 'Pedido feito', confirmed: 'Pedido feito', preparing: 'Preparando',
  ready: 'Preparando', assigned: 'Preparando',
  picked_up: 'Saiu pra entrega', in_transit: 'Saiu pra entrega',
  arriving: 'Saiu pra entrega', delivered: 'Entregue'
};

function CustomerAvatar({ photo }) {
  const [showFallback, setShowFallback] = useState(!photo);
  if (showFallback) {
    return (
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1565C0',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
        </svg>
      </div>
    );
  }
  return (
    <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#1565C0' }}>
      <img src={photo} alt="Você" style={{ width: 36, height: 36, objectFit: 'cover' }}
        onError={() => setShowFallback(true)} />
    </div>
  );
}

function StoreLogo({ logo }) {
  const [showFallback, setShowFallback] = useState(!logo);
  if (showFallback) {
    return (
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#2E7D32',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>L</span>
      </div>
    );
  }
  return (
    <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#2E7D32' }}>
      <img src={logo} alt="Loja" style={{ width: 36, height: 36, objectFit: 'cover' }}
        onError={() => setShowFallback(true)} />
    </div>
  );
}

export default function CustomerTracking() {
  const { id } = useParams();
  const { user, apiFetch } = useAuth();
  const { socket, joinOrder } = useSocket();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [motoboyPos, setMotoboyPos] = useState(null);
  const [eta, setEta] = useState(null);

  useEffect(() => {
    joinOrder(id);
    loadOrder();

    const interval = setInterval(loadOrder, 5000);
    return () => { clearInterval(interval); };
  }, [id]);

  useEffect(() => {
    if (!socket) return;
    socket.on('order_status', (data) => {
      if (data.orderId === id) {
        setOrder(prev => prev ? { ...prev, status: data.status } : prev);
      }
    });
    socket.on('motoboy_location', (data) => {
      if (data.orderId === id) {
        setMotoboyPos({ lat: data.lat, lng: data.lng, name: data.motoboyName });
        if (data.lat && data.lng && order) {
          const dist = Math.sqrt(
            Math.pow(data.lat - (order.customer_lat || -23.55), 2) +
            Math.pow(data.lng - (order.customer_lng || -46.63), 2)
          ) * 111;
          setEta(Math.round(dist * 3));
        }
      }
    });
    return () => {
      socket.off('order_status');
      socket.off('motoboy_location');
    };
  }, [socket, id, order]);

  async function loadOrder() {
    const data = await apiFetch(`/orders/${id}`);
    if (data.id) {
      setOrder(data);
      if (data.motoboy_id) {
        const locData = await apiFetch(`/motoboy/location/${data.motoboy_id}`);
        if (locData.lat) {
          setMotoboyPos({ lat: locData.lat, lng: locData.lng });
        }
      }
    }
  }

  if (!order) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <img className="spin" src="/saco_acai.png" />
    </div>
  );

  const stepMap = { pending:0, confirmed:0, preparing:1, ready:1, assigned:1, picked_up:2, in_transit:2, arriving:2, delivered:3 };
  const currentStep = stepMap[order.status] ?? 0;

  return (
    <div>
      <div className="header">
        <div className="header-left">
          <button className="btn btn-sm"
            style={{ background: 'var(--border)', color: 'var(--primary-dark)', fontSize: 13, fontWeight: 700 }}
            onClick={() => navigate('/customer')}>
            Voltar
          </button>
        </div>
        <div className="header-title">Acompanhar</div>
        <div className="header-right" />
      </div>

      <div className="container">
        <div className="card">
          <div className="flex-between" style={{ marginBottom: 12 }}>
            <span className="text-sm text-muted">Pedido #{order.id.slice(0, 8)}</span>
            <span className={`badge ${order.payment_status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
              {order.payment_status === 'paid' ? 'Pago' : 'Pendente'}
            </span>
          </div>

          <div className="order-status-bar">
            {statusSteps.map((step, i) => {
              const done = i <= currentStep;
              const isCurrent = i === currentStep;
              return (
                <div key={step} className="order-status-step">
                  <div className={`order-status-dot ${done ? (isCurrent ? 'current' : 'active') : ''}`} />
                  <span className="text-xs" style={{
                    color: done ? (isCurrent ? 'var(--primary)' : 'var(--secondary)') : 'var(--text-light)',
                    fontWeight: done ? 700 : 400,
                    textAlign: 'center'
                  }}>
                    {statusLabels[step]}
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {motoboyPos && order.status !== 'delivered' && (
          <div className="card">
            <h3 style={{ color: 'var(--primary)', marginBottom: 8, fontSize: 16 }}>
              Seu Motoboy: {motoboyPos.name || 'A caminho'}
            </h3>

            <div className="map-container" style={{ position: 'relative', background: '#E8F5E9' }}>
              <div style={{ padding: 16, textAlign: 'center' }}>
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 12, marginBottom: 12 }}>
                  <div style={{ textAlign: 'center' }}>
                    <StoreLogo logo={order.store_logo} />
                    <div className="text-xs" style={{ marginTop: 2 }}>Loja</div>
                  </div>

                  <div style={{
                    flex: 1, height: 3, background: 'var(--border)',
                    position: 'relative', maxWidth: 150
                  }}>
                    {motoboyPos && (
                      <div style={{
                        position: 'absolute', top: '50%',
                        left: `${Math.min(90, Math.max(10, Math.random() * 100))}%`,
                        transform: 'translate(-50%, -50%)'
                      }}>
                        <img src="/saco_acai.png" style={{
                          width: 32, height: 32, objectFit: 'contain'
                        }} />
                      </div>
                    )}
                  </div>

                  <div style={{ textAlign: 'center' }}>
                    <CustomerAvatar photo={user?.photo_url} />
                    <div className="text-xs" style={{ marginTop: 2 }}>Você</div>
                  </div>
                </div>

                {eta !== null && (
                  <div style={{
                    background: '#E3F2FD', padding: '8px 16px', borderRadius: 8,
                    display: 'inline-block', marginTop: 4
                  }}>
                    <span className="font-bold" style={{ color: '#1565C0' }}>
                      ~{eta} min
                    </span>
                    <span className="text-sm text-muted"> para chegar</span>
                  </div>
                )}
              </div>
            </div>

            <div className="text-center mt-2">
              <p className="text-sm text-muted">
                {order.status === 'picked_up' && 'Motoboy saiu da loja com seu açaí!'}
                {order.status === 'in_transit' && 'Seu açaí está a caminho!'}
                {order.status === 'arriving' && 'O motoboy está chegando! Fique atento!'}
                {order.status === 'picked_up' || order.status === 'in_transit' || order.status === 'arriving'
                  ? '' : 'Aguardando motoboy retirar o pedido...'}
              </p>
            </div>
          </div>
        )}

        <div className="card">
          <h3 className="text-sm font-bold text-muted mb-2">Detalhes</h3>
          <div className="flex-between text-sm" style={{ marginTop: 4 }}>
            <span>Loja:</span>
            <span className="font-bold">{order.store_name}</span>
          </div>
          <div className="flex-between text-sm" style={{ marginTop: 4 }}>
            <span>Endereço:</span>
            <span>{order.customer_address}</span>
          </div>
          <div className="flex-between text-sm" style={{ marginTop: 4 }}>
            <span>Total:</span>
            <span className="font-bold" style={{ color: 'var(--primary)' }}>R$ {order.total.toFixed(2)}</span>
          </div>
          <div className="flex-between text-sm" style={{ marginTop: 4 }}>
            <span>Pedido em:</span>
            <span>{new Date(order.created_at).toLocaleString('pt-BR')}</span>
          </div>
          {order.items && (
            <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              {order.items.map((item, i) => (
                <div key={i} className="flex-between text-sm" style={{ marginTop: 2 }}>
                  <span>{item.quantity}x {item.product_name} ({item.size_ml}ml)</span>
                  <span>R$ {(item.unit_price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
