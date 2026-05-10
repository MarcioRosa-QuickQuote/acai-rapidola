import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const statusLabels = {
  pending: 'Aguardando pgto', confirmed: 'Confirmado', preparing: 'Preparando',
  ready: 'Pronto', assigned: 'Motoboy a caminho', picked_up: 'Retirado',
  in_transit: 'Em trânsito', arriving: 'Chegando', delivered: 'Entregue', cancelled: 'Cancelado'
};

const statusColors = {
  pending: 'badge-warning', confirmed: 'badge-primary', preparing: 'badge-info',
  ready: 'badge-success', assigned: 'badge-primary', picked_up: 'badge-primary',
  in_transit: 'badge-info', arriving: 'badge-accent', delivered: 'badge-success', cancelled: 'badge-danger'
};

const actionMap = {
  confirmed: { label: 'Preparar', next: 'preparing' },
  preparing: { label: 'Marcar Pronto', next: 'ready' },
  ready: { label: 'Já está pronto', next: 'ready' }
};

export default function StoreDashboard() {
  const { user, store: storeData, apiFetch, logout, setStore } = useAuth();
  const { socket, joinStore, toast, setToast } = useSocket();
  const [orders, setOrders] = useState([]);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('orders');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [settings, setSettings] = useState({ name: '', logo: '', address: '', lat: '', lng: '' });
  const [saveMsg, setSaveMsg] = useState('');
  const [mapCenter, setMapCenter] = useState([-23.5505, -46.6333]);
  const [geocoding, setGeocoding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [logoSaving, setLogoSaving] = useState(false);

  useEffect(() => {
    loadOrders();
    if (storeData) {
      joinStore(storeData.id);
      setOpen(!!storeData.open);
    }
  }, [storeData]);

  useEffect(() => {
    if (storeData) {
      setSettings({
        name: storeData.name || '',
        logo: storeData.logo || '',
        address: storeData.address || '',
        lat: String(storeData.lat),
        lng: String(storeData.lng)
      });
      setMapCenter([storeData.lat, storeData.lng]);
    }
  }, [storeData]);

  useEffect(() => {
    if (!socket) return;
    socket.on('new_order', () => loadOrders());
    socket.on('order_paid', () => { loadOrders(); setToast('Pagamento confirmado! Prepare o açaí!'); });
    socket.on('order_status', () => loadOrders());
    socket.on('notification', (notif) => {
      if (notif.type === 'delivery') setToast(notif.body);
    });
    return () => {
      socket.off('new_order');
      socket.off('order_paid');
      socket.off('order_status');
      socket.off('notification');
    };
  }, [socket]);

  async function loadOrders() {
    const data = await apiFetch('/orders');
    if (data.data) setOrders(data.data);
    setLoading(false);
  }

  async function updateStatus(orderId, status) {
    await apiFetch(`/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    loadOrders();
  }

  async function toggleOpen() {
    if (!storeData) return;
    const data = await apiFetch(`/stores/${storeData.id}/toggle-open`, { method: 'PATCH' });
    if (data.ok || data.open !== undefined) setOpen(data.open);
  }

  async function uploadLogo() {
    const file = fileRef.current?.files?.[0];
    if (!file || !storeData) return;
    setLogoSaving(true);
    const formData = new FormData();
    formData.append('logo', file);
    try {
      const res = await fetch(`/api/stores/${storeData.id}/logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      const data = await res.json();
      if (data.logo) {
        setSettings(s => ({ ...s, logo: data.logo }));
        setStore(prev => prev ? { ...prev, logo: data.logo } : prev);
        setSaveMsg('Logo atualizado!');
        setTimeout(() => setSaveMsg(''), 2000);
      }
    } catch {
      setSaveMsg('Erro ao enviar logo.');
      setTimeout(() => setSaveMsg(''), 3000);
    } finally {
      setLogoSaving(false);
    }
  }

  async function saveSettings() {
    if (!storeData) return;
    setSaveMsg('');
    setUploading(true);

    const data = await apiFetch(`/stores/${storeData.id}/settings`, {
      method: 'PUT',
      body: JSON.stringify({
        name: settings.name,
        logo: settings.logo,
        address: settings.address,
        lat: parseFloat(settings.lat),
        lng: parseFloat(settings.lng)
      })
    });
    if (data.ok) {
      if (data.name) setStore(data);
      setSaveMsg('Configurações salvas!');
      setTimeout(() => setSaveMsg(''), 3000);
    }
    setUploading(false);
  }

  async function geocodeAddress() {
    if (!settings.address) return;
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(settings.address)}&limit=1&countrycodes=BR`
      );
      const data = await res.json();
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setSettings(s => ({ ...s, lat: String(lat), lng: String(lng) }));
        setMapCenter([lat, lng]);
      } else {
        setSaveMsg('Endereço não encontrado. Tente um endereço mais específico.');
        setTimeout(() => setSaveMsg(''), 4000);
      }
    } catch {
        setSaveMsg('Erro ao buscar endereço.');
      setTimeout(() => setSaveMsg(''), 4000);
    } finally {
      setGeocoding(false);
    }
  }

  function MapClickHandler() {
    useMapEvents({
      click(e) {
        const { lat, lng } = e.latlng;
        setSettings(s => ({ ...s, lat: String(lat.toFixed(6)), lng: String(lng.toFixed(6)) }));
      }
    });
    return null;
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  const pendingOrders = orders.filter(o => o.payment_status === 'paid' && !['delivered','cancelled'].includes(o.status));
  const paidOrders = orders.filter(o => o.payment_status === 'paid');

  return (
    <div>
      <div className="header">
        <div className="header-left">
          {storeData?.logo && (
            <img src={storeData.logo} alt="Logo" style={{ width: 44, height: 44, borderRadius: 8, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div className="header-title">{storeData?.name || 'Loja'}</div>
          </div>
        </div>
        <div className="header-right">
          <span className="hide-mobile" style={{ fontSize: 12, fontWeight: 600, opacity: 0.9 }}>Delivery</span>
          <div className="toggle-switch" onClick={toggleOpen} title={open ? 'Fechar loja' : 'Abrir loja'}>
            <input type="checkbox" checked={open} readOnly />
            <span className="toggle-slider" />
          </div>
          <button className="btn btn-sm"
            style={{ background: view === 'settings' ? 'rgba(255,255,255,0.3)' : 'rgba(255,255,255,0.15)', color: 'white', fontSize: 12 }}
            onClick={() => setView(view === 'settings' ? 'orders' : 'settings')}>
            {view === 'settings' ? 'Pedidos' : 'Conta'}
          </button>
          <button className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 12 }}
            onClick={logout}>Sair</button>
        </div>
      </div>

      <div className="container">
        <div className="card" style={{
          background: open
            ? 'linear-gradient(135deg, #E8F5E9, #C8E6C9)'
            : 'linear-gradient(135deg, #FFEBEE, #FFCDD2)',
          textAlign: 'center'
        }}>
          <div style={{ fontSize: 14, fontWeight: 600, marginBottom: 4 }}>
            {open ? 'Loja ABERTA - Aceitando pedidos' : 'Loja FECHADA - Entregas encerradas'}
          </div>
          <div className="text-xs text-muted">
            {open ? 'Os clientes podem fazer pedidos' : 'Clientes verão que as entregas já encerraram'}
          </div>
        </div>

        {view === 'settings' ? (
          <>
            <div className="page-title">Conta da Loja</div>

            <div className="card">
              <div className="form-group">
                <label className="label">Logo da Loja</label>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                  {(settings.logo || fileRef.current?.files?.[0]) && (
                    <img
                      src={settings.logo || (fileRef.current?.files?.[0] ? URL.createObjectURL(fileRef.current.files[0]) : null)}
                      alt="Logo"
                      style={{ maxWidth: 160, maxHeight: 80, objectFit: 'contain', borderRadius: 8 }}
                      onError={e => { e.target.style.display = 'none'; }}
                    />
                  )}
                  <input type="file" accept="image/*" ref={fileRef}
                    onChange={uploadLogo}
                    style={{ fontSize: 14 }} />
                  {logoSaving && <span className="text-xs text-muted">Enviando logo...</span>}
                  <span className="text-xs text-muted">Formatos aceitos: PNG, JPG, GIF (máx 5MB)</span>
                </div>
              </div>

              <div className="form-group">
                <label className="label">Nome da Loja</label>
                <input className="input" type="text" value={settings.name}
                  onChange={e => setSettings(s => ({ ...s, name: e.target.value }))}
                  placeholder="Nome que aparece no topo do app" />
              </div>

              <div className="form-group">
                <label className="label">Endereço da Loja</label>
                <div className="flex-row" style={{ gap: 8 }}>
                  <input className="input" type="text" value={settings.address}
                    onChange={e => setSettings(s => ({ ...s, address: e.target.value }))}
                    placeholder="Rua, numero, bairro - Cidade"
                    style={{ flex: 1 }} />
                  <button className="btn btn-sm btn-secondary"
                    onClick={geocodeAddress} disabled={geocoding}
                    style={{ width: 'auto', whiteSpace: 'nowrap' }}>
                    {geocoding ? '...' : 'Buscar no Mapa'}
                  </button>
                </div>
              </div>

              <div className="form-group">
                <label className="label">Localização no Mapa</label>
                <div className="text-xs text-muted" style={{ marginBottom: 8 }}>
                  Digite o endereço e clique em "Buscar no Mapa", depois arraste o marcador ou clique no mapa para ajustar.
                </div>
                <div style={{ height: 300, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <MapContainer
                    center={mapCenter}
                    zoom={15}
                    style={{ height: '100%', width: '100%' }}
                    key={`${mapCenter[0]}-${mapCenter[1]}`}
                  >
                    <TileLayer
                      attribution='&copy; OpenStreetMap'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    <Marker
                      position={[
                        (settings.lat === '' || isNaN(parseFloat(settings.lat))) ? mapCenter[0] : parseFloat(settings.lat),
                        (settings.lng === '' || isNaN(parseFloat(settings.lng))) ? mapCenter[1] : parseFloat(settings.lng)
                      ]}
                      draggable={true}
                      eventHandlers={{
                        dragend(e) {
                          const { lat, lng } = e.target.getLatLng();
                          setSettings(s => ({ ...s, lat: String(lat.toFixed(6)), lng: String(lng.toFixed(6)) }));
                        }
                      }}
                    />
                    <MapClickHandler />
                  </MapContainer>
                </div>
              </div>

              {saveMsg && (
                <div style={{ background: '#E8F5E9', color: '#2E7D32', padding: 10, borderRadius: 8, marginBottom: 12, textAlign: 'center', fontWeight: 600 }}>
                  {saveMsg}
                </div>
              )}

              <button className="btn btn-primary" onClick={saveSettings} disabled={uploading}>
                {uploading ? 'Salvando...' : 'Salvar Configurações'}
              </button>
            </div>

            <div className="card">
              <h3 className="text-sm font-bold text-muted mb-2">Informações da Loja</h3>
              <div className="flex-between text-sm" style={{ marginTop: 4 }}>
                <span>Nome:</span><span className="font-bold">{storeData?.name}</span>
              </div>
              <div className="flex-between text-sm" style={{ marginTop: 4 }}>
                <span>Endereço:</span><span>{settings.address || storeData?.address}</span>
              </div>
              <div className="flex-between text-sm" style={{ marginTop: 4 }}>
                <span>Assinatura:</span>
                <span className="badge badge-success">R$ 89/mês</span>
              </div>
            </div>
          </>
        ) : (
          <>
            <div className="grid-2 mb-4">
              <div className="card text-center" style={{ background: 'linear-gradient(135deg, #F3E5F5, #E1BEE7)' }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--primary)' }}>{pendingOrders.length}</div>
                <div className="text-sm font-bold">Pedidos ativos</div>
              </div>
              <div className="card text-center" style={{ background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)' }}>
                <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--secondary)' }}>
                  R$ {paidOrders.reduce((s, o) => s + o.total, 0).toFixed(0)}
                </div>
                <div className="text-sm font-bold">Total vendido</div>
              </div>
            </div>

            <div className="page-title">Pedidos</div>

            {orders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <rect x="20" y="16" width="24" height="32" rx="3" stroke="var(--border)" strokeWidth="2"/>
                    <path d="M28 28h8M28 34h8" stroke="var(--border)" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <p>Nenhum pedido ainda</p>
              </div>
            ) : (
              orders.map(order => (
                <div key={order.id} className="card">
                  <div className="flex-between" style={{ marginBottom: 6 }}>
                    <div>
                      <span className="font-bold">#{order.id.slice(0, 8)}</span>
                      <span className="text-sm text-muted" style={{ marginLeft: 8 }}>
                        {order.customer_name}
                      </span>
                    </div>
                    <span className={`badge ${order.payment_status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                      {order.payment_status === 'paid' ? 'Pago' : 'Pendente'}
                    </span>
                  </div>

                  <div className="flex-between text-sm text-muted" style={{ marginBottom: 4 }}>
                    <span>{order.customer_address}</span>
                    <span className="font-bold" style={{ color: 'var(--primary)' }}>
                      R$ {order.total.toFixed(2)}
                    </span>
                  </div>

                  <div className="flex-between" style={{ marginTop: 8 }}>
                    <span className={`badge ${statusColors[order.status] || 'badge-warning'}`}>
                      {statusLabels[order.status]}
                    </span>

                    <div className="flex-row">
                      {order.motoboy_name && (
                        <span className="text-xs text-muted" style={{ background: '#E3F2FD', padding: '2px 8px', borderRadius: 4 }}>
                          {order.motoboy_name}
                        </span>
                      )}

                      {order.payment_status === 'paid' && actionMap[order.status] && (
                        <button className="btn btn-sm btn-primary"
                          onClick={() => updateStatus(order.id, actionMap[order.status].next)}>
                          {actionMap[order.status].label}
                        </button>
                      )}

                      {(order.status === 'arriving' || order.status === 'picked_up') && (
                        <span className="badge" style={{ background: '#FFF3E0', color: '#E65100' }}>
                          ALERTA: Motoboy próximo!
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              ))
            )}

            <button className="btn btn-outline mt-4" onClick={loadOrders}>
              Atualizar Pedidos
            </button>
          </>
        )}
      </div>
    </div>
  );
}
