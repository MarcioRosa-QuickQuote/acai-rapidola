import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { APP_BUILD } from '../version';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import RoutePolyline from '../components/RouteMap';
import StoreMessages from '../components/StoreMessages';
import StoreAddressForm from '../components/StoreAddressForm';

function abbr(s) {
  if (!s) return s;
  return s.replace(/\bPassagem\b/gi, 'Pass.').replace(/\bTravessa\b/gi, 'Tv.').replace(/\bAvenida\b/gi, 'Av.').replace(/\bAlameda\b/gi, 'Al.').replace(/\bPraça\b/gi, 'Praç.').replace(/\bRodovia\b/gi, 'Rod.').replace(/\bEstrada\b/gi, 'Est.');
}

function shortAddress(full) {
  if (!full) return '';
  const parts = full.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  // Detecta padrão de rodovia federal: "BR, 2629, Avenida X, Bairro, Cidade, Estado"
  // → reordena para "Av. X, 2629 - Bairro"
  if (
    parts.length >= 3 &&
    /^[A-Z]{2}(-\d+)?$/i.test(parts[0]) &&
    /^\d+$/.test(parts[1]) &&
    /^(Avenida|Rua|Travessa|Alameda|Passagem|Rodovia|Estrada|Praça)/i.test(parts[2])
  ) {
    const street = abbr(parts[2]);
    const hood = parts[3] || '';
    const isCity = /^(Belém|Manaus|São Paulo|Rio|Salvador|Fortaleza|Recife|Curitiba|Porto Alegre|Brasília|Goiânia|Pará|Amazonas|Bahia|Ceará|Minas|Paraná|Santa|Mato|Goiás|Piauí|Maranhão|Sergipe|Alagoas|Pernambuco|Paraíba|Tocantins|Rondônia|Roraima|Amapá|Acre)/i.test(hood);
    return `${street}, ${parts[1]}${hood && !isCity ? ` - ${hood}` : ''}`;
  }
  const street = parts[0];
  let num = '';
  let hood = '';
  let cursor = 1;
  if (parts[cursor] && /^\d+(\s*-?\s*\d+)?$/.test(parts[cursor].replace(/\s/g, ''))) { num = parts[cursor]; cursor++; }
  if (parts[cursor]) { hood = parts[cursor]; cursor++; }
  let result = abbr(street);
  if (num) result += `, ${num}`;
  if (hood) result += ` - ${abbr(hood)}`;
  return result;
}
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const statusLabels = {
  pending: 'Aguardando pgto', confirmed: 'Aguardando preparo', preparing: 'Preparando',
  ready: 'Pronto — aguarda motoboy', assigned: 'Motoboy a caminho',
  picked_up: 'Saiu pra entrega', in_transit: 'Saiu pra entrega', arriving: 'Chegando!',
  delivered: 'Entregue', cancelled: 'Cancelado'
};

const statusColors = {
  pending: 'badge-warning', confirmed: 'badge-info', preparing: 'badge-info',
  ready: 'badge-primary', assigned: 'badge-primary', picked_up: 'badge-primary',
  in_transit: 'badge-primary', arriving: 'badge-primary',
  delivered: 'badge-success', cancelled: 'badge-danger'
};

const actionMap = {
  confirmed: { label: 'Preparar', next: 'preparing' },
  preparing: { label: 'Pronto! ✅', next: 'ready' },
  assigned:  { label: 'Confirmar Saída 🛵', next: 'picked_up' }
};

export default function StoreDashboard() {
  const { user, store: storeData, apiFetch, logout, setStore } = useAuth();
  const { socket, joinStore, toast, setToast } = useSocket();
  const [orders, setOrders] = useState([]);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('painel');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showMapForOrder, setShowMapForOrder] = useState(null);
  const [settings, setSettings] = useState({ name: '', logo: '', address: '', lat: '', lng: '', pix_key: localStorage.getItem('store_pix_key') || '', cpf_cnpj: '' });
  const [saveMsg, setSaveMsg] = useState('');
  const [mapCenter, setMapCenter] = useState([-23.5505, -46.6333]);
  const [geocoding, setGeocoding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [logoSaving, setLogoSaving] = useState(false);
  const [orderFilter, setOrderFilter] = useState('ativos');
  const [motoboys, setMotoboys] = useState([]);
  const [motoboyPhone, setMotoboyPhone] = useState('');
  const [motoboyMsg, setMotoboyMsg] = useState('');
  const [invites, setInvites] = useState([]);
  const [inviteLink, setInviteLink] = useState('');
  const [products, setProducts] = useState([]);
  const [productForm, setProductForm] = useState(null);
  const [productImg, setProductImg] = useState(null);
  const [earnings, setEarnings] = useState({ store: { pending: 0, paid: 0 }, motoboy: { pending: 0, paid: 0 } });
  const [payoutMsg, setPayoutMsg] = useState('');
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [finMonth, setFinMonth] = useState(() => new Date().getMonth() + 1);
  const [finYear, setFinYear] = useState(() => new Date().getFullYear());
  const [finPeriod, setFinPeriod] = useState('mes');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [perfilTab, setPerfilTab] = useState(null);
  const [stockAlertMap, setStockAlertMap] = useState({});
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showAddrSuggestions, setShowAddrSuggestions] = useState(false);
  const [searchingAddr, setSearchingAddr] = useState(false);
  const [showCep, setShowCep] = useState(false);
  const [cep, setCep] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [savingAddr, setSavingAddr] = useState(false);
  const [storeMessages, setStoreMessages] = useState([]);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [showDesktopMenu, setShowDesktopMenu] = useState(false);
  const [showTV, setShowTV] = useState(false);
  const [tvLocked, setTvLocked] = useState(false);
  const [tvTime, setTvTime] = useState('');
  const [tvLight, setTvLight] = useState(false);
  const [motoboyAlert, setMotoboyAlert] = useState(null); // { name, orderId, type, distanceMeters }
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const addrSearchRef = useRef(null);

  function playMotoboyAlarm() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const beep = (freq, t, dur) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = 'sine';
        gain.gain.setValueAtTime(0.35, ctx.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur);
        osc.start(ctx.currentTime + t); osc.stop(ctx.currentTime + t + dur + 0.05);
      };
      beep(880, 0, 0.12); beep(1100, 0.15, 0.12); beep(1320, 0.30, 0.2); beep(1100, 0.52, 0.12); beep(1320, 0.67, 0.3);
    } catch (e) {}
  }

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    loadOrders();
    if (storeData) {
      joinStore(storeData.id);
      setOpen(!!storeData.open);
    }
    const pollTimer = setInterval(loadOrders, 15000);
    return () => clearInterval(pollTimer);
  }, [storeData]);

  useEffect(() => {
    if (storeData) {
      setSettings({
        name: storeData.name || '',
        logo: storeData.logo || '',
        address: storeData.address || '',
        lat: String(storeData.lat),
        lng: String(storeData.lng),
        cpf_cnpj: storeData.cpf_cnpj || ''
      });
      setMapCenter([storeData.lat, storeData.lng]);
    }
  }, [storeData]);

  useEffect(() => {
    if (!socket) return;
    socket.on('new_order', () => loadOrders());
    socket.on('order_paid', () => { loadOrders(); setToast('Pagamento confirmado! Prepare o açaí!'); });
    socket.on('order_status', (data) => {
      loadOrders();
      if (data?.status === 'assigned') {
        playMotoboyAlarm();
        setMotoboyAlert({ orderId: data.orderId, name: data.motoboyName || 'Motoboy', type: 'accepted' });
        setTimeout(() => setMotoboyAlert(null), 8000);
      }
    });
    socket.on('motoboy_approaching_store', (data) => {
      playMotoboyAlarm();
      setMotoboyAlert({ orderId: data.orderId, name: data.motoboyName || 'Motoboy', type: 'approaching', distanceMeters: data.distanceMeters });
      setTimeout(() => setMotoboyAlert(null), 12000);
    });
    socket.on('notification', (notif) => {
      if (notif.type === 'delivery') setToast(notif.body);
      if (notif.type === 'message') { loadMessages(); setToast(`📩 ${notif.body}`); }
      setTimeout(() => setToast(null), 4000);
    });
    if (storeData) joinStore(storeData.id);
    return () => {
      socket.off('new_order');
      socket.off('order_paid');
      socket.off('order_status');
      socket.off('notification');
      socket.off('motoboy_approaching_store');
    };
  }, [socket]);

  useEffect(() => {
    if (view === 'produtos') loadProducts();
    if (view === 'perfil' && perfilTab === 'motoboy') loadMotoboys();
    if (view === 'perfil' && perfilTab === 'mensagens') loadMessages();
  }, [view, perfilTab, storeData]);

  useEffect(() => {
    if (storeData) loadMessages();
  }, [storeData]);

  useEffect(() => {
    const low = products.filter(p => p.active && p.stock_quantity != null && p.min_stock_alert != null && p.stock_quantity <= p.min_stock_alert);
    setLowStockProducts(low);
  }, [products]);

  async function loadOrders() {
    const data = await apiFetch('/orders');
    if (data.data) setOrders(data.data);
    setLoading(false);
  }

  async function loadMessages() {
    if (!storeData) return;
    const data = await apiFetch(`/messages/${storeData.id}`);
    if (data.data) {
      setStoreMessages(data.data);
      setUnreadMessages(data.data.filter(m => !m.read).length);
    }
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
        lng: parseFloat(settings.lng),
        pix_key: settings.pix_key,
        cpf_cnpj: settings.cpf_cnpj
      })
    });
    if (data.ok) {
      localStorage.setItem('store_pix_key', settings.pix_key);
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

  async function loadMotoboys() {
    if (!storeData) return;
    const [motoboysData, invitesData] = await Promise.all([
      apiFetch(`/stores/${storeData.id}/motoboys`),
      apiFetch(`/stores/${storeData.id}/invites`)
    ]);
    if (motoboysData.data) setMotoboys(motoboysData.data);
    if (invitesData.data) setInvites(invitesData.data);
  }

  async function generateInvite() {
    if (!motoboyPhone.trim() || !storeData) return;
    setMotoboyMsg('');
    setInviteLink('');
    const data = await apiFetch(`/stores/${storeData.id}/invite`, {
      method: 'POST',
      body: JSON.stringify({ phone: motoboyPhone.trim() })
    });
    if (data.error) {
      setMotoboyMsg(data.error);
      setTimeout(() => setMotoboyMsg(''), 4000);
    } else if (data.direct) {
      setMotoboyPhone('');
      setMotoboyMsg(`Motoboy ${data.name} vinculado diretamente como parceiro!`);
      setTimeout(() => setMotoboyMsg(''), 3000);
      loadMotoboys();
    } else if (data.inviteLink) {
      setInviteLink(data.inviteLink);
      setMotoboyMsg('Convite gerado! Compartilhe o link com o motoboy.');
      setTimeout(() => setMotoboyMsg(''), 6000);
      loadMotoboys();
    }
  }

  async function copyInviteLinkToken(token) {
    const link = `${window.location.origin}/register?token=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setMotoboyMsg('Link copiado!');
      setTimeout(() => setMotoboyMsg(''), 2000);
    } catch {
      setMotoboyMsg('Erro ao copiar.');
      setTimeout(() => setMotoboyMsg(''), 2000);
    }
  }

  async function revokeInvite(inviteId) {
    if (!storeData || !confirm('Cancelar este convite?')) return;
    await apiFetch(`/stores/${storeData.id}/invite/${inviteId}`, { method: 'DELETE' });
    loadMotoboys();
  }

  async function toggleEmployee(motoboyId, current) {
    if (!storeData) return;
    await apiFetch(`/stores/${storeData.id}/motoboy/${motoboyId}`, {
      method: 'PATCH',
      body: JSON.stringify({ employee: current ? 0 : 1 })
    });
    loadMotoboys();
  }

  async function removeMotoboy(motoboyId) {
    if (!storeData || !confirm('Remover este motoboy da loja?')) return;
    await apiFetch(`/stores/${storeData.id}/motoboy/${motoboyId}`, { method: 'DELETE' });
    loadMotoboys();
  }

  async function loadProducts() {
    if (!storeData) return;
    const data = await apiFetch(`/products?store_id=${storeData.id}`);
    if (data.data) setProducts(data.data);
  }

  function openNewProduct() {
    setProductForm({ name: '', description: '', price: '', size_ml: '500', stock_quantity: '', min_stock_alert: '' });
    setProductImg(null);
  }

  const productImgRef = useRef(null);

  async function saveProduct() {
    if (!storeData || !productForm) return;
    const { name, description, price, size_ml, id, stock_quantity, min_stock_alert } = productForm;
    if (!name || !price || !size_ml) return;

    let imageUrl = productForm.image || '';
    const file = productImgRef.current?.files?.[0];
    if (file) {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/products/upload-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      const data = await res.json();
      if (data.url) imageUrl = data.url;
    }

    const body = {
      name, description, price: parseFloat(price), size_ml: parseInt(size_ml),
      stock_quantity: stock_quantity !== '' ? parseInt(stock_quantity) : null,
      min_stock_alert: min_stock_alert !== '' ? parseInt(min_stock_alert) : null
    };
    if (imageUrl) body.image = imageUrl;

    if (id) {
      await apiFetch(`/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
    } else {
      await apiFetch('/products', {
        method: 'POST',
        body: JSON.stringify(body)
      });
    }
    setProductForm(null);
    setProductImg(null);
    loadProducts();
  }

  async function toggleProduct(id, active) {
    await apiFetch(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ active: active ? 0 : 1 })
    });
    loadProducts();
  }

  async function deleteProduct(id) {
    if (!confirm('Excluir este produto permanentemente?')) return;
    await apiFetch(`/products/${id}`, { method: 'DELETE' });
    loadProducts();
  }

  function editProduct(p) {
    setProductForm({
      id: p.id, name: p.name, description: p.description || '',
      price: String(p.price), size_ml: String(p.size_ml),
      stock_quantity: p.stock_quantity != null ? String(p.stock_quantity) : '',
      min_stock_alert: p.min_stock_alert != null ? String(p.min_stock_alert) : ''
    });
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

  useEffect(() => {
    if (view === 'financeiro') loadEarnings();
  }, [view]);

  useEffect(() => {
    function handleClick(e) {
      if (showDesktopMenu) setShowDesktopMenu(false);
    }
    if (isDesktop && showDesktopMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [isDesktop, showDesktopMenu]);

  useEffect(() => {
    if (!showTV) return;
    const upd = () => setTvTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    upd();
    const t = setInterval(upd, 1000);
    return () => clearInterval(t);
  }, [showTV]);

  useEffect(() => {
    if (!showTV) return;
    const onKey = (e) => { if (e.key === 'Escape' && !tvLocked) setShowTV(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showTV, tvLocked]);

  if (loading) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <img className="spin" src="/saco_acai.png" />
    </div>
  );

  async function loadEarnings() {
    const data = await apiFetch('/earnings');
    if (data.store) setEarnings(data);
  }

  async function doPayout() {
    setPayoutMsg('');
    const data = await apiFetch('/payout', { method: 'POST', body: JSON.stringify({ type: 'store' }) });
    if (data.ok) {
      setPayoutMsg(data.message);
      loadEarnings();
    } else {
      setPayoutMsg(data.error || 'Erro');
    }
    setTimeout(() => setPayoutMsg(''), 4000);
  }

  const unpaidOrders = orders.filter(o => o.payment_status !== 'paid');
  const pendingOrders = orders.filter(o => o.payment_status === 'paid' && !['delivered','cancelled'].includes(o.status));
  const paidOrders = orders.filter(o => o.payment_status === 'paid');

  const now = Date.now();
  const staleUnpaid = unpaidOrders.filter(o => {
    const created = new Date(o.created_at).getTime();
    return (now - created) > 2 * 60 * 60 * 1000;
  });

  const concludedOrders = orders.filter(o => ['delivered', 'cancelled'].includes(o.status) && (now - new Date(o.created_at).getTime()) <= 24 * 60 * 60 * 1000);
  const displayOrders = orderFilter === 'pendentes' ? unpaidOrders.filter(o => {
    const created = new Date(o.created_at).getTime();
    return (now - created) <= 2 * 60 * 60 * 1000;
  }) : orderFilter === 'ativos' ? pendingOrders : orderFilter === 'concluidos' ? concludedOrders : orders.filter(o => (Date.now() - new Date(o.created_at).getTime()) <= 4 * 60 * 60 * 1000);

  const pedidosPendentes = unpaidOrders.filter(o => (now - new Date(o.created_at).getTime()) <= 2*60*60*1000).length;

  function FinanceiroTab() {
    const now = new Date();
    const filteredOrders = orders.filter(o => {
      if (o.payment_status !== 'paid') return false;
      const d = new Date(o.created_at);
      if (finPeriod === 'hoje') return d.toDateString() === now.toDateString();
      if (finPeriod === 'semana') {
        const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
        return d >= weekAgo;
      }
      return d.getMonth() + 1 === finMonth && d.getFullYear() === finYear;
    });
    const finTotal = filteredOrders.reduce((s, o) => s + o.total, 0);
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const years = [];
    for (let y = 2025; y <= now.getFullYear(); y++) years.push(y);

    return (
      <div>
        <div className="page-title" style={{ fontSize: 20 }}>Financeiro</div>
        <div className="flex-row" style={{ marginBottom: 12, overflowX: 'auto', WebkitOverflowScrolling: 'touch', paddingBottom: 4 }}>
          {[
            { key: 'hoje', label: 'Hoje' },
            { key: 'semana', label: 'Semana' },
            { key: 'mes', label: 'Mês' },
          ].map(p => (
            <button key={p.key} className={`btn btn-sm ${finPeriod === p.key ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFinPeriod(p.key)} style={{ flexShrink: 0, fontSize: 13 }}>
              {p.label}
            </button>
          ))}
          {finPeriod === 'mes' && (
            <>
              <select className="input" value={finMonth} onChange={e => setFinMonth(parseInt(e.target.value))}
                style={{ width: 'auto', flexShrink: 0, fontSize: 13, padding: '8px 12px' }}>
                {months.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
              <select className="input" value={finYear} onChange={e => setFinYear(parseInt(e.target.value))}
                style={{ width: 90, flexShrink: 0, fontSize: 13, padding: '8px 12px' }}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div className="card text-center" style={{ flex: 1, background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)', padding: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--secondary)' }}>
              R$ {finTotal.toFixed(2)}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#2E7D32' }}>Total em {months[finMonth-1]}</div>
          </div>
          <div className="card text-center" style={{ flex: 1, background: 'linear-gradient(135deg, #F3E5F5, #E1BEE7)', padding: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>{filteredOrders.length}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6A1B9A' }}>Pedidos pagos</div>
          </div>
        </div>

        {earnings.store.pending > 0 && (
          <div className="card" style={{ background: '#FFF8E1', border: '1px solid #FFE082', marginBottom: 16 }}>
            <div className="flex-between">
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#E65100' }}>💵 A receber via PIX</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#BF360C' }}>R$ {earnings.store.pending.toFixed(2)}</div>
              </div>
              <button className="btn btn-sm btn-accent" onClick={doPayout} style={{ width: 'auto' }}>
                Sacar
              </button>
            </div>
          </div>
        )}

        {filteredOrders.length === 0 ? (
          <div className="empty-state"><p>Nenhum pedido pago em {months[finMonth-1]}</p></div>
        ) : (
          filteredOrders.map(order => (
            <div key={order.id} className="card" style={{ padding: 14, marginBottom: 8, cursor: 'pointer' }}
              onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}>
              <div className="flex-between" style={{ marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>#{order.id.slice(0,8)}</span>
                <span style={{ fontSize: 12, color: '#888' }}>{new Date(order.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
              <div className="flex-between" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 12 }}>{order.customer_name}</span>
                <span className="badge badge-success">Pago</span>
              </div>
              <div className="flex-between" style={{ fontSize: 14 }}>
                <span className={`badge ${statusColors[order.status] || 'badge-primary'}`}>
                  {statusLabels[order.status] || order.status}
                </span>
                <span style={{ fontWeight: 800, color: 'var(--primary)' }}>R$ {order.total.toFixed(2)}</span>
              </div>
              {expandedOrder === order.id && (
                <div style={{ marginTop: 12, padding: 12, background: '#F8F4FC', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Detalhes do pedido</div>
                  <div className="text-sm text-muted" style={{ marginBottom: 4 }}>
                    📍 {shortAddress(order.customer_address) || 'Endereço'}
                  </div>
                  <div className="text-sm text-muted" style={{ marginBottom: 4 }}>
                    📞 {order.customer_phone || '—'}
                  </div>
                  {order.notes && (
                    <div className="text-sm text-muted" style={{ marginBottom: 4 }}>
                      📝 {order.notes}
                    </div>
                  )}
                  {order.delivery_fee > 0 && (
                    <div className="text-sm text-muted" style={{ marginBottom: 4 }}>
                      🏍️ Taxa entrega: R$ {order.delivery_fee.toFixed(2)}
                    </div>
                  )}
                  {order.motoboy_name && (
                    <div className="text-sm text-muted" style={{ marginBottom: 4 }}>
                      👤 Motoboy: {order.motoboy_name}
                    </div>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: 'var(--primary)' }}>
                    Total: R$ {order.total.toFixed(2)}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    );
  }

  function PedidosView() {
    return (
      <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div className="card text-center" style={{ flex: 1, padding: '12px 6px', background: 'linear-gradient(135deg, #FFF3E0, #FFE0B2)', cursor: 'pointer' }}
            onClick={() => setOrderFilter(orderFilter === 'pendentes' ? 'todos' : 'pendentes')}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#E65100' }}>{pedidosPendentes}</div>
            <div className="text-sm font-bold">{orderFilter === 'pendentes' ? '▼ Pendentes' : 'Pendentes'}</div>
          </div>
          <div className="card text-center" style={{ flex: 1, padding: '12px 6px', background: 'linear-gradient(135deg, #F3E5F5, #E1BEE7)', cursor: 'pointer' }}
            onClick={() => setOrderFilter(orderFilter === 'ativos' ? 'todos' : 'ativos')}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{pendingOrders.length}</div>
            <div className="text-sm font-bold">{orderFilter === 'ativos' ? '▼ Ativos' : 'Ativos'}</div>
          </div>
          <div className="card text-center" style={{ flex: 1, padding: '12px 6px', background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)', cursor: 'pointer' }}
            onClick={() => setOrderFilter(orderFilter === 'concluidos' ? 'todos' : 'concluidos')}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#2E7D32' }}>{concludedOrders.length}</div>
            <div className="text-sm font-bold">{orderFilter === 'concluidos' ? '▼ Concluídos' : 'Concluídos'}</div>
          </div>
        </div>

        {displayOrders.length === 0 ? (
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
          <div style={isDesktop ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } : {}}>
          {displayOrders.map(order => {
            const hasAction = order.payment_status === 'paid' && actionMap[order.status];
            const showMap = showMapForOrder === order.id;
            return (
              <div key={order.id} className="card" style={{ cursor: 'pointer' }}
                onClick={() => setShowMapForOrder(showMap ? null : order.id)}>
                <div className="flex-between" style={{ marginBottom: 10 }}>
                  <div>
                    <span className="font-bold" style={{ fontSize: 15 }}>{order.customer_name}</span>
                    {order.payment_status !== 'paid' && (
                      <span className="badge badge-warning" style={{ marginLeft: 8, fontSize: 11 }}>Pendente</span>
                    )}
                  </div>
                  {hasAction ? (
                    <button className="btn btn-sm btn-primary"
                      onClick={(e) => { e.stopPropagation(); updateStatus(order.id, actionMap[order.status].next); }}>
                      {actionMap[order.status].label}
                    </button>
                  ) : (
                    <span className={`badge ${statusColors[order.status] || 'badge-warning'}`} style={{ fontSize: 11 }}>
                      {statusLabels[order.status]}
                    </span>
                  )}
                </div>

                <div style={{ fontWeight: 700, fontSize: 14, color: '#333', marginBottom: 8 }}>Detalhes do Pedido</div>

                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  {(order.order_items || []).map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span>{item.quantity}x {item.products?.name || 'Produto'}</span>
                      <span>R$ {(item.unit_price * item.quantity).toFixed(2)}</span>
                    </div>
                  ))}
                </div>

                {order.motoboy_name && (
                  <div className="flex-between" style={{ fontSize: 13, marginBottom: 2 }}>
                    <span>Motoboy: {order.motoboy_name}</span>
                    {order.delivery_fee > 0 && <span>R$ {order.delivery_fee.toFixed(2)}</span>}
                  </div>
                )}

                <div className="flex-between" style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)', marginTop: 4, marginBottom: 8 }}>
                  <span>Total</span>
                  <span>R$ {order.total.toFixed(2)}</span>
                </div>

                <div style={{ fontSize: 12, color: '#888', marginBottom: showMap ? 8 : 0 }}>
                  📍 {shortAddress(order.customer_address)}
                </div>

                {showMap && order.customer_lat && order.store_lat && (
                  <div style={{ height: 160, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', marginTop: 8 }}>
                    <MapContainer
                      center={[(order.customer_lat + order.store_lat) / 2, ((order.customer_lng || 0) + (order.store_lng || 0)) / 2]}
                      zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                      <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <Marker position={[order.store_lat, order.store_lng]} icon={L.divIcon({ html: '<img src="/logo_placa.png" style="width:44px;height:44px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5))"/>', className: '', iconSize: [44, 44], iconAnchor: [22, 22] })} />
                      <Marker position={[order.customer_lat, order.customer_lng]} />
                      <RoutePolyline from={{ lat: order.store_lat, lng: order.store_lng }} to={{ lat: order.customer_lat, lng: order.customer_lng }} color="#4A148C" />
                    </MapContainer>
                  </div>
                )}

                {(order.status === 'arriving' || order.status === 'picked_up') && (
                  <div style={{ marginTop: 8 }}>
                    <span className="badge" style={{ background: '#FFF3E0', color: '#E65100', fontSize: 11 }}>
                      🏍️ Motoboy próximo!
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}

        <button className="btn btn-outline mt-4" onClick={loadOrders}>
          Atualizar Pedidos
        </button>
      </>
    );
  }

  function ProdutosView() {
    return (
      <>
        <div className="page-title">Cardápio</div>

        {lowStockProducts.length > 0 && (
          <div className="card" style={{ background: '#FFF3E0', border: '1px solid #FFE082', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#E65100', marginBottom: 4 }}>⚠️ Estoque baixo</div>
            {lowStockProducts.map(p => (
              <div key={p.id} style={{ fontSize: 12, color: '#BF360C', marginBottom: 2 }}>
                {p.name}: {p.stock_quantity} restante(s) (mín: {p.min_stock_alert})
              </div>
            ))}
          </div>
        )}

        <div className="card">
          {!productForm ? (
            <button className="btn btn-primary" onClick={openNewProduct} style={{ marginBottom: 16 }}>
              + Novo Produto
            </button>
          ) : (
            <div style={{ marginBottom: 16, padding: 16, background: '#F3E5F5', borderRadius: 12, border: '1px solid #E1BEE7' }}>
              <div className="text-sm font-bold mb-3" style={{ color: '#6A1B9A' }}>
                {productForm.id ? 'Editar Produto' : 'Novo Produto'}
              </div>
              <div className="form-group">
                <label className="label">Nome</label>
                <input className="input" type="text" value={productForm.name}
                  onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Açaí 500ml" />
              </div>
              <div className="form-group">
                <label className="label">Descrição</label>
                <input className="input" type="text" value={productForm.description}
                  onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Açaí puro batido com guaraná" />
              </div>
              <div className="flex-row" style={{ gap: 8 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="label">Preço (R$)</label>
                  <input className="input" type="number" step="0.01" value={productForm.price}
                    onChange={e => setProductForm(p => ({ ...p, price: e.target.value }))}
                    placeholder="25.00" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="label">Tamanho (ml)</label>
                  <select className="input" value={productForm.size_ml}
                    onChange={e => setProductForm(p => ({ ...p, size_ml: e.target.value }))}>
                    <option value="500">500ml (Meio Litro)</option>
                    <option value="1000">1 Litro</option>
                  </select>
                </div>
              </div>
              <div className="flex-row" style={{ gap: 8 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="label">Qtd em Estoque</label>
                  <input className="input" type="number" min="0" value={productForm.stock_quantity}
                    onChange={e => setProductForm(p => ({ ...p, stock_quantity: e.target.value }))}
                    placeholder="Ex: 50" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="label">Alerta Mínimo</label>
                  <input className="input" type="number" min="0" value={productForm.min_stock_alert}
                    onChange={e => setProductForm(p => ({ ...p, min_stock_alert: e.target.value }))}
                    placeholder="Ex: 5" />
                </div>
              </div>
              <div className="form-group">
                <label className="label">Imagem do Produto</label>
                <input type="file" accept="image/*" ref={productImgRef}
                  style={{ fontSize: 13 }} />
              </div>
              <div className="flex-row" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={saveProduct}>
                  {productForm.id ? 'Salvar' : 'Criar Produto'}
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => setProductForm(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {products.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: 20 }}>
                Nenhum produto cadastrado. Clique em "Novo Produto".
              </div>
            ) : (
              products.map(p => {
                const isLow = p.active && p.stock_quantity != null && p.min_stock_alert != null && p.stock_quantity <= p.min_stock_alert;
                return (
                <div key={p.id} className="flex-between card" style={{
                  padding: '12px 16px',
                  opacity: p.active ? 1 : 0.5,
                  background: p.active ? (isLow ? '#FFF8E1' : 'white') : '#F5F5F5'
                }}>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="flex-row" style={{ gap: 8, alignItems: 'center', marginBottom: 2 }}>
                      <span className="font-bold text-sm" style={{
                        textDecoration: p.active ? 'none' : 'line-through'
                      }}>{p.name}</span>
                      <span className="badge" style={{
                        background: '#E8F5E9', color: '#2E7D32', fontSize: 11, whiteSpace: 'nowrap'
                      }}>{p.size_ml}ml</span>
                      {!p.active && (
                        <span className="badge" style={{
                          background: '#FFEBEE', color: '#C62828', fontSize: 10
                        }}>Inativo</span>
                      )}
                    </div>
                    {p.description && (
                      <div className="text-xs text-muted" style={{ marginBottom: 2 }}>{p.description}</div>
                    )}
                    <div className="flex-row" style={{ gap: 12, alignItems: 'center', marginTop: 2 }}>
                      <div className="text-sm font-bold" style={{ color: '#6A1B9A' }}>
                        R$ {p.price.toFixed(2)}
                      </div>
                      <div style={{ fontSize: 12, color: isLow ? '#E65100' : '#555' }}>
                        Estoque: {p.stock_quantity != null ? p.stock_quantity : '—'}
                        {p.min_stock_alert != null && p.stock_quantity != null && (
                          <span style={{ color: '#999', marginLeft: 4 }}>
                            / min {p.min_stock_alert}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexShrink: 0 }}>
                    <button className="btn btn-sm"
                      style={{ fontSize: 11, padding: '4px 10px', background: '#F3E5F5', color: '#6A1B9A', border: 'none' }}
                      onClick={() => editProduct(p)}>
                      Editar
                    </button>
                    <button className="btn btn-sm"
                      style={{ fontSize: 11, padding: '4px 10px', background: p.active ? '#FFF3E0' : '#E8F5E9', color: p.active ? '#E65100' : '#2E7D32', border: 'none' }}
                      onClick={() => toggleProduct(p.id, p.active)}>
                      {p.active ? 'Desativar' : 'Ativar'}
                    </button>
                    <button className="btn btn-sm"
                      style={{ fontSize: 11, padding: '4px 10px', background: '#FFEBEE', color: '#C62828', border: 'none' }}
                      onClick={() => deleteProduct(p.id)}>
                      Excluir
                    </button>
                  </div>
                </div>
              );})
            )}
          </div>
        </div>
      </>
    );
  }

  function PerfilView() {
    if (perfilTab === 'dados') {
      return (
        <div className="card">
          <div className="page-title" style={{ fontSize: 18, marginBottom: 16 }}>Dados da Loja</div>
          <div className="form-group">
            <label className="label">Nome da Loja</label>
            <input className="input" type="text" value={settings.name}
              onChange={e => setSettings(s => ({ ...s, name: e.target.value }))}
              placeholder="Nome da loja" />
          </div>
          <div className="form-group">
            <label className="label">CPF / CNPJ</label>
            <input className="input" type="text" value={settings.cpf_cnpj}
              onChange={e => setSettings(s => ({ ...s, cpf_cnpj: e.target.value }))}
              placeholder="000.000.000-00 ou 00.000.000/0000-00" />
          </div>
          <div className="form-group">
            <label className="label">Chave PIX</label>
            <input className="input" type="text" value={settings.pix_key}
              onChange={e => setSettings(s => ({ ...s, pix_key: e.target.value }))}
              placeholder="CPF, telefone, e-mail ou chave aleatória" />
          </div>
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
            </div>
          </div>
          {saveMsg && (
            <div style={{ background: '#E8F5E9', color: '#2E7D32', padding: 10, borderRadius: 8, marginBottom: 12, textAlign: 'center', fontWeight: 600 }}>
              {saveMsg}
            </div>
          )}
          <button className="btn btn-primary" onClick={saveSettings} disabled={uploading} style={{ marginTop: 12 }}>
            {uploading ? 'Salvando...' : 'Salvar Dados'}
          </button>
        </div>
      );
    }

    if (perfilTab === 'endereco') {
      return <StoreAddressForm settings={settings} setSettings={setSettings} saveSettings={saveSettings} uploading={uploading} saveMsg={saveMsg} setSaveMsg={setSaveMsg} />;
    }

    if (perfilTab === 'trocar-senha') {
      return (
        <div className="card">
          <div className="page-title" style={{ fontSize: 18, marginBottom: 16 }}>Trocar Senha</div>
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
          <button className="btn btn-primary" onClick={async () => {
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
      );
    }

    if (perfilTab === 'mensagens') {
      return (
        <div>
          <StoreMessages messages={storeMessages} storeId={storeData?.id} apiFetch={apiFetch} onReload={loadMessages} />
        </div>
      );
    }

    if (perfilTab === 'vendas') {
      return FinanceiroTab();
    }

    if (perfilTab === 'motoboy') {
      return (
        <>
          <div className="page-title">Motoboys</div>
          <div className="card" style={{ background: '#E3F2FD', border: '1px solid #BBDEFB', marginBottom: 16 }}>
            <p className="text-xs text-muted" style={{ marginBottom: 4, fontWeight: 600 }}>Como funciona:</p>
            <p className="text-xs text-muted" style={{ marginBottom: 4 }}>
              <strong>Parceiro:</strong> você gera um link de convite, o motoboy se cadastra e recebe pedidos automaticamente.
            </p>
            <p className="text-xs text-muted">
              <strong>Independente:</strong> motoboys se cadastram sozinhos e escolhem quais pedidos aceitar.
            </p>
          </div>

          <div className="card">
            <div className="form-group">
              <label className="label">Convidar Motoboy Parceiro</label>
              <div className="flex-row" style={{ gap: 8 }}>
                <input className="input" type="text" value={motoboyPhone}
                  onChange={e => setMotoboyPhone(e.target.value)}
                  placeholder="WhatsApp do motoboy"
                  style={{ flex: 1 }} />
                <button className="btn btn-primary btn-sm"
                  onClick={generateInvite}
                  style={{ width: 'auto', whiteSpace: 'nowrap' }}>
                  Gerar Convite
                </button>
              </div>
              <span className="text-xs text-muted">Se o motoboy ja tiver cadastro, sera vinculado direto.</span>
            </div>

            {inviteLink && (
              <div style={{ background: '#E8F5E9', border: '1px solid #C8E6C9', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, color: '#2E7D32', marginBottom: 6, fontSize: 13 }}>Link de convite gerado:</div>
                <div style={{ background: 'white', padding: 8, borderRadius: 4, fontSize: 12, wordBreak: 'break-all', marginBottom: 8, border: '1px solid var(--border)' }}>
                  {inviteLink}
                </div>
                <button className="btn btn-primary btn-sm" onClick={copyInviteLink}>Copiar Link</button>
              </div>
            )}

            {motoboyMsg && (
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600,
                color: motoboyMsg.includes('Erro') || motoboyMsg.includes('invalido') ? '#C62828' : '#2E7D32' }}>
                {motoboyMsg}
              </div>
            )}

            <hr style={{ margin: '20px 0', borderTop: '1px solid var(--border)' }} />

            {invites.filter(i => !i.used).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label className="label">Convites Pendentes</label>
                {invites.filter(i => !i.used).map(inv => (
                  <div key={inv.id} style={{ padding: '8px 12px', background: '#FFF8E1', borderRadius: 8, border: '1px solid #FFE082', marginBottom: 6 }}>
                    <div className="flex-between" style={{ marginBottom: 4 }}>
                      <div className="text-sm font-bold">{inv.phone}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm"
                          style={{ fontSize: 11, padding: '4px 10px', background: '#E8F5E9', color: '#2E7D32', border: 'none' }}
                          onClick={() => copyInviteLinkToken(inv.token)}>Copiar Link</button>
                        <button className="btn btn-sm"
                          style={{ color: '#C62828', fontSize: 11, background: 'transparent', border: 'none' }}
                          onClick={() => revokeInvite(inv.id)}>Cancelar</button>
                      </div>
                    </div>
                    <div className="text-xs text-muted" style={{ wordBreak: 'break-all' }}>
                      {window.location.origin}/register?token={inv.token}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <label className="label">Motoboys Vinculados</label>
            {motoboys.length === 0 && invites.filter(i => !i.used).length === 0 ? (
              <div className="text-center text-muted" style={{ padding: 20 }}>
                Nenhum motoboy vinculado. Convide um motoboy parceiro pelo telefone acima.
              </div>
            ) : motoboys.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: 20 }}>
                Nenhum motoboy vinculado ainda. Aguardando cadastro dos convidados.
              </div>
            ) : (
              motoboys.map(m => (
                <div key={m.id} className="flex-between card" style={{
                  padding: '12px 16px',
                  background: m.employee ? '#F3E5F5' : '#FAFAFA',
                  border: m.employee ? '1px solid #E1BEE7' : '1px solid var(--border)'
                }}>
                  <div>
                    <div className="font-bold text-sm">{m.name}</div>
                    <div className="text-xs text-muted">{m.phone}</div>
                    <div style={{ marginTop: 4 }}>
                      <span className="badge" style={{
                        background: m.employee ? '#E8F5E9' : '#FFF3E0',
                        color: m.employee ? '#2E7D32' : '#E65100', fontSize: 11
                      }}>
                        {m.employee ? 'Parceiro (auto-designado)' : 'Independente (aceita pedidos)'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <div className="toggle-switch" onClick={() => toggleEmployee(m.id, m.employee)}
                      title={m.employee ? 'Tornar independente' : 'Tornar parceiro da loja'}>
                      <input type="checkbox" checked={!!m.employee} readOnly />
                      <span className="toggle-slider" />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {m.employee ? 'Parceiro' : 'Independente'}
                    </span>
                    <button className="btn btn-sm"
                      style={{ color: '#C62828', fontSize: 12, padding: '2px 8px', background: 'transparent' }}
                      onClick={() => removeMotoboy(m.id)}>Remover</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      );
    }

    if (perfilTab === 'assinatura') {
      const planoAtual = storeData?.plan || 'basico';
      const isPremium = planoAtual === 'premium';

      const Feature = ({ ok, text }) => (
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 8 }}>
          <span style={{ fontSize: 14, flexShrink: 0 }}>{ok ? '✅' : '🔒'}</span>
          <span style={{ fontSize: 13, color: ok ? 'var(--text)' : '#aaa' }}>{text}</span>
        </div>
      );

      return (
        <div>
          <div className="page-title" style={{ fontSize: 20, marginBottom: 20 }}>Assinatura</div>

          <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: 16 }}>

            {/* BÁSICO */}
            <div style={{ borderRadius: 16, border: `2px solid ${!isPremium ? '#6A1B9A' : '#e0e0e0'}`, padding: 20, position: 'relative', background: !isPremium ? '#fdf8ff' : 'white' }}>
              {!isPremium && (
                <div style={{ position: 'absolute', top: -12, left: 20, background: '#6A1B9A', color: 'white', fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 20 }}>
                  PLANO ATUAL
                </div>
              )}
              <div style={{ marginBottom: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#888' }}>Básico</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#1a1a1a' }}>Grátis</div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 16, marginTop: 2 }}>Para começar a vender</div>
              <Feature ok text="Painel de pedidos" />
              <Feature ok text="Cardápio digital (até 15 produtos)" />
              <Feature ok text="1 motoboy parceiro" />
              <Feature ok text="Pagamento via Pix e cartão (Mercado Pago)" />
              <Feature ok text="Notificações em tempo real" />
              <Feature ok={false} text="Relatório financeiro" />
              <Feature ok={false} text="Tela de TV (modo operação)" />
              <Feature ok={false} text="Motoboys ilimitados" />
              <Feature ok={false} text="Histórico de 90 dias" />
              <Feature ok={false} text="Exportação de dados (CSV)" />
              <Feature ok={false} text="Suporte prioritário via WhatsApp" />
            </div>

            {/* PREMIUM */}
            <div style={{ borderRadius: 16, border: `2px solid ${isPremium ? '#6A1B9A' : '#e0e0e0'}`, padding: 20, position: 'relative', background: isPremium ? '#fdf8ff' : 'white' }}>
              {isPremium && (
                <div style={{ position: 'absolute', top: -12, left: 20, background: '#6A1B9A', color: 'white', fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 20 }}>
                  PLANO ATUAL
                </div>
              )}
              <div style={{ position: 'absolute', top: -12, right: 20, background: 'linear-gradient(90deg,#FF6D00,#FF9100)', color: 'white', fontSize: 11, fontWeight: 700, padding: '3px 12px', borderRadius: 20 }}>
                ⭐ PREMIUM
              </div>
              <div style={{ marginBottom: 4, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, color: '#888' }}>Premium</div>
              <div style={{ fontSize: 30, fontWeight: 800, color: '#1a1a1a' }}>R$ 89<span style={{ fontSize: 15, fontWeight: 400, color: '#888' }}>/mês</span></div>
              <div style={{ fontSize: 12, color: '#888', marginBottom: 16, marginTop: 2 }}>Para quem quer crescer</div>
              <Feature ok text="Tudo do Básico" />
              <Feature ok text="Relatório financeiro completo" />
              <Feature ok text="Tela de TV (modo operação)" />
              <Feature ok text="Motoboys ilimitados" />
              <Feature ok text="Histórico de 90 dias" />
              <Feature ok text="Exportação de dados (CSV)" />
              <Feature ok text="Suporte prioritário via WhatsApp" />
              <Feature ok text="Alarme de motoboy chegando" />
              <Feature ok text="Dashboard de desempenho semanal" />
              {!isPremium && (
                <button style={{
                  marginTop: 16, width: '100%', background: 'linear-gradient(135deg, #6A1B9A, #9C27B0)',
                  color: 'white', border: 'none', borderRadius: 12, padding: '14px 0',
                  fontSize: 15, fontWeight: 700, cursor: 'pointer'
                }}>
                  Assinar Premium →
                </button>
              )}
            </div>
          </div>

          <div style={{ marginTop: 20, padding: '14px 16px', background: '#f9f5ff', borderRadius: 12, border: '1px solid #e1bee7', fontSize: 13, color: '#555' }}>
            💡 Dúvidas sobre os planos? Fale com a gente pelo WhatsApp:{' '}
            <a href="https://wa.me/5591999999999" target="_blank" rel="noopener noreferrer" style={{ color: '#6A1B9A', fontWeight: 700 }}>
              (91) 99999-9999
            </a>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="page-title" style={{ marginBottom: 16 }}>Perfil</div>

        {[
          { key: 'painel', icon: '📊', label: 'Painel' },
          { key: 'dados', icon: '📋', label: 'Dados' },
          { key: 'endereco', icon: '📍', label: 'Endereço' },
          { key: 'trocar-senha', icon: '🔒', label: 'Trocar Senha' },
          { key: 'mensagens', icon: '💬', label: 'Mensagens' },
          { key: 'vendas', icon: '💰', label: 'Vendas' },
          { key: 'motoboy', icon: '🏍️', label: 'Motoboy' },
          { key: 'assinatura', icon: '⭐', label: 'Assinatura' },
        ].map(item => (
          <div key={item.key} className="card" style={{ padding: '14px 16px', cursor: 'pointer', marginBottom: 8 }}
            onClick={() => { if (item.key === 'painel') { setView('painel'); setPerfilTab(null); } else { setPerfilTab(item.key); } }}>
            <div className="flex-between">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <span style={{ fontSize: 20 }}>{item.icon}</span>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{item.label}</span>
              </div>
              <span style={{ color: '#ccc', fontSize: 18 }}>›</span>
            </div>
          </div>
        ))}

        <button className="btn btn-outline" style={{ marginTop: 16, width: '100%', color: '#C62828', borderColor: '#FFCDD2' }}
          onClick={logout}>
          Sair da Conta
        </button>
      </>
    );
  }

  function PainelView() {
    const totalPedidosHoje = orders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString()).length;
    const faturamentoHoje = orders.filter(o => o.payment_status === 'paid' && new Date(o.created_at).toDateString() === new Date().toDateString()).reduce((s, o) => s + o.total, 0);
    const totalProdutos = products.filter(p => p.active).length;

    const statusColors = {
      confirmed:  { bg: '#FFF3E0', color: '#E65100', border: '#FFE0B2' },
      preparing:  { bg: '#E3F2FD', color: '#1565C0', border: '#BBDEFB' },
      ready:      { bg: '#E8F5E9', color: '#2E7D32', border: '#C8E6C9' },
      assigned:   { bg: '#F3E5F5', color: '#6A1B9A', border: '#E1BEE7' },
      picked_up:  { bg: '#F3E5F5', color: '#6A1B9A', border: '#E1BEE7' },
      in_transit: { bg: '#EDE7F6', color: '#4527A0', border: '#D1C4E9' },
      arriving:   { bg: '#FCE4EC', color: '#880E4F', border: '#F8BBD0' },
    };

    return (
      <div>
        {/* ─── KPI Row ─── */}
        {isDesktop ? (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            {/* Faturamento destacado */}
            <div style={{
              background: 'linear-gradient(135deg, #6A1B9A 0%, #9C27B0 55%, #CE93D8 100%)',
              borderRadius: 14, padding: '18px 22px', color: 'white', position: 'relative', overflow: 'hidden'
            }}>
              <div style={{ position: 'absolute', top: -15, right: -15, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
              <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Faturamento Hoje</div>
              <div style={{ fontSize: 32, fontWeight: 800, marginTop: 6, lineHeight: 1.1 }}>R$ {faturamentoHoje.toFixed(2)}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{totalPedidosHoje} pedido{totalPedidosHoje !== 1 ? 's' : ''} hoje</div>
            </div>
            {/* Ativos */}
            <div onClick={() => { setOrderFilter('ativos'); setView('pedidos'); }} style={{
              background: '#F3E5F5', borderRadius: 14, padding: '18px 16px', cursor: 'pointer',
              border: '1px solid #E1BEE7', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
            }}>
              <div style={{ fontSize: 10, color: '#7B1FA2', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ativos</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: '#6A1B9A', lineHeight: 1 }}>{pendingOrders.length}</div>
            </div>
            {/* Pendentes */}
            <div onClick={() => { setOrderFilter('pendentes'); setView('pedidos'); }} style={{
              background: '#FFF3E0', borderRadius: 14, padding: '18px 16px', cursor: 'pointer',
              border: '1px solid #FFE0B2', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
            }}>
              <div style={{ fontSize: 10, color: '#E65100', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pendentes</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: '#E65100', lineHeight: 1 }}>{pedidosPendentes}</div>
            </div>
            {/* Concluídos */}
            <div onClick={() => { setOrderFilter('concluidos'); setView('pedidos'); }} style={{
              background: '#E8F5E9', borderRadius: 14, padding: '18px 16px', cursor: 'pointer',
              border: '1px solid #C8E6C9', display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
            }}>
              <div style={{ fontSize: 10, color: '#2E7D32', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Concluídos</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: '#2E7D32', lineHeight: 1 }}>{concludedOrders.length}</div>
            </div>
          </div>
        ) : (
          /* Mobile: layout compacto */
          <>
            <div style={{ marginBottom: 14 }}>
              <div style={{ fontSize: 21, fontWeight: 800, color: '#1a1a1a' }}>Olá, {storeData?.name || 'Loja'}! 👋</div>
              <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>
                {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
              </div>
            </div>
            <div style={{ display: 'flex', gap: 12, marginBottom: 14 }}>
              <div style={{ background: '#F8F4FC', borderRadius: 14, padding: '14px 16px', border: '1px solid #E1BEE7', display: 'flex', flexDirection: 'column', gap: 10, flexShrink: 0 }}>
                <div>
                  <div style={{ fontSize: 10, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pedidos hoje</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a' }}>{totalPedidosHoje}</div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Loja</div>
                  <div style={{ fontSize: 13, fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: open ? '#43a047' : '#e53935', display: 'inline-block' }} />
                    {open ? 'Aberta' : 'Fechada'}
                  </div>
                </div>
                <div>
                  <div style={{ fontSize: 10, color: '#888', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5 }}>Produtos</div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: '#1a1a1a' }}>{totalProdutos}</div>
                </div>
              </div>
              <div style={{
                flex: 1, background: 'linear-gradient(135deg, #6A1B9A 0%, #9C27B0 55%, #CE93D8 100%)',
                borderRadius: 14, padding: '18px 20px', color: 'white', position: 'relative', overflow: 'hidden',
                display: 'flex', flexDirection: 'column', justifyContent: 'center'
              }}>
                <div style={{ position: 'absolute', top: -15, right: -15, width: 80, height: 80, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
                <div style={{ fontSize: 12, opacity: 0.8, fontWeight: 500 }}>Faturamento Hoje</div>
                <div style={{ fontSize: 28, fontWeight: 800, marginTop: 4 }}>R$ {faturamentoHoje.toFixed(2)}</div>
              </div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div onClick={() => { setOrderFilter('pendentes'); setView('pedidos'); }} style={{ background: '#FFF3E0', borderRadius: 14, padding: 14, cursor: 'pointer', border: '1px solid #FFE0B2' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#E65100' }}>{pedidosPendentes}</div>
                <div style={{ fontSize: 12, color: '#E65100', fontWeight: 600, marginTop: 2 }}>Pendentes</div>
              </div>
              <div onClick={() => { setOrderFilter('ativos'); setView('pedidos'); }} style={{ background: '#F3E5F5', borderRadius: 14, padding: 14, cursor: 'pointer', border: '1px solid #E1BEE7' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#6A1B9A' }}>{pendingOrders.length}</div>
                <div style={{ fontSize: 12, color: '#6A1B9A', fontWeight: 600, marginTop: 2 }}>Ativos</div>
              </div>
            </div>
          </>
        )}

        {/* ─── Alerta estoque baixo ─── */}
        {lowStockProducts.length > 0 && (
          <div style={{
            background: '#FFF3E0', borderRadius: 14, padding: '12px 16px', marginBottom: 16,
            border: '1px solid #FFE082', display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#E65100' }}>⚠️ Estoque baixo</div>
              <div style={{ fontSize: 12, color: '#BF360C', marginTop: 1 }}>
                {lowStockProducts.length} produto(s) precisam de reposição
              </div>
            </div>
            <button style={{ background: '#E65100', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              onClick={() => setView('produtos')}>
              Ver
            </button>
          </div>
        )}

        {/* ─── Pedidos em andamento ─── */}
        <div>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1a' }}>Pedidos em andamento</span>
              {pendingOrders.length > 0 && (
                <span style={{ background: '#6A1B9A', color: 'white', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                  {pendingOrders.length}
                </span>
              )}
            </div>
            <span onClick={() => setView('pedidos')} style={{ fontSize: 12, color: '#6A1B9A', fontWeight: 600, cursor: 'pointer' }}>
              Ver todos →
            </span>
          </div>

          {pendingOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#bbb', fontSize: 14, background: 'white', borderRadius: 14, border: '1px solid #f0f0f0' }}>
              Nenhum pedido ativo no momento
            </div>
          ) : (() => {
            const grupos = [
              { key: 'preparar',   label: 'Preparar',              emoji: '🔥', accentColor: '#E65100', bgColor: '#FFF3E0', statuses: ['confirmed'] },
              { key: 'preparando', label: 'Preparando',             emoji: '⏳', accentColor: '#1565C0', bgColor: '#E3F2FD', statuses: ['preparing'] },
              { key: 'pronto',     label: 'Pronto — aguarda motoboy', emoji: '✅', accentColor: '#2E7D32', bgColor: '#E8F5E9', statuses: ['ready'] },
              { key: 'motoboy',    label: 'Motoboy na loja',        emoji: '🛵', accentColor: '#6A1B9A', bgColor: '#EDE7F6', statuses: ['assigned'] },
              { key: 'entrega',    label: 'Saiu pra entrega',       emoji: '🚀', accentColor: '#00695C', bgColor: '#E0F2F1', statuses: ['picked_up', 'in_transit', 'arriving'] },
            ].map(g => ({ ...g, orders: pendingOrders.filter(o => g.statuses.includes(o.status)) }))
             .filter(g => g.orders.length > 0);

            const renderCard = (o) => {
              const action = actionMap[o.status];
              const sc = statusColors[o.status] || { bg: '#f5f5f5', color: '#666', border: '#e0e0e0' };
              const allItems = o.items || o.order_items || [];
              const itemsSummary = allItems.slice(0, 2).map(it => `${it.quantity}x ${it.product_name || it.products?.name || 'Item'}`).join(' · ') + (allItems.length > 2 ? ` +${allItems.length - 2}` : '');
              return (
                <div key={o.id} style={{
                  background: 'white', borderRadius: 14, padding: '14px 16px',
                  border: `1px solid ${sc.border}`, display: 'flex', flexDirection: 'column', gap: 8
                }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
                    <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {o.customer_name}
                    </div>
                    <span style={{ background: sc.bg, color: sc.color, borderRadius: 8, padding: '3px 8px', fontSize: 10, fontWeight: 700, whiteSpace: 'nowrap', flexShrink: 0 }}>
                      {statusLabels[o.status] || o.status}
                    </span>
                  </div>
                  {itemsSummary && (
                    <div style={{ fontSize: 12, color: '#888', lineHeight: 1.4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {itemsSummary}
                    </div>
                  )}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2 }}>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#333' }}>R$ {o.total.toFixed(2)}</div>
                    {action ? (
                      <button
                        onClick={() => updateStatus(o.id, action.next)}
                        style={{ background: '#6A1B9A', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                        {action.label}
                      </button>
                    ) : (
                      <span style={{ fontSize: 11, color: '#bbb' }}>
                        {new Date(o.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    )}
                  </div>
                </div>
              );
            };

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {grupos.map(g => (
                  <div key={g.key}>
                    {/* Separador de grupo */}
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 10 }}>
                      <div style={{
                        background: g.bgColor, border: `1px solid`, borderColor: g.bgColor,
                        borderRadius: 8, padding: '4px 10px', display: 'flex', alignItems: 'center', gap: 6
                      }}>
                        <span style={{ fontSize: 13 }}>{g.emoji}</span>
                        <span style={{ fontSize: 12, fontWeight: 700, color: g.accentColor, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                          {g.label}
                        </span>
                        <span style={{ background: g.accentColor, color: 'white', borderRadius: 8, padding: '1px 7px', fontSize: 11, fontWeight: 700 }}>
                          {g.orders.length}
                        </span>
                      </div>
                      <div style={{ flex: 1, height: 1, background: '#f0f0f0' }} />
                    </div>
                    {/* Cards do grupo */}
                    <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : '1fr', gap: 12 }}>
                      {g.orders.map(renderCard)}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: isDesktop ? 0 : 72 }}>

      {/* ─── SIDEBAR DESKTOP ─────────────────────── */}
      {isDesktop && (
        <div style={{
          position: 'fixed', left: 0, top: 0, bottom: 0, width: 240,
          background: 'white', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', zIndex: 100
        }}>
          {/* Marca */}
          <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              {storeData?.logo ? (
                <img src={storeData.logo} alt="Logo"
                  style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 800, fontSize: 24
                }}>{(storeData?.name || 'L').charAt(0)}</div>
              )}
              <div style={{ minWidth: 0, flex: 1 }}>
                <div style={{ fontWeight: 800, fontSize: 15, color: '#1a1a1a', lineHeight: 1.3, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {storeData?.name || 'Loja'}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 6 }}>
                  <div className="toggle-switch" onClick={toggleOpen} title={open ? 'Fechar loja' : 'Abrir loja'} style={{ transform: 'scale(0.85)', transformOrigin: 'left center' }}>
                    <input type="checkbox" checked={open} readOnly />
                    <span className="toggle-slider" />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 600, color: open ? 'var(--success)' : 'var(--danger)' }}>
                    {open ? 'Aberta' : 'Fechada'}
                  </span>
                </div>
              </div>
            </div>
          </div>

          {/* Navegação */}
          <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
            <div style={{ padding: '4px 16px 6px', fontSize: 10, fontWeight: 700, color: '#bbb', letterSpacing: 1, textTransform: 'uppercase' }}>Operação</div>
            {[
              { key: 'painel', icon: '📊', label: 'Painel', onClick: () => { setView('painel'); setPerfilTab(null); }, active: view === 'painel' && !perfilTab, badge: pendingOrders.length || null },
              { key: 'pedidos', icon: '📋', label: 'Pedidos', onClick: () => { setView('pedidos'); setPerfilTab(null); }, active: view === 'pedidos' && !perfilTab, badge: pendingOrders.length || null },
              { key: 'produtos', icon: '🧾', label: 'Produtos', onClick: () => { setView('produtos'); setPerfilTab(null); }, active: view === 'produtos' && !perfilTab },
              { key: 'financeiro', icon: '💰', label: 'Financeiro', isPremium: true, onClick: () => { if (storeData?.plan === 'premium') { setView('financeiro'); setPerfilTab(null); } else { setShowUpgradeModal(true); } }, active: view === 'financeiro' && !perfilTab },
            ].map(item => (
              <div key={item.key} onClick={item.onClick}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', margin: '1px 8px', cursor: 'pointer', borderRadius: 8, background: item.active ? '#F3E5F5' : 'transparent', color: item.active ? 'var(--primary)' : (item.isPremium && storeData?.plan !== 'premium' ? '#aaa' : '#555'), fontWeight: item.active ? 700 : 500, fontSize: 13 }}>
                <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.isPremium && storeData?.plan !== 'premium' && <span style={{ fontSize: 9, background: 'linear-gradient(90deg,#FF6D00,#FF9100)', color: 'white', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>PRO</span>}
                {item.badge > 0 && <span style={{ background: 'var(--primary)', color: 'white', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 5px', minWidth: 18, textAlign: 'center' }}>{item.badge}</span>}
              </div>
            ))}

            <div style={{ padding: '10px 16px 6px', fontSize: 10, fontWeight: 700, color: '#bbb', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 }}>Configurações</div>
            {[
              { key: 'dados', icon: '🏪', label: 'Dados da Loja' },
              { key: 'endereco', icon: '📍', label: 'Endereço' },
              { key: 'motoboy', icon: '🏍️', label: 'Motoboys' },
              { key: 'mensagens', icon: '💬', label: 'Mensagens', badge: unreadMessages || null },
              { key: 'assinatura', icon: '⭐', label: 'Assinatura' },
              { key: 'trocar-senha', icon: '🔑', label: 'Senha' },
            ].map(item => {
              const isActive = view === 'perfil' && perfilTab === item.key;
              return (
                <div key={item.key} onClick={() => { setView('perfil'); setPerfilTab(item.key); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', margin: '1px 8px', cursor: 'pointer', borderRadius: 8, background: isActive ? '#F3E5F5' : 'transparent', color: isActive ? 'var(--primary)' : '#555', fontWeight: isActive ? 700 : 500, fontSize: 13 }}>
                  <span style={{ fontSize: 15, flexShrink: 0 }}>{item.icon}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge > 0 && <span style={{ background: '#C62828', color: 'white', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 5px', minWidth: 18, textAlign: 'center' }}>{item.badge}</span>}
                </div>
              );
            })}
          </nav>

          {/* Rodapé sidebar */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => { if (storeData?.plan === 'premium') { setShowTV(true); } else { setShowUpgradeModal(true); } }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', background: '#1a1a2e', color: '#c8c8ff', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              📺 Ver na TV {storeData?.plan !== 'premium' && <span style={{ fontSize: 10, opacity: 0.6 }}>⭐</span>}
            </button>
            <button onClick={logout}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 12px', background: 'none', color: '#C62828', border: '1px solid #ffcdd2', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              🚪 Sair
            </button>
            <div style={{ textAlign: 'center', fontSize: 10, color: '#ccc', marginTop: 8, fontFamily: 'monospace', letterSpacing: 0.5 }}>
              build #{APP_BUILD}
            </div>
          </div>
        </div>
      )}

      {/* ─── ALERTA MOTOBOY CHEGANDO ─────────────── */}
      {motoboyAlert && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 99999, background: motoboyAlert.type === 'approaching' ? '#1b2e1a' : '#1a1a2e',
          color: 'white', borderRadius: 16, padding: '14px 24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', gap: 12,
          border: `2px solid ${motoboyAlert.type === 'approaching' ? '#43a047' : '#6A1B9A'}`,
          animation: 'pulse-border 0.6s infinite alternate',
          minWidth: 300, maxWidth: 420
        }}>
          <span style={{ fontSize: 30 }}>🛵</span>
          <div style={{ flex: 1 }}>
            {motoboyAlert.type === 'approaching' ? (
              <>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Motoboy chegando na loja!</div>
                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
                  {motoboyAlert.name} · <strong style={{ color: '#81c784' }}>{motoboyAlert.distanceMeters}m</strong> da loja
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Motoboy aceitou o pedido!</div>
                <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>{motoboyAlert.name} está a caminho da loja</div>
              </>
            )}
          </div>
          <button onClick={() => setMotoboyAlert(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 18, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
      )}

      {/* ─── ÁREA PRINCIPAL ─────────────────────── */}
      <div style={{ marginLeft: isDesktop ? 240 : 0 }}>

        {/* Header */}
        <div className="header" style={{ padding: '8px 16px' }}>
          {isDesktop ? (
            <>
              <div className="header-left" />
              <div className="header-right" style={{ gap: 8 }}>
                <div style={{ position: 'relative', cursor: 'pointer' }}
                  onClick={() => { setView('perfil'); setPerfilTab('mensagens'); }}>
                  {unreadMessages > 0 && (
                    <div style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: '#C62828', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                      {unreadMessages > 9 ? '9+' : unreadMessages}
                    </div>
                  )}
                  <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="header-left">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <div className="toggle-switch" onClick={toggleOpen} title={open ? 'Fechar loja' : 'Abrir loja'}>
                    <input type="checkbox" checked={open} readOnly />
                    <span className="toggle-slider" />
                  </div>
                  <span style={{ fontSize: 11, fontWeight: 700, color: open ? 'var(--success)' : 'var(--danger)' }}>
                    {open ? 'ABERTA' : 'FECHADA'}
                  </span>
                </div>
              </div>
              <div className="header-right" style={{ gap: 8 }}>
                <div style={{ position: 'relative', cursor: 'pointer' }}
                  onClick={() => { setView('perfil'); setPerfilTab('mensagens'); }}>
                  {unreadMessages > 0 && (
                    <div style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: '#C62828', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unreadMessages > 9 ? '9+' : unreadMessages}</div>
                  )}
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <div>
                  {storeData?.logo ? (
                    <img src={storeData.logo} alt="Logo"
                      style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, cursor: 'pointer' }}
                      onClick={() => { setView('perfil'); setPerfilTab(null); }}
                      onError={e => { e.target.style.display = 'none'; }} />
                  ) : (
                    <div style={{ width: 42, height: 42, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 18, flexShrink: 0, cursor: 'pointer' }}
                      onClick={() => { setView('perfil'); setPerfilTab(null); }}>
                      {(storeData?.name || 'L').charAt(0)}
                    </div>
                  )}
                </div>
              </div>
            </>
          )}
        </div>

        {/* Conteúdo */}
        <div className="container">
          {perfilTab && view === 'perfil' ? (
            <div>
              {!isDesktop && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div onClick={() => setPerfilTab(null)} style={{ width: 36, height: 36, borderRadius: '50%', background: '#F3E5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, fontWeight: 700, color: '#6A1B9A', flexShrink: 0 }}>‹</div>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{perfilTab === 'dados' ? 'Dados' : perfilTab === 'endereco' ? 'Endereço' : perfilTab === 'trocar-senha' ? 'Trocar Senha' : perfilTab === 'mensagens' ? 'Mensagens' : perfilTab === 'vendas' ? 'Vendas' : perfilTab === 'motoboy' ? 'Motoboys' : perfilTab === 'assinatura' ? 'Assinatura' : ''}</span>
                </div>
              )}
              {perfilTab === 'dados' && PerfilView()}
              {perfilTab === 'endereco' && <StoreAddressForm settings={settings} setSettings={setSettings} saveSettings={saveSettings} uploading={uploading} saveMsg={saveMsg} setSaveMsg={setSaveMsg} />}
              {perfilTab === 'trocar-senha' && PerfilView()}
              {perfilTab === 'mensagens' && <StoreMessages messages={storeMessages} storeId={storeData?.id} apiFetch={apiFetch} onReload={loadMessages} />}
              {perfilTab === 'vendas' && FinanceiroTab()}
              {perfilTab === 'motoboy' && PerfilView()}
              {perfilTab === 'assinatura' && PerfilView()}
            </div>
          ) : view === 'painel' ? (
            PainelView()
          ) : view === 'pedidos' ? (
            PedidosView()
          ) : view === 'produtos' ? (
            ProdutosView()
          ) : view === 'financeiro' ? (
            FinanceiroTab()
          ) : view === 'perfil' ? (
            PerfilView()
          ) : null}
        </div>

        {/* Nav mobile (bottom) */}
        {!isDesktop && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: 'white', borderTop: '1px solid var(--border)',
            display: 'flex', zIndex: 1000,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)'
          }}>
            {[
              { key: 'painel', icon: '📊', label: 'Painel' },
              { key: 'pedidos', icon: '📋', label: 'Pedidos' },
              { key: 'produtos', icon: '🧾', label: 'Produtos' },
              { key: 'financeiro', icon: '💰', label: 'Financeiro', isPremium: true },
              { key: 'perfil', icon: '👤', label: 'Perfil' },
            ].map(item => (
              <div key={item.key} style={{
                flex: 1, textAlign: 'center', padding: '8px 4px',
                cursor: 'pointer', opacity: view === item.key ? 1 : 0.5,
                borderTop: view === item.key ? '2px solid var(--primary)' : '2px solid transparent',
                background: view === item.key ? '#F3E5F5' : 'transparent'
              }} onClick={() => {
                if (item.isPremium && storeData?.plan !== 'premium') { setShowUpgradeModal(true); return; }
                setView(item.key); if (item.key !== 'perfil') setPerfilTab(null);
              }}>
                <div style={{ fontSize: 18 }}>{item.icon}</div>
                <div style={{ fontSize: 10, fontWeight: 600, color: view === item.key ? 'var(--primary)' : '#888', marginTop: 2 }}>
                  {item.label}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* ─── MODAL UPGRADE PREMIUM ────────────── */}
      {showUpgradeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 99998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setShowUpgradeModal(false)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 40, marginBottom: 8 }}>⭐</div>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a1a' }}>Recurso Premium</div>
              <div style={{ fontSize: 14, color: '#666', marginTop: 6, lineHeight: 1.5 }}>Este recurso está disponível apenas no plano Premium.</div>
            </div>
            <div style={{ background: '#fdf8ff', borderRadius: 12, padding: '14px 16px', marginBottom: 20, border: '1px solid #e1bee7' }}>
              {[
                '💰 Relatório financeiro completo',
                '📺 Tela de TV (modo operação)',
                '🏍️ Motoboys ilimitados',
                '📊 Dashboard de desempenho',
                '📁 Exportação de dados CSV',
                '💬 Suporte prioritário WhatsApp',
              ].map((f, i) => (
                <div key={i} style={{ fontSize: 13, color: '#555', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>{f}</div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#1a1a1a' }}>R$ 89<span style={{ fontSize: 14, fontWeight: 400, color: '#888' }}>/mês</span></div>
            </div>
            <button
              onClick={() => { setShowUpgradeModal(false); setView('perfil'); setPerfilTab('assinatura'); }}
              style={{ width: '100%', background: 'linear-gradient(135deg, #6A1B9A, #9C27B0)', color: 'white', border: 'none', borderRadius: 12, padding: '14px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
              Ver planos →
            </button>
            <button onClick={() => setShowUpgradeModal(false)}
              style={{ width: '100%', background: 'none', border: 'none', color: '#aaa', fontSize: 13, cursor: 'pointer', padding: 8 }}>
              Agora não
            </button>
          </div>
        </div>
      )}

      {/* ─── TV OVERLAY ─────────────────────── */}
      {showTV && (() => {
        const tvBg = tvLight ? '#f0f2f5' : '#0d0d1a';
        const tvCard = tvLight ? 'white' : 'rgba(255,255,255,0.05)';
        const tvText = tvLight ? '#1a1a1a' : 'white';
        const tvSub = tvLight ? '#666' : 'rgba(255,255,255,0.45)';
        const tvDivider = tvLight ? '#e8e8e8' : 'rgba(255,255,255,0.07)';
        const tvHdrBg = tvLight ? 'white' : 'rgba(10,10,30,0.95)';
        const tvHdrBorder = tvLight ? '#e0e0e0' : 'rgba(255,255,255,0.07)';
        const tvStatBg = tvLight ? '#f8f8f8' : 'rgba(255,255,255,0.06)';
        const tvStatBorder = tvLight ? '#e0e0e0' : 'rgba(255,255,255,0.1)';

        const tvActive = pendingOrders;
        const cntPronto = tvActive.filter(o => o.status === 'ready').length;
        const cntPrep = tvActive.filter(o => ['confirmed', 'preparing'].includes(o.status)).length;
        const cntCaminho = tvActive.filter(o => ['assigned', 'picked_up', 'in_transit', 'arriving'].includes(o.status)).length;
        const tvGroups = [
          { label: 'PREPARAR',        emoji: '🔥', color: '#E65100', bg: 'rgba(230,81,0,0.1)',    border: 'rgba(230,81,0,0.28)',    orders: tvActive.filter(o => o.status === 'confirmed') },
          { label: 'PREPARANDO',      emoji: '⏳', color: '#1e88e5', bg: 'rgba(30,136,229,0.08)', border: 'rgba(30,136,229,0.25)', orders: tvActive.filter(o => o.status === 'preparing') },
          { label: 'PRONTO',          emoji: '✅', color: '#00a844', bg: 'rgba(0,168,68,0.1)',    border: 'rgba(0,168,68,0.28)',    orders: tvActive.filter(o => o.status === 'ready') },
          { label: 'MOTOBOY NA LOJA', emoji: '🛵', color: '#8e24aa', bg: 'rgba(142,36,170,0.08)', border: 'rgba(142,36,170,0.25)', orders: tvActive.filter(o => o.status === 'assigned') },
          { label: 'SAIU',            emoji: '🚀', color: '#00695C', bg: 'rgba(0,105,92,0.08)',  border: 'rgba(0,105,92,0.25)',   orders: tvActive.filter(o => ['picked_up', 'in_transit', 'arriving'].includes(o.status)) },
        ].filter(g => g.orders.length > 0);

        const btnBase = { width: 44, height: 44, borderRadius: 10, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: tvLight ? '1px solid #ddd' : '1px solid rgba(255,255,255,0.12)' };

        return (
          <div style={{ position: 'fixed', inset: 0, background: tvBg, zIndex: 9999, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Barra superior */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 16, padding: '12px 28px', borderBottom: `1px solid ${tvHdrBorder}`, flexShrink: 0, background: tvHdrBg }}>
              {storeData?.logo && (
                <img src={storeData.logo} alt="Logo" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: tvText, fontWeight: 800, fontSize: 19, lineHeight: 1.2 }}>{storeData?.name || 'Loja'}</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: open ? '#00a844' : '#e53935' }}>{open ? '● Loja Aberta' : '● Loja Fechada'}</div>
              </div>
              <div style={{ color: tvText, fontWeight: 800, fontSize: 38, fontVariantNumeric: 'tabular-nums', letterSpacing: 2 }}>{tvTime}</div>
              <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
                {/* Tema claro/escuro */}
                <button onClick={() => setTvLight(v => !v)} title={tvLight ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
                  style={{ ...btnBase, background: tvLight ? '#f0f0f0' : 'rgba(255,255,255,0.07)', color: tvLight ? '#e65100' : 'rgba(255,255,255,0.6)' }}>
                  {tvLight ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                  )}
                </button>
                {/* Cadeado */}
                <button onClick={() => setTvLocked(v => !v)} title={tvLocked ? 'Desbloquear — permite fechar' : 'Bloquear — impede fechar acidentalmente'}
                  style={{ ...btnBase, background: tvLocked ? 'rgba(255,180,0,0.15)' : tvLight ? '#f0f0f0' : 'rgba(255,255,255,0.07)', border: tvLocked ? '1px solid rgba(255,180,0,0.45)' : btnBase.border, color: tvLocked ? '#ffb400' : tvLight ? '#555' : 'rgba(255,255,255,0.5)' }}>
                  {tvLocked ? '🔒' : '🔓'}
                </button>
                {/* Fechar */}
                <button onClick={() => { if (!tvLocked) setShowTV(false); }} title={tvLocked ? 'Desbloqueie o cadeado primeiro' : 'Fechar TV'}
                  style={{ ...btnBase, background: tvLight ? '#f0f0f0' : 'rgba(255,255,255,0.05)', color: tvLocked ? (tvLight ? '#ccc' : 'rgba(255,255,255,0.15)') : tvLight ? '#333' : 'rgba(255,255,255,0.65)', cursor: tvLocked ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 22 }}>
                  ✕
                </button>
              </div>
            </div>

            {/* Barra de stats */}
            <div style={{ display: 'flex', gap: 10, padding: '10px 28px', borderBottom: `1px solid ${tvHdrBorder}`, flexShrink: 0, background: tvHdrBg }}>
              {[
                { label: 'Ativos', value: tvActive.length, color: tvText, bg: tvStatBg, border: tvStatBorder },
                { label: 'Prontos', value: cntPronto, color: '#00a844', bg: 'rgba(0,168,68,0.08)', border: 'rgba(0,168,68,0.25)' },
                { label: 'Preparando', value: cntPrep, color: '#1e88e5', bg: 'rgba(30,136,229,0.08)', border: 'rgba(30,136,229,0.22)' },
                { label: 'A Caminho', value: cntCaminho, color: '#8e24aa', bg: 'rgba(142,36,170,0.08)', border: 'rgba(142,36,170,0.22)' },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '8px 12px', background: s.bg, borderRadius: 8, border: `1px solid ${s.border}` }}>
                  <div style={{ color: tvSub, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                  <div style={{ color: s.color, fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Cards de pedidos */}
            <div style={{ flex: 1, overflow: 'auto', padding: '20px 28px' }}>
              {tvActive.length === 0 ? (
                <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: tvSub, fontSize: 22, fontWeight: 600 }}>
                  Nenhum pedido ativo no momento
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                  {tvGroups.map(group => (
                    <div key={group.label}>
                      {/* Cabeçalho do grupo */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '6px 14px', background: group.bg, borderRadius: 8, border: `1px solid ${group.border}`, width: 'fit-content' }}>
                        <span style={{ fontSize: 15 }}>{group.emoji}</span>
                        <span style={{ color: group.color, fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>{group.label}</span>
                        <span style={{ color: group.color, fontSize: 13, fontWeight: 700, opacity: 0.75 }}>· {group.orders.length}</span>
                      </div>
                      {/* Grid de cards — responsivo por largura da tela */}
                      <div style={{ display: 'grid', gridTemplateColumns: `repeat(${window.innerWidth >= 2560 ? 5 : window.innerWidth >= 1920 ? 4 : 3}, 1fr)`, gap: 14 }}>
                        {group.orders.map(o => {
                          const action = actionMap[o.status];
                          return (
                            <div key={o.id} style={{ background: tvCard, borderRadius: 14, padding: '18px 20px', border: `1px solid ${group.border}` }}>
                              {/* Linha topo: nome + badge status */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                                <div style={{ color: tvText, fontWeight: 800, fontSize: 18, lineHeight: 1.3 }}>{o.customer_name}</div>
                                <span style={{ color: group.color, fontSize: 12, fontWeight: 700, background: group.bg, padding: '3px 10px', borderRadius: 6, border: `1px solid ${group.border}`, whiteSpace: 'nowrap', marginLeft: 10, flexShrink: 0 }}>
                                  {statusLabels[o.status] || o.status}
                                </span>
                              </div>
                              {/* Divider + itens */}
                              <div style={{ borderTop: `1px solid ${tvDivider}`, paddingTop: 10, marginBottom: 8 }}>
                                <div style={{ color: tvSub, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Detalhes do Pedido</div>
                                {(o.items || o.order_items || []).map((it, i) => (
                                  <div key={i} style={{ color: tvText, fontSize: 15, marginBottom: 3, fontWeight: 500 }}>
                                    {it.quantity}x {it.product_name || it.products?.name || 'Produto'}
                                  </div>
                                ))}
                              </div>
                              {o.motoboy_name && (
                                <div style={{ color: tvSub, fontSize: 14, marginBottom: 8 }}>
                                  🛵 <span style={{ color: tvText, fontWeight: 800, fontSize: 17 }}>{o.motoboy_name}</span>
                                </div>
                              )}
                              {/* Rodapé: id+hora + valor + botão ação */}
                              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${tvDivider}` }}>
                                <div>
                                  <div style={{ color: tvSub, fontSize: 12 }}>#{String(o.id).slice(-4)} · {new Date(o.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                                  <div style={{ color: group.color, fontWeight: 800, fontSize: 18, marginTop: 2 }}>R$ {o.total.toFixed(2)}</div>
                                </div>
                                {action && (
                                  <button
                                    onClick={() => updateStatus(o.id, action.next)}
                                    style={{ background: group.color, color: 'white', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                    {action.label}
                                  </button>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}
