import { useState, useEffect, useRef } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function CustomerOrder() {
  const { user, apiFetch } = useAuth();
  const location = useLocation();
  const state = location.state || {};
  const { items, store: storeFromState, product, quantity, splitCount } = state;
  const [store, setStore] = useState(storeFromState);
  const navigate = useNavigate();

  const orderItems = items || (product ? [{ product_id: product.id, name: product.name, price: product.price, quantity: quantity || 1 }] : []);
  const subtotal = orderItems.reduce((s, i) => s + (i.price || 0) * (i.quantity || 1), 0);
  const [deliveryFee, setDeliveryFee] = useState(6.50);
  const [deliveryType, setDeliveryType] = useState('delivery'); // 'delivery' | 'pickup'
  const effectiveFee = deliveryType === 'pickup' ? 0 : deliveryFee;
  const total = subtotal + effectiveFee;

  const [address, setAddress] = useState('');
  const [notes, setNotes] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [lat, setLat] = useState(null);
  const [lng, setLng] = useState(null);
  const [geocoding, setGeocoding] = useState(false);
  const [editAddr, setEditAddr] = useState(false);
  const [splitLiter, setSplitLiter] = useState(false);
  const [cep, setCep] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [distanceWarning, setDistanceWarning] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showCep, setShowCep] = useState(false);
  const [savedAddresses, setSavedAddresses] = useState([]);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [complement, setComplement] = useState('');
  const [showNotes, setShowNotes] = useState(false);
  const [showSavePrompt, setShowSavePrompt] = useState(false);
  const [savingAddr, setSavingAddr] = useState(false);
  const searchDebounceRef = useRef(null);
  const addrInputRef = useRef(null);

  function shortAddress(addr) {
    if (!addr) return '';
    const parts = addr.split(',').map(p => p.trim());
    if (parts.length <= 2) return addr;
    return parts.slice(0, 2).join(', ');
  }

  function formatAddressLines(addr) {
    if (!addr) return { line1: '', line2: '' };
    const parts = addr.split(',').map(p => p.trim());
    let line1 = parts[0];
    let line2 = '';
    if (parts.length > 1) {
      const second = parts[1];
      const dashIdx = second.indexOf(' - ');
      if (dashIdx > 0) {
        line1 = parts[0] + ', ' + second.slice(0, dashIdx).trim();
        line2 = second.slice(dashIdx + 3).trim();
      } else if (/^\d/.test(second)) {
        line1 = parts[0] + ', ' + second;
        line2 = parts[2] || '';
      } else {
        line2 = second;
      }
    }
    return { line1, line2 };
  }

  function cleanNominatimAddress(displayName) {
    if (!displayName) return '';
    const parts = displayName.split(',').map(p => p.trim());
    const skip = ['Região Norte', 'Região Nordeste', 'Região Sudeste', 'Região Sul', 'Região Centro-Oeste', 'Brazil', 'Brasil'];
    return parts.filter(p => !skip.includes(p) && !/^\d{5}-\d{3}$/.test(p)).join(', ');
  }

  function calcDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function checkDistanceWarning(newLat, newLng) {
    if (user?.lat && user?.lng) {
      const d = calcDistance(user.lat, user.lng, newLat, newLng);
      setDistanceWarning(d > 5 ? `Você está a ${d.toFixed(1)}km do seu endereço cadastrado. Confirme se está correto.` : '');
    }
  }

  function updateDeliveryFee(custLat, custLng) {
    if (!store?.id || !custLat || !custLng) { setDeliveryFee(6.50); return; }
    apiFetch('/orders/estimate-fee', {
      method: 'POST',
      body: JSON.stringify({ store_id: store.id, lat: custLat, lng: custLng })
    }).then(d => { if (d.fee) setDeliveryFee(d.fee); }).catch(() => setDeliveryFee(6.50));
  }

  useEffect(() => {
    if (!store) {
      apiFetch('/stores').then(d => { if (d.data?.[0]) setStore(d.data[0]); });
    }
  }, []);

  useEffect(() => {
    if (!user) return;
    apiFetch('/addresses').then(d => { if (d.data) setSavedAddresses(d.data); }).catch(() => {});
  }, [user?.id]);

  useEffect(() => { updateDeliveryFee(lat, lng); }, [lat, lng, store]);

  useEffect(() => {
    if (user?.address && !address && user.address !== 'RETIRADA NA LOJA') {
      const dashIdx = user.address.indexOf(' — ');
      if (dashIdx > 0) {
        setAddress(user.address.slice(0, dashIdx));
        setComplement(user.address.slice(dashIdx + 3));
      } else {
        setAddress(user.address);
      }
      if (user.lat && user.lng) {
        setLat(user.lat); setLng(user.lng);
        updateDeliveryFee(user.lat, user.lng);
      }
    }
  }, [user]);

  useEffect(() => {
    if (orderItems.some(i => (i.size_ml || product?.size_ml) >= 1000)) {
      setSplitLiter(splitCount > 0);
    }
  }, []);

  async function saveAddressAs(label) {
    setShowSavePrompt(false);
    setSavingAddr(true);
    try {
      const existing = savedAddresses.find(a => a.label === label);
      if (existing) {
        await apiFetch(`/addresses/${existing.id}`, { method: 'PATCH', body: JSON.stringify({ label, address, complement: complement || null, lat, lng }) });
        setSavedAddresses(prev => prev.map(a => a.id === existing.id ? { ...a, address, complement, lat, lng } : a));
      } else {
        const d = await apiFetch('/addresses', { method: 'POST', body: JSON.stringify({ label, address, complement: complement || null, lat, lng }) });
        if (d.data) setSavedAddresses(prev => [...prev, d.data]);
      }
    } catch {} finally { setSavingAddr(false); }
  }

  async function geocodeAddress(addrOverride) {
    const addr = addrOverride || address;
    if (!addr) return;

    // Se já temos lat/lng (de sugestão autocomplete ou GPS), só confirma
    if (lat && lng && !addrOverride) {
      setEditAddr(false);
      setShowSavePrompt(true);
      return;
    }

    setGeocoding(true); setError('');
    try {
      const res = await fetch('/api/orders/geocode?q=' + encodeURIComponent(addr));
      const data = await res.json();
      if (data.length > 0) {
        const newLat = parseFloat(data[0].lat);
        const newLng = parseFloat(data[0].lon);
        setLat(newLat); setLng(newLng);
        updateDeliveryFee(newLat, newLng);
        checkDistanceWarning(newLat, newLng);
        setEditAddr(false);
        setShowSavePrompt(true);
      } else {
        setError('Endereço não encontrado. Tente ser mais específico ou use o CEP.');
        setTimeout(() => setError(''), 4000);
      }
    } catch { setError('Erro ao buscar endereço.'); setTimeout(() => setError(''), 4000); }
    finally { setGeocoding(false); }
  }

  function searchAddress(q) {
    if (searchDebounceRef.current) clearTimeout(searchDebounceRef.current);
    if (q.length < 3) { setAddressSuggestions([]); setShowSuggestions(false); return; }
    searchDebounceRef.current = setTimeout(async () => {
      try {
        const curLat = lat || user?.lat || '';
        const curLng = lng || user?.lng || '';
        const params = new URLSearchParams({ q });
        if (curLat) params.set('lat', curLat);
        if (curLng) params.set('lng', curLng);
        const res = await fetch(`/api/orders/places-autocomplete?${params}`);
        const data = await res.json();
        let results = data.results || [];
        if (results.length === 0 && q.length >= 5) {
          const numInQuery = q.match(/(\d[\d\s\-]*)$/);
          const streetQ = numInQuery ? q.replace(numInQuery[0], '').trim() : q;
          const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(streetQ + ', Belém, Pará')}&countrycodes=br&limit=5&addressdetails=1`;
          const nomRes = await fetch(nomUrl, { headers: { 'User-Agent': 'PedeAcai/1.0' } });
          const nomData = await nomRes.json();
          results = (nomData || []).map(r => {
            const parts = r.display_name.split(',').map(p => p.trim());
            const short = parts.slice(0, 3).join(', ');
            return { display_name: numInQuery ? short.replace(/(,\s*\d+)?(\s*-)/, `, ${numInQuery[1].trim()} -`) : short, lat: r.lat, lon: r.lon };
          });
        }
        setAddressSuggestions(results);
        setShowSuggestions(results.length > 0);
      } catch { setShowSuggestions(false); }
    }, 350);
  }

  function selectSuggestion(suggestion) {
    setAddress(suggestion.display_name);
    setAddressSuggestions([]); setShowSuggestions(false);
    if (suggestion.place_id) {
      fetch('/api/orders/place-details?place_id=' + encodeURIComponent(suggestion.place_id))
        .then(r => r.json()).then(data => {
          if (data.lat) {
            setLat(parseFloat(data.lat)); setLng(parseFloat(data.lng));
            updateDeliveryFee(parseFloat(data.lat), parseFloat(data.lng));
            checkDistanceWarning(parseFloat(data.lat), parseFloat(data.lng));
          }
        }).catch(() => {});
    }
  }

  async function lookupCep() {
    const cleaned = cep.replace(/\D/g, '');
    if (cleaned.length !== 8) return;
    setCepLoading(true); setError('');
    try {
      const res = await fetch(`/api/orders/cep/${cleaned}`);
      const data = await res.json();
      if (data.error) { setError(data.error); setTimeout(() => setError(''), 4000); return; }
      setAddress(data.display_name);
      await geocodeAddress(data.display_name);
    } catch { setError('Erro ao consultar CEP.'); setTimeout(() => setError(''), 4000); }
    finally { setCepLoading(false); }
  }

  function useMyLocation() {
    if (!navigator.geolocation) { setError('Geolocalização não disponível.'); return; }
    setGpsLoading(true); setError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLat(latitude); setLng(longitude);
        try {
          const res = await fetch(`/api/orders/reverse-geocode?lat=${latitude}&lng=${longitude}`);
          const data = await res.json();
          setAddress(data.display_name ? cleanNominatimAddress(data.display_name) : `${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        } catch { setAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`); }
        updateDeliveryFee(latitude, longitude);
        setGpsLoading(false);
        setEditAddr(false);
        setShowSavePrompt(true);
      },
      (err) => {
        setGpsLoading(false);
        setError(err.code === 1 ? 'Permissão negada. Digite o endereço manualmente.' : 'Não foi possível obter sua localização.');
        setTimeout(() => setError(''), 5000);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 }
    );
  }

  async function handleSubmit() {
    if (!address) { setError('Informe o endereço de entrega'); return; }
    if (!store?.id) { setError('Loja não encontrada. Volte ao cardápio.'); return; }
    setLoading(true); setError('');
    try {
      const data = await apiFetch('/orders', {
        method: 'POST',
        body: JSON.stringify({
          store_id: store.id,
          items: orderItems.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
          address: deliveryType === 'pickup' ? 'RETIRADA NA LOJA' : (complement ? `${address} — ${complement}` : address),
          lat: deliveryType === 'pickup' ? null : lat,
          lng: deliveryType === 'pickup' ? null : lng,
          pickup: deliveryType === 'pickup',
          notes: splitLiter ? `Modo: ${(orderItems[0]?.quantity || 1)}L dividido. ` + (notes || '') : notes
        })
      });
      if (data.order?.id) {
        navigate(`/customer/payment/${data.order.id}`);
      } else {
        setError(data.error || data.message || 'Erro ao criar pedido');
      }
    } catch (err) { setError(err.message); }
    finally { setLoading(false); }
  }

  const addrLines = formatAddressLines(address);
  const hasAddress = !!address;
  const hasSplitOption = orderItems.some(i => (i.size_ml || product?.size_ml) >= 1000);

  return (
    <div style={{ minHeight: '100vh', background: 'white', display: 'flex', flexDirection: 'column' }}>

      {/* Header */}
      <div style={{ display: 'flex', alignItems: 'center', padding: '14px 16px', borderBottom: '1px solid #EFEFEF', flexShrink: 0 }}>
        <button onClick={() => navigate(`/customer/${store?.id}`, { state: { openCart: true } })} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 26, color: '#333', padding: 0, lineHeight: 1, width: 36 }}>‹</button>
        <span style={{ flex: 1, textAlign: 'center', fontWeight: 800, fontSize: 15, letterSpacing: 1 }}>SACOLA</span>
        <div style={{ width: 36 }} />
      </div>

      {/* Conteúdo rolável */}
      <div style={{ flex: 1, overflowY: 'auto', paddingBottom: 100 }}>

        {error && (
          <div style={{ background: '#FFEBEE', color: '#C62828', padding: '12px 16px', fontSize: 14, fontWeight: 600 }}>
            {error}
          </div>
        )}

        {distanceWarning && (
          <div style={{ background: '#FFF3E0', color: '#E65100', padding: '12px 16px', fontSize: 13, fontWeight: 600 }}>
            {distanceWarning}
          </div>
        )}

        {/* Seção: endereço de entrega ou loja (retirada) */}
        {deliveryType === 'pickup' && store?.address && (
          <div style={{ padding: '20px 16px 20px' }}>
            <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 16 }}>Retirar na loja</div>
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <span style={{ fontSize: 22, flexShrink: 0 }}>🏪</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{store.name}</div>
                <div style={{ fontSize: 13, color: '#888', marginTop: 3 }}>{store.address}</div>
              </div>
            </div>
          </div>
        )}
        <div style={{ padding: '20px 16px 20px', display: deliveryType === 'pickup' ? 'none' : 'block' }}>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 16 }}>Entregar no endereço</div>

          {!editAddr && hasAddress ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              {(() => {
                const active = savedAddresses.find(a => a.address === address);
                return active
                  ? <span style={{ fontSize: 22, flexShrink: 0, marginTop: 0 }}>{active.label === 'Casa' ? '🏠' : '💼'}</span>
                  : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" style={{ marginTop: 2, flexShrink: 0 }}><path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/></svg>;
              })()}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{addrLines.line1}</div>
                {(addrLines.line2 || complement) && (
                  <div style={{ fontSize: 13, color: '#888', marginTop: 3, fontWeight: 400 }}>
                    {addrLines.line2}{addrLines.line2 && complement ? ' — ' : ''}{complement}
                  </div>
                )}
              </div>
              <button onClick={() => setEditAddr(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                Trocar
              </button>
            </div>
          ) : (
            <div style={{ background: '#F8F4FC', borderRadius: 12, padding: 16 }}>
              {/* Chips Casa/Trabalho no topo do form */}
              {savedAddresses.length > 0 && (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12 }}>
                  {savedAddresses.map(a => (
                    <button key={a.id} type="button"
                      onClick={() => { setAddress(a.address); setComplement(a.complement || ''); if (a.lat && a.lng) { setLat(a.lat); setLng(a.lng); updateDeliveryFee(a.lat, a.lng); } setEditAddr(false); }}
                      style={{ display: 'flex', alignItems: 'center', gap: 5, padding: '6px 12px', borderRadius: 20, border: '1px solid #DDD', background: 'white', cursor: 'pointer', fontSize: 13, fontWeight: 600, color: '#333' }}>
                      <span>{a.label === 'Casa' ? '🏠' : '💼'}</span>
                      <span>{a.label}</span>
                    </button>
                  ))}
                </div>
              )}
              {/* GPS */}
              <button type="button" onClick={useMyLocation} disabled={gpsLoading}
                style={{ display: 'flex', alignItems: 'center', gap: 8, width: '100%', background: 'white', border: '1px solid #DDD', borderRadius: 8, padding: '10px 14px', cursor: 'pointer', marginBottom: 12, fontSize: 14, color: '#333', fontWeight: 600 }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                  <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
                  <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
                  <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
                </svg>
                {gpsLoading ? 'Obtendo localização...' : 'Usar minha localização atual'}
              </button>

              {/* Campo de texto */}
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <input ref={addrInputRef} className="input" type="text" value={address}
                  onChange={e => { setAddress(e.target.value); searchAddress(e.target.value); }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 150)}
                  onFocus={() => { if (addressSuggestions.length > 0) setShowSuggestions(true); }}
                  placeholder="Rua, número, bairro" />
                {showSuggestions && addressSuggestions.length > 0 && (() => {
                  const rect = addrInputRef.current?.getBoundingClientRect();
                  return (
                    <div style={{ position: 'fixed', top: rect ? rect.bottom + 2 : 0, left: rect ? rect.left : 0, width: rect ? rect.width : '100%', zIndex: 1000, background: 'white', border: '1px solid #DDD', borderRadius: 8, maxHeight: 220, overflow: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
                      {addressSuggestions.map((s, i) => (
                        <div key={i} onMouseDown={e => { e.preventDefault(); selectSuggestion(s); }}
                          style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F0F0F0', display: 'flex', alignItems: 'flex-start', gap: 8 }}>
                          <span style={{ color: 'var(--primary)', flexShrink: 0 }}>📍</span>
                          <span>{s.display_name}</span>
                        </div>
                      ))}
                    </div>
                  );
                })()}
              </div>

              {/* Complemento */}
              <input className="input" type="text" value={complement}
                onChange={e => setComplement(e.target.value)}
                placeholder="Complemento (apto, bloco, referência...)"
                style={{ marginBottom: 10 }} />

              {/* CEP */}
              {!showCep ? (
                <div style={{ marginBottom: 12 }}>
                  <button type="button" onClick={() => setShowCep(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0' }}>
                    Buscar por CEP
                  </button>
                </div>
              ) : (
                <div style={{ display: 'flex', gap: 8, marginBottom: 12, alignItems: 'center' }}>
                  <input className="input" type="text" value={cep}
                    onChange={e => setCep(e.target.value.replace(/\D/g, '').slice(0, 8))}
                    placeholder="CEP (ex: 66000000)" style={{ width: 140, flexShrink: 0 }} />
                  <button type="button" onClick={lookupCep} disabled={cepLoading || cep.replace(/\D/g, '').length !== 8}
                    style={{ background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 8, padding: '10px 14px', fontWeight: 700, cursor: 'pointer', fontSize: 13, whiteSpace: 'nowrap' }}>
                    {cepLoading ? '...' : 'Buscar'}
                  </button>
                  <button type="button" onClick={() => setShowCep(false)}
                    style={{ background: 'none', border: 'none', color: '#999', fontSize: 20, cursor: 'pointer' }}>×</button>
                </div>
              )}

              <div style={{ display: 'flex', gap: 8 }}>
                <button type="button" onClick={() => geocodeAddress()} disabled={geocoding || !address}
                  style={{ flex: 1, background: 'var(--primary)', color: 'white', border: 'none', borderRadius: 8, padding: '12px', fontWeight: 700, cursor: 'pointer', fontSize: 14 }}>
                  {geocoding ? 'Buscando...' : 'Confirmar endereço'}
                </button>
                {hasAddress && (
                  <button type="button" onClick={() => { setEditAddr(false); setShowCep(false); }}
                    style={{ background: 'white', border: '1px solid #DDD', borderRadius: 8, padding: '12px 14px', cursor: 'pointer', fontSize: 14 }}>
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          )}
        </div>

        <div style={{ height: 8, background: '#F5F5F5' }} />

        {/* Opções de entrega */}
        <div style={{ padding: '20px 16px' }}>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 16 }}>Opções de entrega</div>

          {/* Entrega padrão */}
          <div onClick={() => setDeliveryType('delivery')}
            style={{ border: deliveryType === 'delivery' ? '2px solid #333' : '1px solid #E0E0E0', borderRadius: 12, padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer', marginBottom: 10 }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Padrão</div>
              <div style={{ fontSize: 13, color: '#888', marginTop: 3 }}>Hoje, 30 – 45 min</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>R$ {deliveryFee.toFixed(2)}</span>
              <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${deliveryType === 'delivery' ? 'var(--primary)' : '#CCC'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {deliveryType === 'delivery' && <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--primary)' }} />}
              </div>
            </div>
          </div>

          {/* Retirada na loja */}
          <div onClick={() => setDeliveryType('pickup')}
            style={{ border: deliveryType === 'pickup' ? '2px solid #333' : '1px solid #E0E0E0', borderRadius: 12, padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', cursor: 'pointer' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Retirar na loja</div>
              <div style={{ fontSize: 13, color: '#888', marginTop: 3 }}>Hoje, 15 – 25 min</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#2E7D32' }}>Grátis</span>
              <div style={{ width: 24, height: 24, borderRadius: '50%', border: `2px solid ${deliveryType === 'pickup' ? 'var(--primary)' : '#CCC'}`, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                {deliveryType === 'pickup' && <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--primary)' }} />}
              </div>
            </div>
          </div>
        </div>

        {/* Split litro (apenas para produtos >= 1L) */}
        {hasSplitOption && (
          <>
            <div style={{ height: 8, background: '#F5F5F5' }} />
            <div style={{ padding: '20px 16px' }}>
              <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 12 }}>Como quer receber?</div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {Array.from({ length: (orderItems[0]?.quantity || 1) + 1 }, (_, k) => {
                  const litrosInteiros = (orderItems[0]?.quantity || 1) - k;
                  const meios = k * 2;
                  if (litrosInteiros === 0 && meios === 0) return null;
                  let label = '';
                  if (litrosInteiros > 0 && meios > 0) label = `${litrosInteiros}L + ${meios} de meio`;
                  else if (litrosInteiros > 0) label = `${litrosInteiros}L`;
                  else label = `${meios} de meio`;
                  const isActive = (k > 0) === splitLiter;
                  return (
                    <button key={k} onClick={() => setSplitLiter(k > 0)}
                      style={{ padding: '8px 14px', borderRadius: 20, border: isActive ? '2px solid var(--primary)' : '1px solid #DDD', background: isActive ? '#F3E5F5' : 'white', color: isActive ? 'var(--primary)' : '#666', fontSize: 13, fontWeight: isActive ? 700 : 400, cursor: 'pointer' }}>
                      {label}
                    </button>
                  );
                })}
              </div>
            </div>
          </>
        )}

        <div style={{ height: 8, background: '#F5F5F5' }} />

        {/* Observações */}
        <div style={{ padding: '16px' }}>
          <button type="button" onClick={() => setShowNotes(v => !v)}
            style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', width: '100%', background: 'none', border: 'none', cursor: 'pointer', padding: '4px 0' }}>
            <span style={{ fontWeight: 700, fontSize: 15 }}>Observações</span>
            <span style={{ color: '#888', fontSize: 18 }}>{showNotes ? '−' : '+'}</span>
          </button>
          {showNotes && (
            <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)}
              placeholder="Ex: Sem granola, troco para R$ 50..."
              style={{ resize: 'none', minHeight: 72, fontSize: 14, marginTop: 12 }} />
          )}
        </div>

      </div>

      {/* Modal: Salvar endereço como */}
      {showSavePrompt && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 900, display: 'flex', alignItems: 'flex-end' }} onClick={() => setShowSavePrompt(false)}>
          <div style={{ background: 'white', borderRadius: '16px 16px 0 0', padding: '20px 16px 32px', width: '100%' }} onClick={e => e.stopPropagation()}>
            <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>Salvar endereço?</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>{shortAddress(address)}</div>
            {['Casa', 'Trabalho'].map(label => (
              <button key={label} onClick={() => saveAddressAs(label)} disabled={savingAddr}
                style={{ display: 'flex', alignItems: 'center', gap: 14, width: '100%', padding: '14px 4px', background: 'none', border: 'none', borderBottom: '1px solid #F0F0F0', cursor: 'pointer', fontSize: 15, color: '#222' }}>
                <span style={{ fontSize: 20 }}>{label === 'Casa' ? '🏠' : '💼'}</span>
                <span style={{ fontWeight: 600 }}>{label}</span>
                {savedAddresses.some(a => a.label === label) && <span style={{ marginLeft: 'auto', fontSize: 12, color: '#888' }}>Atualizar</span>}
              </button>
            ))}
            <button onClick={() => setShowSavePrompt(false)}
              style={{ display: 'block', width: '100%', padding: '16px 4px 0', background: 'none', border: 'none', cursor: 'pointer', fontSize: 15, color: '#888', textAlign: 'left' }}>
              Não salvar
            </button>
          </div>
        </div>
      )}

      {/* Barra inferior fixa */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #EFEFEF', padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <button className="btn btn-primary"
          style={{ fontSize: 15, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: ((!hasAddress && deliveryType === 'delivery') || loading) ? 0.6 : 1 }}
          disabled={(!hasAddress && deliveryType === 'delivery') || loading}
          onClick={handleSubmit}>
          <div style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>R$ {total.toFixed(2)}</div>
            <div style={{ fontSize: 12, opacity: 0.85 }}>{deliveryType === 'pickup' ? 'retirada grátis' : 'com entrega'}</div>
          </div>
          <span>{loading ? 'Processando...' : 'Continuar'}</span>
        </button>
      </div>
    </div>
  );
}
