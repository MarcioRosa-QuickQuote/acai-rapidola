import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import RoutePolyline from '../components/RouteMap';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

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
  const arrivingText = order.status === 'arriving' ? 'O motoboy está chegando! Fique atento!' : '';
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

        {(motoboyPos || order.status === 'picked_up' || order.status === 'arriving') && order.status !== 'delivered' && (
          <div className="card">
            <div className="flex-between" style={{ marginBottom: 8 }}>
              <h3 style={{ color: 'var(--primary)', fontSize: 16 }}>
                {motoboyPos?.name || 'Motoboy'}
              </h3>
              {eta !== null && (
                <span style={{ background: '#E3F2FD', padding: '4px 10px', borderRadius: 8, fontWeight: 700, color: '#1565C0', fontSize: 13 }}>
                  ~{eta} min
                </span>
              )}
            </div>

            {order.store_lat && order.customer_lat && (
              <div style={{ height: 220, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 8 }}>
                <MapContainer
                  center={[(order.store_lat + order.customer_lat) / 2, ((order.store_lng || 0) + (order.customer_lng || 0)) / 2]}
                  zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                  <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker position={[order.store_lat, order.store_lng]} icon={L.divIcon({ html: '<img src="/logo_placa.png" style="width:44px;height:44px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5))"/>', className: '', iconSize: [44, 44], iconAnchor: [22, 22] })} />
                  <Marker position={[order.customer_lat, order.customer_lng]} />
                  <RoutePolyline from={{ lat: order.store_lat, lng: order.store_lng }} to={{ lat: order.customer_lat, lng: order.customer_lng }} />
                </MapContainer>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StoreLogo logo={order.store_logo} />
                <span className="text-xs" style={{ color: '#888' }}>Loja</span>
              </div>
              <span className="text-xs" style={{ color: '#888' }}>↓ {order.customer_address}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CustomerAvatar photo={user?.photo_url} />
                <span className="text-xs" style={{ color: '#888' }}>Você</span>
              </div>
            </div>

            <div style={{ marginTop: 8, fontSize: 13, color: '#888' }}>
              {order.status === 'picked_up' && 'Motoboy saiu da loja com seu açaí!'}
              {order.status === 'arriving' && 'O motoboy está chegando! Fique atento!'}
              {order.status === 'picked_up' || order.status === 'arriving' ? '' : 'Aguardando...'}
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
