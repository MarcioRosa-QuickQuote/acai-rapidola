import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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
  const [view, setView] = useState('menu');
  const [mainTab, setMainTab] = useState('menu');
  const [contaTab, setContaTab] = useState('perfil');
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
    apiFetch(`/products?store_id=${storeId}`).then(d => {
      if (d.data) setProducts(d.data);
      if (!sessionStorage.getItem('cart')) {
        setCart({});
        setSplitItems({});
      }
      setLoading(false);
    });
    apiFetch(`/stores/${storeId}`).then(d => {
      if (d.ok) setStore(d);
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
    const active = orders.find(o => !['delivered','cancelled'].includes(o.status));
    setActiveOrder(active || null);
  }, [orders]);

  function loadOrders() {
    apiFetch('/orders').then(d => {
      if (d.data) {
        setOrders(d.data);
        const active = d.data.find(o => !['delivered','cancelled'].includes(o.status));
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
    <div>
      <div className="header">
        <div className="header-left">
          <button className="btn btn-sm"
            style={{ background: 'var(--border)', color: 'var(--primary-dark)', fontSize: 13, padding: '6px 10px', fontWeight: 700 }}
            onClick={() => navigate('/customer')}>
            &larr; Lojas
          </button>
        </div>
        <div className="header-right" style={{ gap: 6 }}>
          {activeOrder && activeOrder.payment_status === 'paid' && !['delivered','cancelled'].includes(activeOrder.status) && (
            <button className="btn btn-sm"
              onClick={() => navigate(`/customer/tracking/${activeOrder.id}`)}
              title="Acompanhar pedido"
              style={{
                background: 'transparent',
                padding: '2px',
                border: 'none', borderRadius: 20, width: 'auto', display: 'flex', alignItems: 'center'
              }}>
              <img src="/saco_acai.png" style={{ width: 52, height: 52, objectFit: 'contain' }} />
            </button>
          )}
          {Object.keys(cart).length > 0 && (
            <button className="btn btn-sm"
              onClick={() => setShowCart(!showCart)}
              style={{
                background: '#FFF3E0', color: '#E65100',
                fontSize: 14, fontWeight: 700, padding: '4px 8px',
                border: 'none', borderRadius: 20, width: 'auto',
                position: 'relative'
              }}>
              🛒
              <span style={{
                position: 'absolute', top: -4, right: -6,
                background: '#C62828', color: 'white', fontSize: 10,
                width: 18, height: 18, borderRadius: '50%',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontWeight: 700
              }}>
                {Object.values(cart).reduce((a, b) => a + b, 0)}
              </span>
            </button>
          )}
          <div onClick={() => {
            if (storeId) setView(view === 'conta' ? 'menu' : 'conta');
          }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: storeId ? 'pointer' : 'default' }}>
            {user?.photo_url ? (
              <img src={user.photo_url} alt="Foto"
                style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                onError={e => { e.target.style.display = 'none'; }} />
            ) : (
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'linear-gradient(135deg, #CE93D8, #AB47BC)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 700, fontSize: 15, flexShrink: 0, lineHeight: 1
              }}>
                {user?.name?.charAt(0)?.toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{user?.name?.split(' ')[0]}</div>
              <div onClick={(e) => { e.stopPropagation(); logout(); }}
                style={{ fontSize: 10, color: 'var(--text-light)', cursor: 'pointer', lineHeight: 1 }}>
                Sair
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 12 }}>
        {view === 'conta' ? renderConta() : renderMenu()}
      </div>
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
              foundAddr = cleanNominatimAddress(data.display_name);
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
      if (q.length < 3) { setAddressSuggestions([]); setShowSuggestions(false); return; }
      searchDebounceRef.current = setTimeout(async () => {
        try {
          const res = await fetch(`/api/orders/places-autocomplete?q=${encodeURIComponent(q)}`);
          const data = await res.json();
          const results = data.results || [];
          setPlacesSource(data.source || null);
          setAddressSuggestions(results);
          setShowSuggestions(results.length > 0);
        } catch { setShowSuggestions(false); }
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
      setAddrForm(suggestion.display_name);
      setShowSuggestions(false);
      if (suggestion.place_id) {
        try {
          const res = await fetch(`/api/orders/place-details?place_id=${suggestion.place_id}`);
          const data = await res.json();
          if (data.lat && data.lon) {
            setContaMapLat(parseFloat(data.lat));
            setContaMapLng(parseFloat(data.lon));
            if (data.display_name) setAddrForm(data.display_name);
          }
        } catch {}
      } else if (suggestion.lat && suggestion.lon) {
        setContaMapLat(parseFloat(suggestion.lat));
        setContaMapLng(parseFloat(suggestion.lon));
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

    return (
      <>
        <div className="page-title" style={{ fontWeight: 800 }}>Minha Conta</div>
        <div className="card" style={{ textAlign: 'left', padding: 0, overflow: 'hidden' }}>
          <div style={{ display: 'flex', borderBottom: '1px solid var(--border)' }}>
            {[
              { key: 'perfil', label: 'Perfil', icon: '👤' },
              { key: 'pagamentos', label: 'Pagamentos', icon: '💳' },
              { key: 'conversas', label: 'Conversas', icon: '💬' },
              { key: 'notificacoes', label: 'Notificações', icon: '🔔' },
              { key: 'favoritos', label: 'Favoritos', icon: '❤️' },
            ].map(tab => (
              <button key={tab.key}
                onClick={() => setContaTab(tab.key)}
                style={{
                  flex: 1, padding: '10px 4px', border: 'none', background: 'none',
                  fontSize: 11, fontWeight: contaTab === tab.key ? 700 : 500,
                  color: contaTab === tab.key ? 'var(--primary)' : '#999',
                  borderBottom: contaTab === tab.key ? '2px solid var(--primary)' : '2px solid transparent',
                  cursor: 'pointer', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4,
                  transition: 'all 0.2s'
                }}>
                <span style={{ fontSize: 16 }}>{tab.icon}</span>
                {tab.label}
              </button>
            ))}
          </div>

          <div style={{ padding: 20 }}>
            {contaTab === 'perfil' && (
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 20, paddingBottom: 16, borderBottom: '1px solid var(--border)' }}>
                  <label style={{ cursor: 'pointer', position: 'relative' }}>
                    {user?.photo_url ? (
                      <img src={user.photo_url} alt="Foto"
                        style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }}
                        onError={e => { e.target.style.display = 'none'; }} />
                    ) : (
                      <div style={{
                        width: 56, height: 56, borderRadius: '50%',
                        background: 'linear-gradient(135deg, #CE93D8, #AB47BC)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontWeight: 700, fontSize: 24
                      }}>
                        {user?.name?.charAt(0)?.toUpperCase()}
                      </div>
                    )}
                    <input type="file" accept="image/*" ref={photoRef}
                      onChange={e => { if (e.target.files?.[0]) uploadPhoto(e.target.files[0]); }}
                      style={{ display: 'none' }} />
                    <div style={{ fontSize: 9, color: '#888', textAlign: 'center', marginTop: 2 }}>Alterar foto</div>
                  </label>
                  <div>
                    <div style={{ fontWeight: 800, fontSize: 16 }}>{user?.name}</div>
                    <div style={{ fontSize: 12, color: '#888' }}>{user?.phone}</div>
                  </div>
                </div>

                {/* Endereço de entrega — sempre visível */}
                <div style={{ marginBottom: 4 }}>
                  <div style={{ fontWeight: 700, fontSize: 12, color: '#888', marginBottom: 10, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    Endereço de entrega
                  </div>

                  <button type="button" className="btn btn-outline btn-sm"
                    onClick={useMyLocationConta} disabled={savingAddr}
                    style={{ width: '100%', justifyContent: 'flex-start', gap: 8, marginBottom: 10, padding: '10px 14px' }}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
                      <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
                    </svg>
                    {savingAddr ? 'Obtendo localização...' : 'Usar minha localização'}
                  </button>

                  {placesSource && placesSource !== 'google' && (
                    <div style={{
                      background: '#FFF3E0', border: '1px solid #FFB74D',
                      borderRadius: 8, padding: '8px 12px', marginBottom: 8,
                      fontSize: 12, color: '#E65100',
                      display: 'flex', alignItems: 'center', gap: 8
                    }}>
                      <svg width="16" height="16" viewBox="0 0 24 24" fill="#E65100" style={{ flexShrink: 0 }}>
                        <path d="M1 21h22L12 2 1 21zm12-3h-2v-2h2v2zm0-4h-2v-4h2v4z"/>
                      </svg>
                      <span>
                        {placesSource === 'photon_no_key'
                          ? 'Google Places não configurado — usando busca alternativa. Configure GOOGLE_PLACES_KEY no servidor.'
                          : 'Google Places indisponível — usando busca alternativa.'}
                      </span>
                    </div>
                  )}

                  <div style={{ position: 'relative', marginBottom: 8 }}>
                    <input className="input" type="text" value={currentAddr}
                      onChange={e => { setAddrForm(e.target.value); searchAddress(e.target.value); }}
                      onFocus={() => { if (addressSuggestions.length > 0) setShowSuggestions(true); }}
                      onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                      placeholder="Buscar rua, número, bairro…" />
                    {showSuggestions && addressSuggestions.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50,
                        background: 'white', border: '1px solid #DDD', borderRadius: 8,
                        maxHeight: 220, overflow: 'auto',
                        boxShadow: '0 4px 16px rgba(0,0,0,0.15)'
                      }}>
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

                  {/* Mapa para ajuste fino — aparece automaticamente ao selecionar endereço */}
                  {(contaMapLat || user?.lat) && (contaMapLng || user?.lng) && (
                    <div style={{ marginBottom: 12 }}>
                      <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>
                        Use o mapa para ajustar o ponto exato
                      </div>
                      <div style={{ height: 200, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
                        <MapContainer
                          center={[contaMapLat || user.lat, contaMapLng || user.lng]} zoom={16}
                          style={{ height: '100%', width: '100%' }}
                          key={`conta-map-${contaMapLat || 0}-${contaMapLng || 0}`} scrollWheelZoom={false}>
                          <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                          <Marker position={[contaMapLat || user.lat, contaMapLng || user.lng]} />
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
                        placeholder="CEP (ex: 01001000)" maxLength={8}
                        style={{ width: 140, flexShrink: 0 }} />
                      <button type="button" className="btn btn-sm btn-secondary"
                        onClick={lookupCep} disabled={cepLoading || cep.replace(/\D/g, '').length !== 8}
                        style={{ whiteSpace: 'nowrap' }}>
                        {cepLoading ? '...' : 'Buscar CEP'}
                      </button>
                    </div>
                  )}

                  {addrMsg && <div style={{ fontSize: 13, fontWeight: 600, color: addrMsg.includes('Erro') ? '#C62828' : '#2E7D32', marginTop: 8 }}>{addrMsg}</div>}

                  <button className="btn btn-primary" style={{ marginTop: 14, width: '100%' }} onClick={saveAddress} disabled={savingAddr}>
                    {savingAddr ? 'Salvando…' : 'Salvar Endereço'}
                  </button>
                </div>

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
              </div>
            )}

            {contaTab === 'pagamentos' && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>💳</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>Nenhum pagamento</div>
                <div style={{ fontSize: 13, color: '#999' }}>Seus pagamentos aparecerão aqui</div>
              </div>
            )}

            {contaTab === 'conversas' && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>Nenhuma conversa</div>
                <div style={{ fontSize: 13, color: '#999' }}>Converse com as lojas pelo chat</div>
              </div>
            )}

            {contaTab === 'notificacoes' && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>🔔</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>Nenhuma notificação</div>
                <div style={{ fontSize: 13, color: '#999' }}>Atualizações dos seus pedidos</div>
              </div>
            )}

            {contaTab === 'favoritos' && (
              <div style={{ textAlign: 'center', padding: '24px 0' }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>❤️</div>
                <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--text)', marginBottom: 6 }}>Nenhum favorito</div>
                <div style={{ fontSize: 13, color: '#999' }}>Favorite lojas e produtos</div>
              </div>
            )}
          </div>
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

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          {store && (
            <>
              {store.logo ? (
                <img src={store.logo} alt={store.name}
                  style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                  onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: `linear-gradient(135deg, ${store.color_primary || '#6A1B9A'}, ${store.color_secondary || '#4A148C'})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 800, fontSize: 20
                }}>
                  {store.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--primary)' }}>{store.name}</span>
            </>
          )}
          <div className="flex-row">
          </div>
        </div>

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
