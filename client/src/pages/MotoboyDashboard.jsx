import { useState, useEffect, useMemo } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
import RoutePolyline, { useRoute, NavSteps } from '../components/RouteMap';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const statusLabels = {
  assigned: 'Retirar na loja', picked_up: 'Saiu pra entrega',
  arriving: 'Chegando!', delivered: 'Entregue'
};

const statusColors = {
  assigned: 'badge-primary', picked_up: 'badge-info',
  arriving: 'badge-accent', delivered: 'badge-success'
};

const nextStatus = {
  assigned: 'picked_up',
  picked_up: 'delivered'
};

const nextStatusLabel = {
  assigned: 'Retirei o pedido',
  picked_up: 'Entregue'
};

function FollowMotoboy({ pos, follow }) {
  const map = useMap();
  useEffect(() => {
    if (follow && pos) map.setView([pos.lat, pos.lng], map.getZoom(), { animate: true });
  }, [pos?.lat, pos?.lng, follow]);
  return null;
}

function NavScreen({ order, onClose, onStatusUpdate, statusLabel }) {
  const [pos, setPos] = useState(null);
  const [follow, setFollow] = useState(true);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [navStarted, setNavStarted] = useState(false);

  const isToStore = order.status === 'assigned';

  const { steps, totalDist, totalDur } = useRoute(
    { lat: order.store_lat, lng: order.store_lng },
    { lat: order.customer_lat, lng: order.customer_lng }
  );

  useEffect(() => {
    if (!navigator.geolocation) return;
    const watch = navigator.geolocation.watchPosition(
      p => setPos({ lat: p.coords.latitude, lng: p.coords.longitude }),
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 }
    );
    return () => navigator.geolocation.clearWatch(watch);
  }, []);

  const step = steps[currentStepIdx];
  const remaining = steps.slice(currentStepIdx).reduce((s, st) => s + st.dist, 0);
  const hasRoute = order.store_lat && order.customer_lat;
  const mapCenter = pos
    ? [pos.lat, pos.lng]
    : [(order.store_lat + order.customer_lat) / 2 || -1.45, (order.store_lng + order.customer_lng) / 2 || -48.5];

  const motoboyIcon = useMemo(() => L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#1565C0" stroke="white" stroke-width="3"/><polygon points="20,8 28,28 20,23 12,28" fill="white"/></svg>`,
    className: '', iconSize: [40, 40], iconAnchor: [20, 20]
  }), []);

  const destIcon = useMemo(() => L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><ellipse cx="14" cy="14" rx="14" ry="14" fill="#4A148C"/><line x1="14" y1="26" x2="14" y2="36" stroke="#4A148C" stroke-width="3"/><circle cx="14" cy="14" r="6" fill="white"/></svg>`,
    className: '', iconSize: [28, 36], iconAnchor: [14, 36]
  }), []);

  const storeIcon = useMemo(() => L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><ellipse cx="14" cy="14" rx="14" ry="14" fill="#1565C0"/><line x1="14" y1="26" x2="14" y2="36" stroke="#1565C0" stroke-width="3"/><text x="14" y="19" text-anchor="middle" font-size="14" fill="white">🏪</text></svg>`,
    className: '', iconSize: [28, 36], iconAnchor: [14, 36]
  }), []);

  // ── OVERVIEW (igual tela 1 do Waze) ──────────────────────────────────────
  if (!navStarted) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
        {hasRoute && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <MapContainer center={mapCenter} zoom={14} style={{ width: '100%', height: '100%' }}
              zoomControl={false} key={`ov-${order.id}`}>
              <TileLayer
                attribution='&copy; <a href="https://carto.com">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              />
              {pos && <Marker position={[pos.lat, pos.lng]} icon={motoboyIcon} />}
              <Marker position={[order.customer_lat, order.customer_lng]} icon={destIcon} />
              {order.store_lat && <Marker position={[order.store_lat, order.store_lng]} icon={storeIcon} />}
              <RoutePolyline from={{ lat: order.store_lat, lng: order.store_lng }}
                to={{ lat: order.customer_lat, lng: order.customer_lng }}
                color="#4A148C" weight={8} />
            </MapContainer>
          </div>
        )}

        {/* Voltar */}
        <div onClick={onClose} style={{
          position: 'absolute', top: 48, left: 16, zIndex: 20,
          width: 40, height: 40, borderRadius: 20, background: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#333"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </div>

        {/* Label de rota */}
        <div style={{
          position: 'absolute', top: 48, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
          background: 'white', borderRadius: 20, padding: '8px 18px',
          fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)', color: '#333'
        }}>
          {isToStore ? 'Sua localização' : (order.store_name || 'Loja')} → {isToStore ? (order.store_name || 'Loja') : order.customer_name}
        </div>

        {/* Painel inferior */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
          background: 'white', borderRadius: '24px 24px 0 0',
          padding: '20px 20px 40px', boxShadow: '0 -4px 30px rgba(0,0,0,0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
            <div style={{ fontSize: 42, fontWeight: 900, color: '#111' }}>
              {totalDur > 0 ? `${totalDur} min` : '-- min'}
            </div>
            <div style={{ fontSize: 20, color: '#888', fontWeight: 600 }}>
              {totalDist > 0 ? `${(totalDist / 1000).toFixed(1)} km` : ''}
            </div>
          </div>
          <div style={{ fontSize: 14, color: '#444', fontWeight: 500, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isToStore
              ? `Por ${order.store_address || order.store_name || 'loja'}`
              : `Por ${order.customer_address || order.customer_name}`}
          </div>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
            {isToStore ? 'Retirar pedido na loja' : 'Melhor rota, Trânsito normal'}
          </div>
          <div style={{ display: 'flex', gap: 12 }}>
            <button style={{
              flex: 1, padding: '15px 0', borderRadius: 32, border: 'none',
              background: '#F5F5F5', fontSize: 16, fontWeight: 700, color: '#555', cursor: 'pointer'
            }} onClick={onClose}>Sair depois</button>
            <button style={{
              flex: 2, padding: '15px 0', borderRadius: 32, border: 'none',
              background: '#1565C0', fontSize: 17, fontWeight: 800, color: 'white', cursor: 'pointer'
            }} onClick={() => setNavStarted(true)}>Ir agora</button>
          </div>
        </div>
      </div>
    );
  }

  // ── NAVEGAÇÃO ATIVA (igual tela 2 do Waze) ───────────────────────────────
  const instrBg = isToStore ? '#1565C0' : '#4A148C';

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
      {/* Mapa */}
      {hasRoute && (
        <div style={{ position: 'absolute', inset: 0 }}>
          <MapContainer center={mapCenter} zoom={17} style={{ width: '100%', height: '100%' }}
            scrollWheelZoom zoomControl={false} key={`nav-${order.id}`}>
            <TileLayer
              attribution='&copy; <a href="https://carto.com">CARTO</a>'
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
            />
            <Marker position={[order.customer_lat, order.customer_lng]} icon={destIcon} />
            {order.store_lat && <Marker position={[order.store_lat, order.store_lng]} icon={storeIcon} />}
            {pos && <Marker position={[pos.lat, pos.lng]} icon={motoboyIcon} />}
            <RoutePolyline from={{ lat: order.store_lat, lng: order.store_lng }}
              to={{ lat: order.customer_lat, lng: order.customer_lng }}
              color="#4A148C" weight={8} />
            {pos && <FollowMotoboy pos={pos} follow={follow} />}
          </MapContainer>
        </div>
      )}

      {/* Barra de instrução no topo (estilo Waze) */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 25,
        background: instrBg, padding: '44px 20px 16px'
      }}>
        {isToStore ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, background: 'rgba(255,255,255,0.2)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26
            }}>🏪</div>
            <div>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13 }}>Primeiro, vá até</div>
              <div style={{ color: 'white', fontWeight: 800, fontSize: 20, lineHeight: 1.2 }}>
                {order.store_name || 'Loja'} — Retirar pedido
              </div>
            </div>
          </div>
        ) : step ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 14 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, background: 'rgba(255,255,255,0.15)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              fontSize: 26, flexShrink: 0
            }}>{step.icon}</div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 13, marginBottom: 2 }}>
                {remaining < 1000 ? `${remaining} m` : `${(remaining / 1000).toFixed(1)} km`}
              </div>
              <div style={{
                color: 'white', fontWeight: 800, fontSize: 20, lineHeight: 1.2,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                {step.street || step.text}
              </div>
              {step.street && step.street !== step.text && (
                <div style={{ color: 'rgba(255,255,255,0.65)', fontSize: 13, marginTop: 2 }}>{step.text}</div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ color: 'white', fontWeight: 800, fontSize: 18 }}>
            Chegando em {order.customer_name}…
          </div>
        )}

        {/* Bolinhas de progresso */}
        {!isToStore && steps.length > 1 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 12, justifyContent: 'center' }}>
            {steps.map((_, i) => (
              <div key={i} style={{
                width: i === currentStepIdx ? 20 : 6, height: 4, borderRadius: 2,
                background: i === currentStepIdx ? 'white' : 'rgba(255,255,255,0.3)',
                transition: 'all 0.3s'
              }} />
            ))}
          </div>
        )}
      </div>

      {/* Botão voltar (dentro da barra colorida) */}
      <div onClick={() => setNavStarted(false)} style={{
        position: 'absolute', top: 10, left: 12, zIndex: 30,
        width: 34, height: 34, borderRadius: 17, background: 'rgba(255,255,255,0.22)',
        display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
      }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
      </div>

      {/* Navegação passo (botões ↑↓ laterais, só ao entregar) */}
      {!isToStore && steps.length > 1 && (
        <div style={{
          position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)',
          zIndex: 22, display: 'flex', flexDirection: 'column', gap: 8
        }}>
          {currentStepIdx > 0 && (
            <div style={{
              width: 38, height: 38, borderRadius: 19, background: 'rgba(255,255,255,0.92)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.2)', fontSize: 16
            }} onClick={() => setCurrentStepIdx(i => Math.max(0, i - 1))}>↑</div>
          )}
          {currentStepIdx < steps.length - 1 && (
            <div style={{
              width: 38, height: 38, borderRadius: 19, background: 'rgba(255,255,255,0.92)',
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              cursor: 'pointer', boxShadow: '0 2px 6px rgba(0,0,0,0.2)', fontSize: 16
            }} onClick={() => setCurrentStepIdx(i => Math.min(steps.length - 1, i + 1))}>↓</div>
          )}
        </div>
      )}

      {/* Barra inferior estilo Waze */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
        background: 'white', padding: '14px 16px 32px',
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 -2px 20px rgba(0,0,0,0.15)'
      }}>
        {/* Re-center */}
        <div onClick={() => setFollow(f => !f)} style={{
          width: 46, height: 46, borderRadius: 23,
          background: follow ? '#EDE7F6' : '#F5F5F5',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill={follow ? '#4A148C' : '#999'}>
            <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
          </svg>
        </div>

        {/* ETA */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#111', lineHeight: 1 }}>
            {totalDur > 0 ? `${totalDur} min` : '-- min'}
          </div>
          <div style={{ fontSize: 13, color: '#666', marginTop: 3 }}>
            {totalDist > 0 ? `${(totalDist / 1000).toFixed(1)} km` : ''}
            {totalDist > 0 && ' • '}
            {isToStore ? 'Ir à loja' : order.customer_name}
          </div>
        </div>

        {/* Ação ou Overview */}
        {statusLabel ? (
          <button style={{
            padding: '13px 20px', borderRadius: 26, border: 'none',
            background: instrBg, color: 'white', fontWeight: 800, fontSize: 14,
            cursor: 'pointer', flexShrink: 0, lineHeight: 1.3
          }} onClick={onStatusUpdate}>{statusLabel}</button>
        ) : (
          <div style={{
            padding: '13px 18px', borderRadius: 26, background: '#F5F5F5',
            color: '#333', fontWeight: 700, fontSize: 14,
            cursor: 'pointer', flexShrink: 0
          }} onClick={() => setNavStarted(false)}>Overview</div>
        )}
      </div>
    </div>
  );
}

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
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCpf, setEditCpf] = useState('');
  const [editPlate, setEditPlate] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');

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
  const [fullscreenOrder, setFullscreenOrder] = useState(null);
  const [finPeriod, setFinPeriod] = useState('dia');

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
    const [, mine] = await Promise.all([
      apiFetch('/motoboy/available'),
      apiFetch('/orders')
    ]);
    if (mine.data) {
      setMyOrders(mine.data.filter(o => o.motoboy_id === user?.id));
      const accepted = mine.data.find(o => o.id === orderId);
      if (accepted) setFullscreenOrder(accepted);
    }
    setLoading(false);
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
      console.warn('[GPS] Geolocalização não disponível');
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
    }, (err) => {
      console.warn('[GPS] Erro ao obter posição:', err.message);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 });
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

  const activeDeliveries = myOrders.filter(o => o.status !== 'delivered');

  function renderInicio() {
    return (
      <>
        <div className="card" style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: online ? 'linear-gradient(135deg, #E8F5E9, #C8E6C9)' : 'linear-gradient(135deg, #F5F5F5, #EEEEEE)',
          marginBottom: 12,
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
                {online ? 'Disponível para corridas' : 'Ative para receber pedidos'}
              </div>
            </div>
          </div>
          <div className="toggle-switch" onClick={() => { setOnline(!online); if (!online) sendLocation(); }}>
            <input type="checkbox" checked={online} readOnly />
            <span className="toggle-slider" />
          </div>
        </div>

        {activeDeliveries.length > 0 && activeDeliveries.map(order => (
          <div key={order.id} className="card" style={{ marginBottom: 12, border: '2px solid var(--primary)', cursor: 'pointer' }}
            onClick={() => setFullscreenOrder(order)}>
            <div className="flex-between" style={{ marginBottom: 4 }}>
              <span className="font-bold">#{order.id.slice(0, 8)}</span>
              <span className="badge badge-success">R$ {order.total.toFixed(2)}</span>
            </div>
            <div className="text-sm text-muted">Cliente: <strong>{order.customer_name}</strong></div>
            <div className="text-sm text-muted" style={{ marginBottom: 6 }}>Endereço: {order.customer_address}</div>
            <div className="flex-between">
              <span className={`badge ${statusColors[order.status] || 'badge-primary'}`}>{statusLabels[order.status] || order.status}</span>
              {nextStatus[order.status] && (
                <button className="btn btn-sm btn-primary" onClick={() => updateStatus(order.id)}>
                  {nextStatusLabel[order.status]}
                </button>
              )}
            </div>
          </div>
        ))}

        {activeDeliveries.length === 0 && (
          <>
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
                  <div className="text-sm text-muted" style={{ marginBottom: 8 }}>{order.customer_address}</div>
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
        )}
      </>
    );
  }

  function formatTime(d) {
    if (!d) return '--:--';
    return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function calcDuration(start, end) {
    if (!start || !end) return '';
    const mins = Math.round((new Date(end) - new Date(start)) / 60000);
    if (mins < 60) return `${mins}min`;
    return `${Math.floor(mins/60)}h${mins%60}min`;
  }

  function groupByDate(orders) {
    const groups = {};
    for (const o of orders) {
      const dateKey = new Date(o.updated_at || o.created_at).toLocaleDateString('pt-BR');
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(o);
    }
    return groups;
  }

  function renderPedidos() {
    const completed = myOrders.filter(o => o.status === 'delivered');
    const active = myOrders.filter(o => o.status !== 'delivered');

    if (completed.length === 0 && active.length === 0) {
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

    return (
      <>
        {active.length > 0 && (
          <>
            <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--primary)', marginBottom: 8 }}>Em andamento</div>
            {active.map(order => (
              <div key={order.id} className="card" style={{ cursor: 'pointer', border: '2px solid var(--primary)' }}
                onClick={() => setFullscreenOrder(order)}>
                <div className="flex-between" style={{ marginBottom: 4 }}>
                  <span className="font-bold">#{order.id.slice(0, 8)}</span>
                  <span className={`badge ${statusColors[order.status] || 'badge-primary'}`}>{statusLabels[order.status] || order.status}</span>
                </div>
                <div className="text-sm text-muted"><strong>{order.customer_name}</strong></div>
                <div className="text-sm text-muted">{order.customer_address}</div>
                {nextStatus[order.status] && (
                  <button className="btn btn-sm btn-primary mt-2" onClick={(e) => { e.stopPropagation(); updateStatus(order.id); }}>
                    {nextStatusLabel[order.status]}
                  </button>
                )}
              </div>
            ))}
          </>
        )}

        {Object.entries(groupByDate(completed)).reverse().map(([date, orders]) => (
          <div key={date}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#999', margin: '12px 0 8px' }}>{date}</div>
            {orders.reverse().map(order => {
              const pickedTime = order.status === 'delivered' ? (order.updated_at) : null;
              const deliveredTime = order.status === 'delivered' ? order.updated_at : null;
              return (
                <div key={order.id} className="card" style={{ cursor: 'pointer' }}
                  onClick={() => setFullscreenOrder(order)}>
                  <div className="flex-between" style={{ marginBottom: 4 }}>
                    <span className="font-bold">#{order.id.slice(0, 8)}</span>
                    <span className="badge badge-success">R$ {order.total.toFixed(2)}</span>
                  </div>
                  <div className="text-sm text-muted"><strong>{order.customer_name}</strong></div>
                  <div className="text-sm text-muted" style={{ marginBottom: 4 }}>{order.customer_address}</div>
                  <div className="flex-between text-xs" style={{ color: '#888' }}>
                    <span>🕐 Saiu: {formatTime(pickedTime)}</span>
                    <span>✅ Entregue: {formatTime(deliveredTime)}</span>
                    <span>⏱ {calcDuration(pickedTime, deliveredTime)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      </>
    );
  }

  const fsOrder = fullscreenOrder;

  function filterEarnings() {
    const list = earnings?.list || [];
    const now = new Date();
    let start;
    if (finPeriod === 'dia') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (finPeriod === 'semana') {
      const day = now.getDay();
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day === 0 ? 6 : day - 1));
    } else if (finPeriod === 'mes') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      return list;
    }
    return list.filter(e => new Date(e.created_at) >= start);
  }

  function renderSaldo() {
    const filtered = filterEarnings();
    const periodTotal = filtered.reduce((s, e) => s + e.amount, 0);
    const periodPending = filtered.filter(e => e.status === 'pending').reduce((s, e) => s + e.amount, 0);

    return (
      <div>
        <div className="swipe-row" style={{ marginBottom: 12 }}>
          {['dia', 'semana', 'mes'].map(p => (
            <button key={p} className={`btn btn-sm ${finPeriod === p ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFinPeriod(p)}>
              {p === 'dia' ? 'Hoje' : p === 'semana' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>

        <div className="card" style={{
          background: 'linear-gradient(135deg, #6A1B9A, #4A148C)',
          color: 'white', marginBottom: 16
        }}>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>
            Ganhos {finPeriod === 'dia' ? 'de hoje' : finPeriod === 'semana' ? 'da semana' : 'do mês'}
          </div>
          <div style={{ fontSize: 42, fontWeight: 800, marginBottom: 4 }}>R$ {periodTotal.toFixed(2)}</div>
          {periodPending > 0 && (
            <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px 16px', display: 'inline-block' }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>A receber: </span>
              <span style={{ fontWeight: 700 }}>R$ {periodPending.toFixed(2)}</span>
            </div>
          )}
        </div>

        {filtered.length > 0 ? (
          <div className="card" style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--primary)' }}>Histórico</div>
            {filtered.reverse().map((e, i) => (
              <div key={i} className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid #F5F5F5', fontSize: 13 }}>
                <div>
                  <span>R$ {e.amount.toFixed(2)}</span>
                  <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                    {new Date(e.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <span className={e.status === 'paid' ? 'badge badge-success' : 'badge badge-warning'}>
                  {e.status === 'paid' ? 'Pago' : 'Pendente'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ paddingTop: 40 }}>
            <p>Nenhum ganho nesse período</p>
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
        <div className="form-group">
          <label className="label" style={{ textTransform: 'none' }}>E-mail (usado para trocar a senha quando esquecer)</label>
          <input className="input" type="email" value={editEmail || user?.email || ''}
            onChange={e => setEditEmail(e.target.value)} placeholder="seu@email.com" />
        </div>
        <div className="form-group"><label className="label">Telefone</label><div style={{ fontWeight: 600 }}>{user?.phone}</div></div>
        <div className="form-group">
          <label className="label">WhatsApp</label>
          <input className="input" type="tel" value={editWhatsapp}
            onChange={e => setEditWhatsapp(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="(99) 99999-9999" />
        </div>
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
        {pixMsg && <div style={{ fontSize: 13, fontWeight: 600, padding: '10px 14px', borderRadius: 8, marginBottom: 12,
          background: pixMsg.includes('Erro') ? '#FFEBEE' : '#E8F5E9', color: pixMsg.includes('Erro') ? '#C62828' : '#2E7D32' }}>{pixMsg}</div>}
        <button className="btn btn-primary" onClick={async () => {
          setPixSaving(true);
          try {
            localStorage.setItem('motoboy_pix_key', pixKey);
            const body = { pix_key: pixKey };
            if (editName) body.name = editName;
            if (editEmail) body.email = editEmail;
            if (editCpf.replace(/\D/g, '').length === 11) body.cpf = editCpf;
            if (editPlate) body.vehicle_type = editPlate;
            if (editWhatsapp) body.whatsapp = editWhatsapp;
            const res = await apiFetch('/motoboy/profile', { method: 'PATCH', body: JSON.stringify(body) });
            setPixMsg(res.ok ? 'Salvo com sucesso!' : (res.error || 'Erro ao salvar'));
            if (res.ok && editName) { user.name = editName; window.location.reload(); }
          } catch { localStorage.setItem('motoboy_pix_key', pixKey); setPixMsg('Salvo localmente!'); }
          setPixSaving(false);
          setTimeout(() => setPixMsg(''), 4000);
        }} disabled={pixSaving}>{pixSaving ? 'Salvando...' : 'Salvar'}</button>

        <div style={{ borderTop: '1px solid var(--border)', marginTop: 20, paddingTop: 16 }}>
          <div className="page-title" style={{ fontSize: 16, marginBottom: 12 }}>Alterar Senha</div>
          <div className="form-group">
            <label className="label">Senha atual</label>
            <input className="input" type="password" value={pwCurrent}
              onChange={e => setPwCurrent(e.target.value)} placeholder="Senha atual" />
          </div>
          <div className="form-group">
            <label className="label">Nova senha</label>
            <input className="input" type="password" value={pwNew}
              onChange={e => setPwNew(e.target.value)} placeholder="Nova senha (min 4 caracteres)" />
          </div>
          {pwMsg && <div style={{ fontSize: 13, fontWeight: 600, padding: '10px 14px', borderRadius: 8, marginBottom: 12,
            background: pwMsg.includes('sucesso') ? '#E8F5E9' : '#FFEBEE',
            color: pwMsg.includes('sucesso') ? '#2E7D32' : '#C62828' }}>{pwMsg}</div>}
          <button className="btn btn-outline" onClick={async () => {
            setPwSaving(true);
            const res = await apiFetch('/auth/password', {
              method: 'PATCH',
              body: JSON.stringify({ current_password: pwCurrent, new_password: pwNew })
            });
            setPwMsg(res.ok ? 'Senha alterada com sucesso!' : (res.error || 'Erro ao alterar senha'));
            if (res.ok) { setPwCurrent(''); setPwNew(''); }
            setPwSaving(false);
            setTimeout(() => setPwMsg(''), 4000);
          }} disabled={pwSaving}>{pwSaving ? 'Salvando...' : 'Alterar Senha'}</button>
        </div>
      </div>
    );
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>
      <div className="header" style={{ padding: '8px 16px' }}>
        <div className="header-left" style={{ gap: 10 }}>
          <img src="/logomarca.png" alt="Pé de Açaí" style={{ width: 72, height: 72, borderRadius: 14, objectFit: 'contain', flexShrink: 0 }} />
          <div>
            <div className="header-title" style={{ fontSize: 18 }}>Pé de Açaí</div>
            <div style={{ fontSize: 11, color: 'var(--text-light)' }}>Motoboy</div>
          </div>
        </div>
        <div className="header-right" style={{ gap: 10 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer' }}
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

      {fsOrder && (
        <NavScreen order={fsOrder} onClose={() => setFullscreenOrder(null)}
          onStatusUpdate={() => { updateStatus(fsOrder.id); setFullscreenOrder(null); }}
          statusLabel={nextStatus[fsOrder.status] ? nextStatusLabel[fsOrder.status] : null} />
      )}
    </div>
  );
}
