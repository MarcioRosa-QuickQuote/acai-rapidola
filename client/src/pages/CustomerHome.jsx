import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CustomerHeader from '../components/CustomerHeader';
import CustomerBottomNav from '../components/CustomerBottomNav';
import { useSocket } from '../contexts/SocketContext';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const statusLabels = {
  pending: 'Aguardando', confirmed: 'Confirmado', preparing: 'Preparando',
  ready: 'Pronto', assigned: 'Saiu para entrega', picked_up: 'A caminho',
  arriving: 'Chegando', delivered: 'Entregue', cancelled: 'Cancelado'
};

const statusColors = {
  pending: 'badge-warning', confirmed: 'badge-primary', preparing: 'badge-primary',
  ready: 'badge-success', assigned: 'badge-info', picked_up: 'badge-info',
  arriving: 'badge-accent', delivered: 'badge-success', cancelled: 'badge-danger'
};

export default function CustomerHome() {
  const { user, apiFetch, logout } = useAuth();
  const { socket, joinOrder } = useSocket();
  const { storeId } = useParams();
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [activeOrder, setActiveOrder] = useState(null);
  const [favorites, setFavorites] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fav_stores') || '[]'); }
    catch { return []; }
  });
  const isFavorited = storeId && favorites.includes(storeId);
  function toggleFavorite() {
    const next = isFavorited ? favorites.filter(id => id !== storeId) : [...favorites, storeId];
    setFavorites(next);
    localStorage.setItem('fav_stores', JSON.stringify(next));
  }
  const [view, setView] = useState('menu');
  const [mainTab, setMainTab] = useState('menu');
  const [contaTab, setContaTab] = useState('perfil');
  const [perfilExpanded, setPerfilExpanded] = useState(false);
  const [perfilSection, setPerfilSection] = useState(null);
  const [showCepConta, setShowCepConta] = useState(false);
  const [showCart, setShowCart] = useState(false);
  const [contaMapLat, setContaMapLat] = useState(null);
  const [contaMapLng, setContaMapLng] = useState(null);
  const [savedAddresses, setSavedAddresses] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user_addresses') || '[]'); }
    catch { return []; }
  });
  const [showAddrForm, setShowAddrForm] = useState(false);
  const [addrLabel, setAddrLabel] = useState('');

  useEffect(() => {
    localStorage.setItem('user_addresses', JSON.stringify(savedAddresses));
  }, [savedAddresses]);

  function addAddress() {
    if (!addrForm || addrForm.length < 5) { setAddrMsg('Digite um endereço'); setTimeout(() => setAddrMsg(''), 3000); return; }
    const label = addrLabel || 'Endereço ' + (savedAddresses.length + 1);
    setSavedAddresses(prev => [...prev, {
      id: Date.now().toString(),
      label,
      address: addrForm,
      lat: contaMapLat,
      lng: contaMapLng
    }]);
    setAddrForm(null);
    setAddrLabel('');
    setContaMapLat(null);
    setContaMapLng(null);
    setShowAddrForm(false);
    setAddrMsg('Endereço adicionado!');
    setTimeout(() => setAddrMsg(''), 3000);
  }

  function removeAddress(id) {
    setSavedAddresses(prev => prev.filter(a => a.id !== id));
  }

  function setPrimaryAddress(addr) {
    setAddrForm(addr.address);
    if (addr.lat && addr.lng) {
      setContaMapLat(addr.lat);
      setContaMapLng(addr.lng);
    }
  }

  function formatAddressLines(addr) {
    if (!addr) return { line1: '', line2: '', line3: '' };
    const parts = addr.split(',').map(p => p.trim());
    return {
      line1: parts.slice(0, 2).join(', '),
      line2: parts[2] || '',
      line3: parts.slice(3, 5).join(', ')
    };
  }

  function shortAddress(full) {
    if (!full) return '';
    const parts = full.split(',').map(s => s.trim());
    const street = parts[0] || '';
    const number = parts[1] || '';
    const neighborhood = parts[2] || '';
    let result = street;
    if (number && !/^\d/.test(street.slice(-4))) result += `, ${number}`;
    if (neighborhood) result += ` - ${neighborhood}`;
    return result;
  }

  function cleanNominatimAddress(displayName) {
    return displayName || '';
  }
  const [searchParams] = useSearchParams();
  const [cart, setCart] = useState(() => {
    try { return JSON.parse(sessionStorage.getItem('cart') || '{}'); }
    catch { return {}; }
  });
  const [splitItems, setSplitItems] = useState({});

  useEffect(() => {
    sessionStorage.setItem('cart', JSON.stringify(cart));
  }, [cart]);
  const [loading, setLoading] = useState(true);
  const [addrForm, setAddrForm] = useState(null);
  const [savingAddr, setSavingAddr] = useState(false);
  const [addrMsg, setAddrMsg] = useState('');
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [placesSource, setPlacesSource] = useState(null);
  const [cep, setCep] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [searchingAddr, setSearchingAddr] = useState(false);
  const photoRef = useRef(null);
  const searchDebounceRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (searchParams.get('tab') === 'conta') setView('conta');
  }, [searchParams]);

  useEffect(() => {
    if (!storeId) {
      setView('conta');
      setLoading(false);
      return;
    }
    let storeDone = false;
    let productsDone = false;
    function tryDone() {
      if (storeDone && productsDone) setLoading(false);
    }
    apiFetch(`/products?store_id=${storeId}`).then(d => {
      if (d.data) setProducts(d.data);
      if (!sessionStorage.getItem('cart')) {
        setCart({});
        setSplitItems({});
      }
      productsDone = true;
      tryDone();
    });
    apiFetch(`/stores/${storeId}`).then(d => {
      if (d.ok) setStore(d);
      storeDone = true;
      tryDone();
    });
    loadOrders();
  }, [storeId]);

  useEffect(() => {
    if (!socket) return;
    socket.on('order_status', (data) => {
      setOrders(prev => prev.map(o =>
        o.id === data.orderId ? { ...o, status: data.status } : o
      ));
    });
    socket.on('payment_confirmed', (data) => {
      setOrders(prev => prev.map(o =>
        o.id === data.orderId ? { ...o, payment_status: 'paid', status: 'confirmed' } : o
      ));
    });
    return () => {
      socket.off('order_status');
      socket.off('payment_confirmed');
    };
  }, [socket]);

  useEffect(() => {
    const active = orders.find(o => o.payment_status === 'paid' && !['delivered','cancelled'].includes(o.status));
    setActiveOrder(active || null);
  }, [orders]);

  function loadOrders() {
    apiFetch('/orders').then(d => {
      if (d.data) {
        setOrders(d.data);
        const active = d.data.find(o => o.payment_status === 'paid' && !['delivered','cancelled'].includes(o.status));
        setActiveOrder(active || null);
      }
    });
  }

  function addToCart(productId) {
    setCart(prev => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
  }

  function removeFromCart(productId) {
    setCart(prev => {
      const updated = { ...prev };
      if (updated[productId] <= 1) delete updated[productId];
      else updated[productId]--;
      return updated;
    });
  }

  function goToOrder(productId) {
    const prod = products.find(pp => pp.id === productId);
    if (prod && store) {
      navigate('/customer/order', {
        state: { product: prod, store, quantity: cart[productId] || 1, splitCount: splitItems[productId] || 0 }
      });
    }
  }

  if (loading) return <div className="loading"><img className="spin" src="/saco_acai.png" /></div>;

  return (
    <div style={{ minHeight: '100vh', paddingBottom: storeId ? 0 : 72 }}>
      {!storeId ? (
        <CustomerHeader onBack={() => navigate('/customer')} />
      ) : (
        <div style={{ background: '#f5f0eb url(/fundo.jpg) center top / cover no-repeat' }}>
          <div className="header" style={{ position: 'static', background: 'transparent', borderBottom: 'none' }}>
            <div className="header-left">
              <button className="btn btn-sm"
                style={{ background: 'var(--border)', color: 'var(--primary-dark)', fontSize: 22, width: 36, height: 36, borderRadius: '50%', padding: 0, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
                onClick={() => navigate('/customer')}>
                ‹
              </button>
            </div>
            <div className="header-right" style={{ gap: 6 }}>
              {activeOrder && activeOrder.payment_status === 'paid' && !['delivered','cancelled'].includes(activeOrder.status) && (
                <div onClick={() => navigate(`/customer/tracking/${activeOrder.id}`)}
                  style={{ background: 'var(--bg)', borderRadius: 20, padding: '4px 6px 8px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <img src="/saco_acai.png" style={{ width: 20, height: 20, objectFit: 'contain' }} />
                </div>
              )}
              <button onClick={() => navigate('/customer/notificacoes')}
                style={{ background: 'var(--bg)', border: 'none', borderRadius: 20, padding: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--primary)">
                  <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
                </svg>
              </button>
              {Object.keys(cart).length > 0 && (
                <button className="btn btn-sm" onClick={() => setShowCart(!showCart)}
                  style={{ background: '#FFF3E0', color: '#E65100', fontSize: 14, fontWeight: 700, padding: '4px 8px', border: 'none', borderRadius: 20, width: 'auto', position: 'relative' }}>
                  🛒
                  <span style={{ position: 'absolute', top: -4, right: -6, background: '#C62828', color: 'white', fontSize: 10, width: 18, height: 18, borderRadius: '50%', display: 'flex', alignItems: 'center', justifyContent: 'center', fontWeight: 700 }}>
                    {Object.values(cart).reduce((a, b) => a + b, 0)}
                  </span>
                </button>
              )}
              {storeId && (
                <button onClick={toggleFavorite}
                  style={{ background: 'var(--bg)', border: 'none', borderRadius: 20, padding: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                  <svg width="20" height="20" viewBox="0 0 24 24" fill={isFavorited ? '#E53935' : '#999'}>
                    <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
                  </svg>
                </button>
              )}
            </div>
          </div>
          {store && (
            <div style={{ textAlign: 'center', padding: '12px 20px 0', position: 'relative', zIndex: 1 }}>
              <div style={{ width: 72, height: 72, borderRadius: '50%', overflow: 'hidden', margin: '0 auto 6px', border: '3px solid rgba(255,255,255,0.5)', background: `linear-gradient(135deg, ${store.color_primary || '#6A1B9A'}, ${store.color_secondary || '#4A148C'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {store.logo ? (
                  <img src={store.logo} alt={store.name} style={{ width: '100%', height: '100%', objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                ) : (
                  <span style={{ color: 'white', fontWeight: 800, fontSize: 28 }}>{store.name.charAt(0).toUpperCase()}</span>
                )}
              </div>
              <div style={{ fontWeight: 800, fontSize: 17, color: 'white', textShadow: '0 1px 3px rgba(0,0,0,0.3)', marginBottom: 6 }}>{store.name}</div>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                <div style={{ height: 1, background: 'rgba(255,255,255,0.3)', width: '70%', marginBottom: 5 }} />
                <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.9)', fontWeight: 600, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 4, paddingBottom: 8, whiteSpace: 'nowrap' }}>
                  Entrega
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.7)', display: 'inline-block' }} />
                  24-35 min
                  <span style={{ width: 4, height: 4, borderRadius: '50%', background: 'rgba(255,255,255,0.7)', display: 'inline-block' }} />
                  R$ 6,50
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="container" style={{ paddingTop: 12, background: 'var(--bg)' }}>
        {view === 'conta' ? renderConta() : renderMenu()}
      </div>

      {!storeId && <CustomerBottomNav />}
    </div>
  );

  function renderConta() {
    const currentAddr = addrForm !== null ? addrForm : (user?.address || '');

    async function useMyLocationConta() {
      if (!navigator.geolocation) { setAddrMsg('Geolocalização não disponível'); setTimeout(() => setAddrMsg(''), 3000); return; }
      setSavingAddr(true);
      navigator.geolocation.getCurrentPosition(
        async (pos) => {
          const { latitude, longitude } = pos.coords;
          let foundAddr = '';
          try {
            const res = await fetch(`/api/orders/reverse-geocode?lat=${latitude}&lng=${longitude}`);
            const data = await res.json();
            if (data.display_name) {
              foundAddr = shortAddress(data.display_name);
            } else {
              setAddrMsg(data.error || 'Endereço não encontrado. Digite manualmente.');
            }
          } catch (err) {
            console.error('Reverse geocode error:', err);
            setAddrMsg('Erro ao buscar endereço. Digite manualmente.');
          }
          if (foundAddr) {
            setAddrForm(foundAddr);
            const saveRes = await apiFetch('/auth/profile', {
              method: 'PATCH',
              body: JSON.stringify({ address: foundAddr, lat: latitude, lng: longitude })
            });
            if (saveRes.ok) {
              setAddrMsg('Endereço salvo com sucesso!');
              window.location.reload();
            } else {
              setAddrMsg('Endereço preenchido. Clique em Salvar.');
            }
          }
          setSavingAddr(false);
          setTimeout(() => setAddrMsg(''), 4000);
        },
        () => {
          setAddrMsg('Permissão de localização negada');
          setSavingAddr(false);
          setTimeout(() => setAddrMsg(''), 3000);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 }
      );
    }

    async function saveAddress() {
      setSavingAddr(true);
      const newAddr = addrForm || '';
      const data = await apiFetch('/auth/profile', { method: 'PATCH', body: JSON.stringify({ address: newAddr }) });
      if (data.ok) {
        setAddrMsg('Endereço salvo!');
        window.location.reload();
      } else {
        setAddrMsg(data.error || 'Erro ao salvar');
      }
      setTimeout(() => setAddrMsg(''), 3000);
      setSavingAddr(false);
    }

    async function clearAddress() {
      setSavingAddr(true);
      setAddrForm('');
      const data = await apiFetch('/auth/profile', { method: 'PATCH', body: JSON.stringify({ address: '', lat: null, lng: null }) });
      if (data.ok) {
        setAddrMsg('Endereço removido!');
        window.location.reload();
      } else {
        setAddrMsg(data.error || 'Erro ao remover');
      }
      setTimeout(() => setAddrMsg(''), 3000);
      setSavingAddr(false);
    }

    function searchAddress(q) {
      if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
      if (q.length < 3) { setAddressSuggestions([]); setShowSuggestions(false); setSearchingAddr(false); return; }
      const lat = contaMapLat || user?.lat || '';
      const lng = contaMapLng || user?.lng || '';
      setSearchingAddr(true);
      searchDebounceRef.current = setTimeout(async () => {
        try {
          const params = new URLSearchParams({ q });
          if (lat) params.set('lat', lat);
          if (lng) params.set('lng', lng);
          const res = await fetch(`/api/orders/places-autocomplete?${params}`);
          const data = await res.json();
          let results = data.results || [];
          if (results.length === 0 && q.length >= 5) {
            const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=br&limit=7&addressdetails=1${lat && lng ? `&viewbox=${parseFloat(lng)-0.05},${parseFloat(lat)+0.05},${parseFloat(lng)+0.05},${parseFloat(lat)-0.05}&bounded=1` : ''}`, { headers: { 'User-Agent': 'PedeAcai/1.0' } });
            const nomData = await nomRes.json();
            results = (nomData || []).map(r => ({
              display_name: shortAddress(r.display_name) || r.display_name,
              lat: r.lat,
              lon: r.lon
            }));
          } else {
            results = results.map(r => ({ ...r, display_name: shortAddress(r.display_name) || r.display_name }));
          }
          setAddressSuggestions(results);
          setShowSuggestions(results.length > 0);
        } catch { setShowSuggestions(false); }
        setSearchingAddr(false);
      }, 350);
    }

    async function lookupCep() {
      const cleaned = cep.replace(/\D/g, '');
      if (cleaned.length !== 8) return;
      setCepLoading(true);
      try {
        const res = await fetch(`/api/orders/cep/${cleaned}`);
        const data = await res.json();
        if (data.error) {
          setAddrMsg(data.error);
          setTimeout(() => setAddrMsg(''), 3000);
          return;
        }
        setAddrForm(data.display_name);
        setShowSuggestions(false);
      } catch {
        setAddrMsg('Erro ao consultar CEP');
        setTimeout(() => setAddrMsg(''), 3000);
      } finally {
        setCepLoading(false);
      }
    }

    async function selectAddress(suggestion) {
      let name = suggestion.display_name;
      const numMatch = addrForm?.match(/(\d[\d\s\-]*)$/);
      if (numMatch && !name.includes(numMatch[1].trim())) {
        name = name.replace(/^(.+?)(\s*-\s*.*)?$/, `$1, ${numMatch[1].trim()}$2`);
      }
      setAddrForm(name);
      setShowSuggestions(false);
      if (suggestion.lat && suggestion.lon) {
        setContaMapLat(parseFloat(suggestion.lat));
        setContaMapLng(parseFloat(suggestion.lon));
      } else if (suggestion.place_id) {
        try {
          const res = await fetch(`/api/orders/place-details?place_id=${suggestion.place_id}`);
          const data = await res.json();
          if (data.lat && data.lon) {
            setContaMapLat(parseFloat(data.lat));
            setContaMapLng(parseFloat(data.lon));
            if (data.display_name) setAddrForm(data.display_name);
          }
        } catch {}
      }
    }

    async function geocodeConta() {
      const addr = addrForm || user?.address;
      if (!addr || addr.length < 5) return;
      setSavingAddr(true);
      try {
        const res = await fetch(`/api/orders/geocode?q=${encodeURIComponent(addr)}`);
        const data = await res.json();
        if (data.length > 0) {
          setContaMapLat(parseFloat(data[0].lat));
          setContaMapLng(parseFloat(data[0].lon));
        } else {
          setAddrMsg('Endereço não encontrado');
          setTimeout(() => setAddrMsg(''), 3000);
        }
      } catch {
        setAddrMsg('Erro ao buscar endereço');
        setTimeout(() => setAddrMsg(''), 3000);
      } finally {
        setSavingAddr(false);
      }
    }

    async function uploadPhoto(file) {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/products/upload-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      const data = await res.json();
      if (data.url) {
        await apiFetch('/auth/profile', { method: 'PATCH', body: JSON.stringify({ photo_url: data.url }) });
        window.location.reload();
      }
    }

    function NavCard({ icon, label, onClick }) {
      return (
        <div onClick={onClick} style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px', cursor: 'pointer', background: 'white' }}>
          <div style={{ width: 40, height: 40, borderRadius: 12, background: '#F3E5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>{icon}</div>
          <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{label}</span>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="#BBB"><path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/></svg>
        </div>
      );
    }

    function DadosSection({ user, apiFetch }) {
      const [name, setName] = useState(user?.name || '');
      const [cpf, setCpf] = useState(user?.cpf || '');
      const [saving, setSaving] = useState(false);
      const [msg, setMsg] = useState('');

      async function save() {
        setSaving(true);
        const res = await apiFetch('/auth/profile', { method: 'PATCH', body: JSON.stringify({ name: name.trim(), cpf }) });
        if (res.ok) {
          setMsg('Dados salvos!');
          setTimeout(() => { setMsg(''); window.location.reload(); }, 1200);
        } else {
          setMsg(res.error || 'Erro ao salvar');
          setTimeout(() => setMsg(''), 3000);
        }
        setSaving(false);
      }

      return (
        <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'white' }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>
            ID único: {user?.email || user?.phone}
          </div>
          <div className="form-group" style={{ marginTop: 12 }}>
            <label className="label">Nome</label>
            <input className="input" type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Seu nome" />
          </div>
          <div className="form-group">
            <label className="label">CPF</label>
            <input className="input" type="text" value={cpf}
              onChange={e => setCpf(e.target.value.replace(/\D/g, '').slice(0, 11))}
              placeholder="Somente números" maxLength={11} />
          </div>
          {msg && <div style={{ fontSize: 13, fontWeight: 600, color: msg.includes('Erro') ? '#C62828' : '#2E7D32', marginBottom: 8 }}>{msg}</div>}
          <button className="btn btn-primary" style={{ width: '100%' }} onClick={save} disabled={saving || !name.trim()}>
            {saving ? 'Salvando...' : 'Salvar'}
          </button>
        </div>
      );
    }

    function CardRow({ icon, label, onClick, children, expanded }) {
      return (
        <div style={{ borderBottom: '1px solid var(--border)' }}>
          <div onClick={onClick} style={{
            display: 'flex', alignItems: 'center', gap: 14, padding: '16px 20px',
            cursor: 'pointer', background: 'white'
          }}>
            <div style={{ width: 40, height: 40, borderRadius: 12, background: '#F3E5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
              {icon}
            </div>
            <span style={{ flex: 1, fontWeight: 600, fontSize: 15 }}>{label}</span>
            <svg width="18" height="18" viewBox="0 0 24 24" fill="#BBB" style={{ transform: expanded ? 'rotate(90deg)' : 'none', transition: 'transform 0.2s' }}>
              <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
            </svg>
          </div>
          {expanded && <div style={{ background: '#FAFAFA', padding: '4px 0 8px' }}>{children}</div>}
        </div>
      );
    }

    function SubCard({ label, onClick, active }) {
      return (
        <div onClick={onClick} style={{
          display: 'flex', alignItems: 'center', gap: 12, padding: '13px 20px 13px 34px',
          cursor: 'pointer', background: active ? '#F3E5F5' : 'transparent',
          borderLeft: active ? '3px solid var(--primary)' : '3px solid transparent'
        }}>
          <svg width="16" height="16" viewBox="0 0 24 24" fill={active ? 'var(--primary)' : '#999'}>
            <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
          </svg>
          <span style={{ fontSize: 14, fontWeight: active ? 700 : 500, color: active ? 'var(--primary)' : '#555' }}>{label}</span>
        </div>
      );
    }

    return (
      <>
        {/* Cabeçalho da conta */}
        <div style={{ padding: '20px 20px 16px', borderBottom: '1px solid var(--border)' }}>
          <div style={{ fontWeight: 800, fontSize: 17 }}>{user?.name}</div>
          <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{user?.email || user?.phone}</div>
        </div>

        {/* Card: Perfil */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
          <CardRow
            label="Perfil"
            expanded={perfilExpanded}
            onClick={() => { setPerfilExpanded(v => !v); setPerfilSection(null); }}
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="var(--primary)"><path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/></svg>}
          >
            <SubCard label="Dados" active={perfilSection === 'dados'} onClick={() => setPerfilSection(s => s === 'dados' ? null : 'dados')} />
            <SubCard label="Endereço" active={perfilSection === 'endereco'} onClick={() => setPerfilSection(s => s === 'endereco' ? null : 'endereco')} />
            <SubCard label="Trocar Senha" active={perfilSection === 'senha'} onClick={() => setPerfilSection(s => s === 'senha' ? null : 'senha')} />
          </CardRow>

          {/* Dados */}
          {perfilExpanded && perfilSection === 'dados' && (
            <DadosSection user={user} apiFetch={apiFetch} />
          )}

          {/* Endereço */}
          {perfilExpanded && perfilSection === 'endereco' && (
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'white' }}>
              <button type="button" className="btn btn-outline btn-sm"
                onClick={useMyLocationConta} disabled={savingAddr}
                style={{ width: '100%', justifyContent: 'flex-start', gap: 8, marginBottom: 10, padding: '10px 14px' }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
                  <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
                </svg>
                {savingAddr ? 'Obtendo localização...' : 'Usar minha localização'}
              </button>

              <div style={{ position: 'relative', marginBottom: 8 }}>
                <input className="input" type="text" value={currentAddr}
                  onChange={e => { setAddrForm(e.target.value); searchAddress(e.target.value); }}
                  onFocus={() => { if (addressSuggestions.length > 0) setShowSuggestions(true); }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Buscar rua, número, bairro…"
                  style={{ paddingRight: 40 }} />
                {currentAddr && (
                  <button type="button" onClick={() => { setAddrForm(''); setAddressSuggestions([]); setShowSuggestions(false); setContaMapLat(null); setContaMapLng(null); }}
                    style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: 18, color: '#999', cursor: 'pointer', padding: '4px', lineHeight: 1 }}>
                    ✕
                  </button>
                )}
                {searchingAddr && (
                  <span style={{ position: 'absolute', right: currentAddr ? 36 : 8, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#BBB' }}>…</span>
                )}
                {showSuggestions && addressSuggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'white', border: '1px solid #DDD', borderRadius: 8, maxHeight: 220, overflow: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
                    {addressSuggestions.map((s, i) => (
                      <div key={i} onMouseDown={() => selectAddress(s)}
                        style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F5F5F5', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                        <span style={{ color: 'var(--primary)', flexShrink: 0, marginTop: 1 }}>📍</span>
                        <span>{s.display_name}</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
              {(contaMapLat || user?.lat) && (contaMapLng || user?.lng) && (
                <div style={{ marginBottom: 12 }}>
                  <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Use o mapa para ajustar o ponto exato</div>
                  <div style={{ height: 200, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                    <MapContainer center={[contaMapLat || user.lat, contaMapLng || user.lng]} zoom={16}
                      style={{ height: '100%', width: '100%' }}
                      key={`conta-map-${contaMapLat || 0}-${contaMapLng || 0}`} scrollWheelZoom={false}>
                      <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <Marker position={[contaMapLat || user.lat, contaMapLng || user.lng]} draggable={true}
                        eventHandlers={{
                          dragend: async (e) => {
                            const { lat, lng } = e.target.getLatLng();
                            setContaMapLat(lat);
                            setContaMapLng(lng);
                            try {
                              const res = await fetch(`/api/orders/reverse-geocode?lat=${lat}&lng=${lng}`);
                              const data = await res.json();
                              if (data.display_name) setAddrForm(data.display_name);
                            } catch {}
                          }
                        }} />
                    </MapContainer>
                  </div>
                </div>
              )}
              {!showCepConta ? (
                <button type="button" onClick={() => setShowCepConta(true)}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 12, fontWeight: 600, cursor: 'pointer', padding: '2px 0', textDecoration: 'underline' }}>
                  Buscar por CEP
                </button>
              ) : (
                <div className="flex-row" style={{ gap: 8, marginBottom: 8 }}>
                  <input className="input" type="text" value={cep}
                    onChange={e => { setCep(e.target.value.replace(/\D/g, '').slice(0, 8)); }}
                    placeholder="CEP (ex: 01001000)" maxLength={8} style={{ width: 140, flexShrink: 0 }} />
                  <button type="button" className="btn btn-sm btn-secondary"
                    onClick={lookupCep} disabled={cepLoading || cep.replace(/\D/g, '').length !== 8}
                    style={{ whiteSpace: 'nowrap' }}>{cepLoading ? '...' : 'Buscar CEP'}</button>
                </div>
              )}
              {addrMsg && <div style={{ fontSize: 13, fontWeight: 600, color: addrMsg.includes('Erro') ? '#C62828' : '#2E7D32', marginTop: 8 }}>{addrMsg}</div>}
              <button className="btn btn-primary" style={{ marginTop: 14, width: '100%' }} onClick={saveAddress} disabled={savingAddr}>
                {savingAddr ? 'Salvando…' : 'Salvar Endereço'}
              </button>
            </div>
          )}

          {/* Trocar Senha */}
          {perfilExpanded && perfilSection === 'senha' && (
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'white' }}>
              <div className="form-group">
                <label className="label">Senha atual</label>
                <input className="input" type="password" value={pwCurrent} onChange={e => setPwCurrent(e.target.value)} placeholder="Senha atual" />
              </div>
              <div className="form-group">
                <label className="label">Nova senha</label>
                <input className="input" type="password" value={pwNew} onChange={e => setPwNew(e.target.value)} placeholder="Nova senha (min 4 caracteres)" />
              </div>
              {pwMsg && <div style={{ fontSize: 13, fontWeight: 600, padding: '10px 14px', borderRadius: 8, marginBottom: 12, background: pwMsg.includes('sucesso') ? '#E8F5E9' : '#FFEBEE', color: pwMsg.includes('sucesso') ? '#2E7D32' : '#C62828' }}>{pwMsg}</div>}
              <button className="btn btn-primary" onClick={async () => {
                setPwSaving(true);
                const res = await apiFetch('/auth/password', { method: 'PATCH', body: JSON.stringify({ current_password: pwCurrent, new_password: pwNew }) });
                setPwMsg(res.ok ? 'Senha alterada com sucesso!' : (res.error || 'Erro ao alterar senha'));
                if (res.ok) { setPwCurrent(''); setPwNew(''); }
                setPwSaving(false);
                setTimeout(() => setPwMsg(''), 4000);
              }} disabled={pwSaving}>{pwSaving ? 'Salvando...' : 'Alterar Senha'}</button>
            </div>
          )}

          {perfilExpanded && (
            <div style={{ padding: '16px 20px', borderTop: '1px solid var(--border)', background: 'white' }}>
              <button className="btn" style={{ width: '100%', background: '#FFEBEE', color: '#C62828', border: 'none', fontWeight: 700, fontSize: 15, padding: '12px', borderRadius: 10, cursor: 'pointer' }} onClick={logout}>
                Sair da Conta
              </button>
            </div>
          )}
        </div>

        {/* Card: Pagamentos */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
          <NavCard label="Pagamentos" onClick={() => navigate('/customer/pagamentos')}
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="var(--primary)"><path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/></svg>} />
        </div>

        {/* Card: Notificações */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
          <NavCard label="Notificações" onClick={() => navigate('/customer/notificacoes')}
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="var(--primary)"><path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/></svg>} />
        </div>

        {/* Card: Favoritos */}
        <div className="card" style={{ padding: 0, overflow: 'hidden', marginBottom: 12 }}>
          <NavCard label="Favoritos" onClick={() => navigate('/customer/favoritos')}
            icon={<svg width="20" height="20" viewBox="0 0 24 24" fill="var(--primary)"><path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/></svg>} />
        </div>
      </>
    );
  }

  function renderMenu() {
    return (
      <>
        {/* Cart bottom sheet v2 */}
        {store && !store.open && (
          <div className="card" style={{ background: '#FFF3E0', border: '1px solid #FF6F00', textAlign: 'center' }}>
            <span className="font-bold" style={{ color: '#FF6F00' }}>Entregas encerradas por hoje.</span>
          </div>
        )}

        {renderCardapio()}

        {Object.keys(cart).length > 0 && showCart && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: 'white', zIndex: 200,
            borderTopLeftRadius: 20, borderTopRightRadius: 20,
            boxShadow: '0 -8px 30px rgba(0,0,0,0.15)',
            maxHeight: '60vh', overflow: 'auto', paddingBottom: 20
          }}>
            <div style={{
              display: 'flex', justifyContent: 'space-between', alignItems: 'center',
              padding: '16px 20px 12px', borderBottom: '1px solid var(--border)'
            }}>
              <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--primary-dark)' }}>🛒 Carrinho</span>
              <button onClick={() => setShowCart(false)}
                style={{ background: 'none', border: 'none', fontSize: 18, color: '#999', cursor: 'pointer' }}>
                ✕
              </button>
            </div>
            <div style={{ padding: '0 20px' }}>
              {Object.entries(cart).map(([id, qty]) => {
                const prod = products.find(pp => pp.id === id);
                if (!prod) return null;
                return (
                  <div key={id} style={{
                    display: 'flex', alignItems: 'center', gap: 12,
                    padding: '14px 0', borderBottom: '1px solid #F5F5F5'
                  }}>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontWeight: 700, fontSize: 14 }}>{prod.name}</div>
                      <div style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600 }}>
                        R$ {prod.price.toFixed(2)} cada
                      </div>
                    </div>
                    <div className="flex-row" style={{ gap: 0, flexShrink: 0 }}>
                      <button onClick={() => removeFromCart(id)}
                        style={{
                          width: 34, height: 34, borderRadius: '50%',
                          border: '1px solid #DDD', background: 'white',
                          fontSize: 18, display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer', color: '#C62828'
                        }}>
                        {cart[id] === 1 ? '🗑' : '-'}
                      </button>
                      <span style={{ fontWeight: 700, minWidth: 28, textAlign: 'center' }}>{qty}</span>
                      <button onClick={() => addToCart(id)}
                        style={{
                          width: 34, height: 34, borderRadius: '50%',
                          border: 'none', background: 'var(--primary)',
                          color: 'white', fontSize: 18,
                          display: 'flex', alignItems: 'center', justifyContent: 'center',
                          cursor: 'pointer'
                        }}>+</button>
                    </div>
                  </div>
                );
              })}
            </div>
            <div style={{ padding: '16px 20px' }}>
              <div className="flex-between" style={{ marginBottom: 14, fontSize: 15 }}>
                <span style={{ fontWeight: 600 }}>Total</span>
                <span style={{ fontWeight: 800, color: 'var(--primary-dark)', fontSize: 20 }}>
                  R$ {Object.entries(cart).reduce((s, [id, qty]) => {
                    const pr = products.find(pp => pp.id === id);
                    return s + (pr?.price || 0) * qty;
                  }, 0).toFixed(2)}
                </span>
              </div>
              <button className="btn btn-primary" style={{ fontSize: 16, padding: '14px' }}
                onClick={() => {
                  const items = Object.entries(cart).map(([id, qty]) => {
                    const pr = products.find(pp => pp.id === id);
                    return { product_id: id, quantity: qty, name: pr?.name, price: pr?.price };
                  });
                  const total = items.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
                  navigate('/customer/order', { state: { items, store, total } });
                }}>
                Finalizar Pedido
              </button>
            </div>
          </div>
        )}
        {Object.keys(cart).length > 0 && !showCart && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            zIndex: 199, padding: '12px 20px', display: 'flex', justifyContent: 'center'
          }}>
            <button className="btn btn-primary" style={{ maxWidth: 400, margin: '0 auto', padding: '14px', fontSize: 16 }}
              onClick={() => {
                const items = Object.entries(cart).map(([id, qty]) => {
                  const pr = products.find(pp => pp.id === id);
                  return { product_id: id, quantity: qty, name: pr?.name, price: pr?.price };
                });
                const total = items.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
                navigate('/customer/order', { state: { items, store, total } });
              }}>
              Finalizar Pedido — R$ {Object.entries(cart).reduce((s, [id, qty]) => {
                const pr = products.find(pp => pp.id === id);
                return s + (pr?.price || 0) * qty;
              }, 0).toFixed(2)}
            </button>
          </div>
        )}
      </>
    );
  }

  function renderCardapio() {
    return products.map(prod => (
      <div key={prod.id} className="card">
        <div className="flex-row" style={{ gap: 12, marginBottom: 8 }}>
          {prod.image ? (
            <img src={prod.image} alt={prod.name}
              style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
              onError={e => { e.target.style.display = 'none'; }} />
          ) : (
            <div style={{
              width: 72, height: 72, borderRadius: 12, flexShrink: 0,
              background: prod.size_ml >= 1000 ? 'linear-gradient(135deg, #4A148C, #7B1FA2)'
                : prod.name.includes('Farinha') ? 'linear-gradient(135deg, #FFF8E1, #FFE082)'
                : 'linear-gradient(135deg, #6A1B9A, #9C27B0)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30
            }}>
              {}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{prod.name}</div>
            <div className="text-sm text-muted" style={{ marginTop: 2 }}>{prod.description}</div>
          </div>
          <span className="badge badge-primary" style={{ flexShrink: 0 }}>{prod.size_ml}ml</span>
        </div>
        <div className="flex-between" style={{ marginTop: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>
            R$ {prod.price.toFixed(2)}
          </span>
          <div className="flex-row">
            {cart[prod.id] ? (
              <>
                <button className="btn btn-sm btn-outline" style={{ width: 36, height: 36, padding: 0 }}
                  onClick={() => removeFromCart(prod.id)}>-</button>
                <span style={{ fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{cart[prod.id]}</span>
                <button className="btn btn-sm btn-primary" style={{ width: 36, height: 36, padding: 0 }}
                  onClick={() => addToCart(prod.id)}>+</button>
                <button className="btn btn-sm btn-secondary" onClick={() => goToOrder(prod.id)}>Pedir</button>
              </>
            ) : (
              <button className="btn btn-sm btn-primary" onClick={() => addToCart(prod.id)}>Adicionar</button>
            )}
          </div>
        </div>
        {prod.size_ml >= 1000 && cart[prod.id] > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 6 }}>Como quer receber?</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Array.from({ length: cart[prod.id] + 1 }, (_, k) => {
                const litrosInteiros = cart[prod.id] - k;
                const meios = k * 2;
                if (litrosInteiros === 0 && meios === 0) return null;
                let label = '';
                if (litrosInteiros > 0 && meios > 0) label = `${litrosInteiros}L + ${meios} de meio`;
                else if (litrosInteiros > 0) label = `${litrosInteiros}L`;
                else label = `${meios} de meio`;
                const isActive = (splitItems[prod.id] || 0) === k;
                return (
                  <button key={k}
                    onClick={() => setSplitItems(s => ({ ...s, [prod.id]: k }))}
                    style={{
                      padding: '6px 12px', borderRadius: 20, border: isActive ? '2px solid #6A1B9A' : '1px solid #DDD',
                      background: isActive ? '#F3E5F5' : 'white', color: isActive ? '#6A1B9A' : '#666',
                      fontSize: 13, fontWeight: isActive ? 700 : 400, cursor: 'pointer'
                    }}>
                    {label}
                  </button>
                );
              })}
            </div>
          </div>
        )}
      </div>
    ));
  }

  function renderPedidos() {
    if (orders.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <rect x="16" y="20" width="32" height="32" rx="4" stroke="var(--border)" strokeWidth="2"/>
              <path d="M24 30h16M24 36h10" stroke="var(--border)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <p>Nenhum pedido ainda</p>
        </div>
      );
    }

    return orders.map(order => (
      <div key={order.id} className="card" onClick={() => {
        joinOrder(order.id);
        if (order.payment_status === 'paid') {
          navigate(`/customer/tracking/${order.id}`);
        } else if (order.payment_status === 'pending') {
          navigate(`/customer/payment/${order.id}`);
        }
      }} style={{ cursor: 'pointer' }}>
        <div className="flex-between" style={{ marginBottom: 8 }}>
          <span style={{ fontWeight: 700 }}>Pedido #{order.id.slice(0, 8)}</span>
          <span className={`badge ${statusColors[order.status] || 'badge-warning'}`}>
            {statusLabels[order.status]}
          </span>
        </div>
        <div className="flex-between text-sm text-muted">
          <span>{order.store_name}</span>
          <span className="font-bold" style={{ color: 'var(--primary)' }}>
            R$ {order.total.toFixed(2)}
          </span>
        </div>
        <div className="flex-between text-xs text-muted" style={{ marginTop: 4 }}>
          <span>{new Date(order.created_at).toLocaleString('pt-BR')}</span>
          <span className={`badge ${order.payment_status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
            {order.payment_status === 'paid' ? 'Pago' : 'Pendente'}
          </span>
        </div>
      </div>
    ));
  }
}
