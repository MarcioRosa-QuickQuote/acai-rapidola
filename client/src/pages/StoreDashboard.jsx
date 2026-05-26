import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import RoutePolyline from '../components/RouteMap';
import StoreMessages from '../components/StoreMessages';

function abbr(s) {
  if (!s) return s;
  return s.replace(/\bPassagem\b/gi, 'Pass.').replace(/\bTravessa\b/gi, 'Tv.').replace(/\bAvenida\b/gi, 'Av.').replace(/\bAlameda\b/gi, 'Al.').replace(/\bPraça\b/gi, 'Praç.').replace(/\bRodovia\b/gi, 'Rod.').replace(/\bEstrada\b/gi, 'Est.');
}

function shortAddress(full) {
  if (!full) return '';
  const parts = full.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return '';
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
  pending: 'Aguardando pgto', confirmed: 'Preparar', preparing: 'Preparando',
  ready: 'Saiu pra entrega', assigned: 'Saiu pra entrega', picked_up: 'Saiu pra entrega',
  in_transit: 'Saiu pra entrega', arriving: 'Saiu pra entrega',
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
  preparing: { label: 'Saiu pra entrega', next: 'ready' }
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
  const addrSearchRef = useRef(null);

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
    socket.on('order_status', () => loadOrders());
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

  async function useMyLocationStore() {
    if (!navigator.geolocation) { setSaveMsg('Geolocalização não disponível'); setTimeout(() => setSaveMsg(''), 3000); return; }
    setSavingAddr(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setSettings(s => ({ ...s, lat: String(latitude.toFixed(6)), lng: String(longitude.toFixed(6)) }));
        try {
          const res = await fetch(`/api/orders/reverse-geocode?lat=${latitude}&lng=${longitude}`);
          const data = await res.json();
          if (data.display_name) {
            setSettings(s => ({ ...s, address: data.display_name }));
          }
        } catch {}
        await saveSettings();
        setSavingAddr(false);
      },
      () => { setSaveMsg('Permissão de localização negada'); setSavingAddr(false); setTimeout(() => setSaveMsg(''), 3000); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 }
    );
  }

  let searchAddrTimer = useRef(null);

  function searchStoreAddress(q) {
    if (searchAddrTimer.current) clearTimeout(searchAddrTimer.current);
    if (q.length < 3) { setAddressSuggestions([]); setShowAddrSuggestions(false); setSearchingAddr(false); return; }
    setSearchingAddr(true);
    searchAddrTimer.current = setTimeout(async () => {
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=br&limit=5&addressdetails=1`;
        const res = await fetch(nomUrl, { headers: { 'User-Agent': 'AçaiRapidola/1.0' } });
        const data = await res.json();
        const results = (data || []).map(r => ({
          display_name: r.display_name,
          lat: r.lat,
          lon: r.lon
        }));
        setAddressSuggestions(results);
        setShowAddrSuggestions(results.length > 0);
      } catch { setShowAddrSuggestions(false); }
      setSearchingAddr(false);
    }, 350);
  }

  function selectStoreAddress(suggestion) {
    setSettings(s => ({ ...s, address: suggestion.display_name, lat: suggestion.lat, lng: suggestion.lon }));
    setShowAddrSuggestions(false);
    setAddressSuggestions([]);
  }

  async function lookupStoreCep() {
    const cleaned = cep.replace(/\D/g, '');
    if (cleaned.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`/api/orders/cep/${cleaned}`);
      const data = await res.json();
      if (data.error) {
        setSaveMsg(data.error);
        setTimeout(() => setSaveMsg(''), 3000);
        return;
      }
      setSettings(s => ({ ...s, address: data.display_name }));
      if (data.lat && data.lon) {
        setSettings(s => ({ ...s, lat: String(data.lat), lng: String(data.lon) }));
      }
      setShowAddrSuggestions(false);
    } catch {
      setSaveMsg('Erro ao consultar CEP');
      setTimeout(() => setSaveMsg(''), 3000);
    } finally {
      setCepLoading(false);
    }
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
          <div className={isDesktop ? 'grid-2' : ''}>
          {displayOrders.map(order => {
            const expanded = selectedOrder === order.id;
            const hasAction = order.payment_status === 'paid' && actionMap[order.status];
            const showMap = showMapForOrder === order.id;
            return (
            <div key={order.id} className="card" style={{ cursor: 'pointer' }}
              onClick={() => setSelectedOrder(selectedOrder === order.id ? null : order.id)}>
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

              <div style={{ fontSize: 12, cursor: 'pointer', color: '#6A1B9A', textDecoration: 'underline', marginBottom: showMap ? 8 : 0 }}
                onClick={(e) => { e.stopPropagation(); setShowMapForOrder(showMap ? null : order.id); }}>
                📍 {shortAddress(order.customer_address)}
              </div>

              {showMap && order.customer_lat && order.store_lat && (
                <div style={{ height: 160, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 8 }}>
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

              {expanded && (
                <div style={{ marginTop: 12, padding: '12px 0', borderTop: '1px solid var(--border)' }}>
                  {(order.status === 'arriving' || order.status === 'picked_up') && (
                    <span className="badge" style={{ background: '#FFF3E0', color: '#E65100', fontSize: 11 }}>
                      ALERTA: Motoboy próximo!
                    </span>
                  )}
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
                  placeholder="Ex: Acai 500ml" />
              </div>
              <div className="form-group">
                <label className="label">Descricao</label>
                <input className="input" type="text" value={productForm.description}
                  onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Acai puro batido com guarana" />
              </div>
              <div className="flex-row" style={{ gap: 8 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="label">Preco (R$)</label>
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
              placeholder="CPF, telefone, e-mail ou chave aleatoria" />
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
      return (
        <div className="card">
          <div className="page-title" style={{ fontSize: 18, marginBottom: 16 }}>Endereço da Loja</div>

          <button type="button" className="btn btn-outline btn-sm"
            onClick={useMyLocationStore} disabled={savingAddr}
            style={{ width: '100%', justifyContent: 'flex-start', gap: 8, marginBottom: 10, padding: '10px 14px' }}>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
              <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
              <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
            </svg>
            {savingAddr ? 'Obtendo localização...' : 'Usar minha localização'}
          </button>

          <div style={{ position: 'relative', marginBottom: 8 }}>
            <input className="input" type="text" value={settings.address}
              onChange={e => { setSettings(s => ({ ...s, address: e.target.value })); searchStoreAddress(e.target.value); }}
              onFocus={() => { if (addressSuggestions.length > 0) setShowAddrSuggestions(true); }}
              onBlur={() => setTimeout(() => setShowAddrSuggestions(false), 200)}
              placeholder="Buscar rua, número, bairro…"
              style={{ paddingRight: 40 }} />
            {settings.address && (
              <button type="button" onClick={() => { setSettings(s => ({ ...s, address: '' })); setAddressSuggestions([]); setShowAddrSuggestions(false); }}
                style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: 18, color: '#999', cursor: 'pointer', padding: '4px', lineHeight: 1 }}>
                ✕
              </button>
            )}
            {searchingAddr && (
              <span style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#BBB' }}>…</span>
            )}
            {showAddrSuggestions && addressSuggestions.length > 0 && (
              <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'white', border: '1px solid #DDD', borderRadius: 8, maxHeight: 220, overflow: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
                {addressSuggestions.map((s, i) => (
                  <div key={i} onMouseDown={() => selectStoreAddress(s)}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F5F5F5', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                    <span style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }}>📍</span>
                    <span>{s.display_name}</span>
                  </div>
                ))}
              </div>
            )}
          </div>

          {settings.lat && settings.lng && (
            <div style={{ marginBottom: 12 }}>
              <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Use o mapa para ajustar o ponto exato</div>
              <div style={{ height: 200, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                <MapContainer center={[parseFloat(settings.lat) || mapCenter[0], parseFloat(settings.lng) || mapCenter[1]]} zoom={16}
                  style={{ height: '100%', width: '100%' }}
                  key={`store-map-${settings.lat || 0}-${settings.lng || 0}`} scrollWheelZoom={false}>
                  <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker position={[parseFloat(settings.lat) || mapCenter[0], parseFloat(settings.lng) || mapCenter[1]]} draggable={true}
                    eventHandlers={{
                      dragend: (e) => {
                        const { lat, lng } = e.target.getLatLng();
                        setSettings(s => ({ ...s, lat: String(lat.toFixed(6)), lng: String(lng.toFixed(6)) }));
                      }
                    }} />
                </MapContainer>
              </div>
            </div>
          )}

          {!showCep ? (
            <button type="button" onClick={() => setShowCep(true)}
              style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 0', textDecoration: 'underline' }}>
              Buscar por CEP
            </button>
          ) : (
            <div className="flex-row" style={{ gap: 8, marginBottom: 8 }}>
              <input className="input" type="text" value={cep}
                onChange={e => { setCep(e.target.value.replace(/\D/g, '').slice(0, 8)); }}
                placeholder="CEP (ex: 01001000)" maxLength={8} style={{ width: 140, flexShrink: 0 }} />
              <button type="button" className="btn btn-sm btn-secondary"
                onClick={lookupStoreCep} disabled={cepLoading || cep.replace(/\D/g, '').length !== 8}
                style={{ whiteSpace: 'nowrap' }}>{cepLoading ? '...' : 'Buscar CEP'}</button>
            </div>
          )}

          {saveMsg && (
            <div style={{ background: '#E8F5E9', color: '#2E7D32', padding: 10, borderRadius: 8, marginBottom: 12, textAlign: 'center', fontWeight: 600 }}>
              {saveMsg}
            </div>
          )}

          <button className="btn btn-primary" style={{ marginTop: 14, width: '100%' }} onClick={saveSettings} disabled={uploading}>
            {uploading ? 'Salvando...' : 'Salvar Endereço'}
          </button>
        </div>
      );
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
      return <FinanceiroTab />;
    }

    if (perfilTab === 'motoboy') {
      return (
        <>
          <div className="page-title">Motoboys</div>
          <div className="card" style={{ background: '#E3F2FD', border: '1px solid #BBDEFB', marginBottom: 16 }}>
            <p className="text-xs text-muted" style={{ marginBottom: 4, fontWeight: 600 }}>Como funciona:</p>
            <p className="text-xs text-muted" style={{ marginBottom: 4 }}>
              <strong>Parceiro:</strong> voce gera um link de convite, o motoboy se cadastra e recebe pedidos automaticamente.
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
                  placeholder="WhatsApp do motoboy (ex: 11999999999)"
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
      return (
        <div className="card" style={{ textAlign: 'left' }}>
          <div className="page-title" style={{ fontSize: 20 }}>Assinatura</div>
          <div style={{
            background: 'linear-gradient(135deg, #6A1B9A, #4A148C)',
            borderRadius: 14, padding: 24, color: 'white', textAlign: 'center', marginBottom: 16
          }}>
            <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>Plano Atual</div>
            <div style={{ fontSize: 36, fontWeight: 800 }}>R$ 89<span style={{ fontSize: 16, fontWeight: 400 }}>/mês</span></div>
            <div style={{ fontSize: 12, opacity: 0.7, marginTop: 6 }}>Plano Profissional</div>
          </div>
          <div style={{ fontSize: 13, color: 'var(--text-light)', lineHeight: 1.6 }}>
            <div style={{ marginBottom: 8 }}>✅ Pedidos ilimitados</div>
            <div style={{ marginBottom: 8 }}>✅ Até 5 motoboys parceiros</div>
            <div style={{ marginBottom: 8 }}>✅ Pagamento via Mercado Pago</div>
            <div style={{ marginBottom: 8 }}>✅ Gestão de cardápio</div>
            <div style={{ marginBottom: 8 }}>✅ Suporte prioritário</div>
          </div>
        </div>
      );
    }

    return (
      <>
        <div className="page-title" style={{ marginBottom: 16 }}>Perfil</div>

        {[
          { key: 'dados', icon: '📋', label: 'Dados' },
          { key: 'endereco', icon: '📍', label: 'Endereço' },
          { key: 'trocar-senha', icon: '🔒', label: 'Trocar Senha' },
          { key: 'mensagens', icon: '💬', label: 'Mensagens' },
          { key: 'vendas', icon: '💰', label: 'Vendas' },
          { key: 'motoboy', icon: '🏍️', label: 'Motoboy' },
          { key: 'assinatura', icon: '⭐', label: 'Assinatura' },
        ].map(item => (
          <div key={item.key} className="card" style={{ padding: '14px 16px', cursor: 'pointer', marginBottom: 8 }}
            onClick={() => setPerfilTab(item.key)}>
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
    const motoboysAtivos = motoboys.length;

    return (
      <div>
        <div style={{ marginBottom: 16 }}>
          <div style={{ fontSize: 24, fontWeight: 800, color: '#333' }}>Olá, {storeData?.name || 'Loja'}! 👋</div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 4 }}>
            {new Date().toLocaleDateString('pt-BR', { weekday: 'long', day: 'numeric', month: 'long' })}
          </div>
        </div>

        <div className={isDesktop ? 'grid-2' : ''} style={{ marginBottom: 16 }}>
          <div className="card" style={{
            background: 'linear-gradient(135deg, #6A1B9A, #9C27B0)',
            color: 'white', border: 'none', padding: 20
          }}>
            <div style={{ fontSize: 13, opacity: 0.8 }}>Status da Loja</div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
              <div style={{
                width: 12, height: 12, borderRadius: '50%',
                background: open ? '#69F0AE' : '#FF8A80',
                boxShadow: open ? '0 0 12px rgba(105,240,174,0.6)' : '0 0 12px rgba(255,138,128,0.6)'
              }} />
              <span style={{ fontSize: 20, fontWeight: 800 }}>
                {open ? 'ABERTA' : 'FECHADA'}
              </span>
            </div>
          </div>

          <div className="card" style={{
            background: 'linear-gradient(135deg, #1B5E20, #388E3C)',
            color: 'white', border: 'none', padding: 20
          }}>
            <div style={{ fontSize: 13, opacity: 0.8 }}>Faturamento Hoje</div>
            <div style={{ fontSize: 26, fontWeight: 800, marginTop: 4 }}>
              R$ {faturamentoHoje.toFixed(2)}
            </div>
          </div>
        </div>

        <div className={isDesktop ? 'grid-3' : ''} style={{ marginBottom: 16 }}>
          <div className="card text-center" style={{ padding: 16, background: '#F3E5F5', border: 'none' }}
            onClick={() => setView('pedidos')}>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#6A1B9A' }}>{pendingOrders.length}</div>
            <div style={{ fontSize: 12, color: '#6A1B9A', fontWeight: 600 }}>Pedidos Ativos</div>
          </div>
          <div className="card text-center" style={{ padding: 16, background: '#FFF3E0', border: 'none' }}
            onClick={() => setView('pedidos')}>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#E65100' }}>{pedidosPendentes}</div>
            <div style={{ fontSize: 12, color: '#E65100', fontWeight: 600 }}>Pendentes</div>
          </div>
          <div className="card text-center" style={{ padding: 16, background: '#E8F5E9', border: 'none' }}
            onClick={() => setView('produtos')}>
            <div style={{ fontSize: 32, fontWeight: 800, color: '#2E7D32' }}>{totalProdutos}</div>
            <div style={{ fontSize: 12, color: '#2E7D32', fontWeight: 600 }}>Produtos</div>
          </div>
          {isDesktop && (
            <>
              <div className="card text-center" style={{ padding: 16, background: '#E3F2FD', border: 'none' }}
                onClick={() => setView('pedidos')}>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#1565C0' }}>{totalPedidosHoje}</div>
                <div style={{ fontSize: 12, color: '#1565C0', fontWeight: 600 }}>Pedidos Hoje</div>
              </div>
              <div className="card text-center" style={{ padding: 16, background: '#FCE4EC', border: 'none' }}
                onClick={() => setView('perfil')}>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#C62828' }}>{motoboysAtivos}</div>
                <div style={{ fontSize: 12, color: '#C62828', fontWeight: 600 }}>Motoboys</div>
              </div>
              <div className="card text-center" style={{ padding: 16, background: '#FFF8E1', border: 'none' }}
                onClick={() => setView('financeiro')}>
                <div style={{ fontSize: 32, fontWeight: 800, color: '#F57F17' }}>{concludedOrders.length}</div>
                <div style={{ fontSize: 12, color: '#F57F17', fontWeight: 600 }}>Concluídos Hoje</div>
              </div>
            </>
          )}
        </div>

        {lowStockProducts.length > 0 && (
          <div className="card" style={{ background: '#FFF3E0', border: '1px solid #FFE082', marginBottom: 16 }}>
            <div className="flex-between">
              <div>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#E65100' }}>⚠️ Estoque baixo</div>
                <div style={{ fontSize: 12, color: '#BF360C', marginTop: 4 }}>
                  {lowStockProducts.length} produto(s) abaixo do mínimo
                </div>
              </div>
              <button className="btn btn-sm btn-outline" style={{ fontSize: 12 }} onClick={() => { setView('produtos'); }}>
                Ver produtos
              </button>
            </div>
          </div>
        )}

        <div className={isDesktop ? 'grid-2' : ''}>
          <div className="card" style={{ padding: 16 }}>
            <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: '#333' }}>🕐 Últimos Pedidos</div>
            {orders.slice(0, 5).map(o => (
              <div key={o.id} className="flex-between" style={{ fontSize: 13, padding: '6px 0', borderBottom: '1px solid #f0f0f0' }}>
                <span style={{ fontWeight: 600 }}>{o.customer_name}</span>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                  <span className={`badge ${o.payment_status === 'paid' ? 'badge-success' : 'badge-warning'}`} style={{ fontSize: 10 }}>
                    {o.payment_status === 'paid' ? 'Pago' : 'Pendente'}
                  </span>
                  <span style={{ fontWeight: 700, color: '#6A1B9A' }}>R$ {o.total.toFixed(2)}</span>
                </div>
              </div>
            ))}
            <button className="btn btn-outline btn-sm" style={{ marginTop: 12, width: '100%', fontSize: 12 }}
              onClick={() => setView('pedidos')}>
              Ver todos os pedidos
            </button>
          </div>

          {isDesktop && (
            <div className="card" style={{ padding: 16 }}>
              <div style={{ fontWeight: 700, fontSize: 15, marginBottom: 12, color: '#333' }}>📊 Resumo Rápido</div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <span style={{ color: '#888' }}>Pedidos pagos hoje:</span>
                <span style={{ fontWeight: 700, float: 'right' }}>
                  {orders.filter(o => o.payment_status === 'paid' && new Date(o.created_at).toDateString() === new Date().toDateString()).length}
                </span>
              </div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <span style={{ color: '#888' }}>Taxa de entrega média:</span>
                <span style={{ fontWeight: 700, float: 'right' }}>
                  R$ {orders.filter(o => o.delivery_fee).reduce((s, o, _, a) => s + (o.delivery_fee || 0) / a.length, 0).toFixed(2)}
                </span>
              </div>
              <div style={{ fontSize: 13, marginBottom: 8 }}>
                <span style={{ color: '#888' }}>Ticket médio:</span>
                <span style={{ fontWeight: 700, float: 'right' }}>
                  R$ {orders.filter(o => o.payment_status === 'paid').reduce((s, o, _, a) => s + o.total / a.length, 0).toFixed(2) || '0.00'}
                </span>
              </div>
              <div style={{ fontSize: 13 }}>
                <span style={{ color: '#888' }}>Produtos em estoque baixo:</span>
                <span style={{ fontWeight: 700, float: 'right', color: lowStockProducts.length > 0 ? '#E65100' : '#2E7D32' }}>
                  {lowStockProducts.length}
                </span>
              </div>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: isDesktop ? 0 : 72 }}>
      <div className="header" style={{ padding: '8px 16px' }}>
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
        <div className="header-right" style={{ gap: 10 }}>
          <div style={{ position: 'relative', cursor: 'pointer' }}
            onClick={() => { setView('perfil'); setPerfilTab('mensagens'); }}>
            {unreadMessages > 0 && (
              <div style={{
                position: 'absolute', top: -4, right: -4,
                width: 18, height: 18, borderRadius: '50%',
                background: '#C62828', color: 'white',
                fontSize: 10, fontWeight: 700,
                display: 'flex', alignItems: 'center', justifyContent: 'center'
              }}>{unreadMessages > 9 ? '9+' : unreadMessages}</div>
            )}
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
          </div>
          <div style={{ position: 'relative' }}>
            {storeData?.logo ? (
              <img src={storeData.logo} alt="Logo"
                style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, cursor: 'pointer' }}
                onClick={(e) => { e.stopPropagation(); if (isDesktop) setShowDesktopMenu(v => !v); else { setView('perfil'); setPerfilTab(null); } }}
                onError={e => { e.target.style.display = 'none'; }} />
            ) : (
              <div style={{
                width: 36, height: 36, borderRadius: '50%',
                background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 800, fontSize: 16, flexShrink: 0, cursor: 'pointer'
              }}
                onClick={(e) => { e.stopPropagation(); if (isDesktop) setShowDesktopMenu(v => !v); else { setView('perfil'); setPerfilTab(null); } }}>
                {(storeData?.name || 'L').charAt(0)}
              </div>
            )}
            {isDesktop && showDesktopMenu && (
              <div style={{ position: 'absolute', top: '100%', right: 0, zIndex: 1000, background: 'white', borderRadius: 12, boxShadow: '0 4px 20px rgba(0,0,0,0.15)', border: '1px solid var(--border)', overflow: 'hidden', minWidth: 200, marginTop: 4 }}>
                {[
                  { key: 'dados', icon: '📋', label: 'Dados' },
                  { key: 'endereco', icon: '📍', label: 'Endereço' },
                  { key: 'trocar-senha', icon: '🔒', label: 'Trocar Senha' },
                  { key: 'mensagens', icon: '💬', label: 'Mensagens' },
                  { key: 'vendas', icon: '💰', label: 'Vendas' },
                  { key: 'motoboy', icon: '🏍️', label: 'Motoboy' },
                  { key: 'assinatura', icon: '⭐', label: 'Assinatura' },
                ].map(item => (
                  <div key={item.key} style={{ padding: '12px 16px', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 10, borderBottom: '1px solid #f5f5f5' }}
                    onClick={() => { setView('perfil'); setPerfilTab(item.key); setShowDesktopMenu(false); }}>
                    <span>{item.icon}</span>
                    <span style={{ fontWeight: 500 }}>{item.label}</span>
                  </div>
                ))}
                <div style={{ padding: '12px 16px', cursor: 'pointer', fontSize: 14, display: 'flex', alignItems: 'center', gap: 10, color: '#C62828' }}
                  onClick={() => { logout(); setShowDesktopMenu(false); }}>
                  <span>🚪</span>
                  <span style={{ fontWeight: 500 }}>Sair</span>
                </div>
              </div>
            )}
          </div>
        </div>
      </div>

      <div className="container">
        {perfilTab && view === 'perfil' ? (
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
              <div onClick={() => setPerfilTab(null)} style={{
                width: 36, height: 36, borderRadius: '50%',
                background: '#F3E5F5', display: 'flex', alignItems: 'center', justifyContent: 'center',
                cursor: 'pointer', fontSize: 18, fontWeight: 700, color: '#6A1B9A', flexShrink: 0
              }}>‹</div>
              <span style={{ fontWeight: 700, fontSize: 16 }}>{perfilTab === 'dados' ? 'Dados' : perfilTab === 'endereco' ? 'Endereço' : perfilTab === 'trocar-senha' ? 'Trocar Senha' : perfilTab === 'mensagens' ? 'Mensagens' : perfilTab === 'vendas' ? 'Vendas' : perfilTab === 'motoboy' ? 'Motoboys' : perfilTab === 'assinatura' ? 'Assinatura' : ''}</span>
            </div>
            {perfilTab === 'dados' && <PerfilView />}
            {perfilTab === 'endereco' && <PerfilView />}
            {perfilTab === 'trocar-senha' && <PerfilView />}
            {perfilTab === 'mensagens' && <PerfilView />}
            {perfilTab === 'vendas' && <PerfilView />}
            {perfilTab === 'motoboy' && <PerfilView />}
            {perfilTab === 'assinatura' && <PerfilView />}
          </div>
        ) : view === 'painel' ? (
          <PainelView />
        ) : view === 'pedidos' ? (
          <PedidosView />
        ) : view === 'produtos' ? (
          <ProdutosView />
        ) : view === 'financeiro' ? (
          <FinanceiroTab />
        ) : view === 'perfil' ? (
          <PerfilView />
        ) : null}
      </div>

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
            { key: 'financeiro', icon: '💰', label: 'Financeiro' },
            { key: 'perfil', icon: '👤', label: 'Perfil' },
          ].map(item => (
            <div key={item.key} style={{
              flex: 1, textAlign: 'center', padding: '8px 4px',
              cursor: 'pointer', opacity: view === item.key ? 1 : 0.5,
              borderTop: view === item.key ? '2px solid var(--primary)' : '2px solid transparent',
              background: view === item.key ? '#F3E5F5' : 'transparent'
            }} onClick={() => { setView(item.key); if (item.key !== 'perfil') setPerfilTab(null); }}>
              <div style={{ fontSize: 18 }}>{item.icon}</div>
              <div style={{ fontSize: 10, fontWeight: 600, color: view === item.key ? 'var(--primary)' : '#888', marginTop: 2 }}>
                {item.label}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
