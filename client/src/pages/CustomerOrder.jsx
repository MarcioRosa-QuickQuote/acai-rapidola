import { useState, useEffect } from 'react';
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
  const total = subtotal + deliveryFee;

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
  const [savedAddresses, setSavedAddresses] = useState(() => {
    try { return JSON.parse(localStorage.getItem('user_addresses') || '[]'); }
    catch { return []; }
  });
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [showNotes, setShowNotes] = useState(false);

  function shortAddress(addr) {
    if (!addr) return '';
    const parts = addr.split(',').map(p => p.trim());
    if (parts.length <= 2) return addr;
    return parts.slice(0, 2).join(', ');
  }

  function formatAddressLines(addr) {
    if (!addr) return { line1: '', line2: '' };
    const parts = addr.split(',').map(p => p.trim());
    return { line1: parts.slice(0, 2).join(', '), line2: parts.slice(2, 4).join(', ') };
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

  useEffect(() => { updateDeliveryFee(lat, lng); }, [lat, lng, store]);

  useEffect(() => {
    if (user?.address && !address) {
      setAddress(user.address);
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

  async function geocodeAddress(addrOverride) {
    const addr = addrOverride || address;
    if (!addr) return;
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
      } else {
        setError('Endereço não encontrado. Tente ser mais específico ou use o CEP.');
        setTimeout(() => setError(''), 4000);
      }
    } catch { setError('Erro ao buscar endereço.'); setTimeout(() => setError(''), 4000); }
    finally { setGeocoding(false); }
  }

  async function searchAddress(q) {
    if (q.length < 4) { setAddressSuggestions([]); setShowSuggestions(false); return; }
    try {
      const res = await fetch(`/api/orders/places-autocomplete?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setAddressSuggestions(data.results || []);
      setShowSuggestions((data.results || []).length > 0);
    } catch { setShowSuggestions(false); }
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
            setEditAddr(false);
          }
        }).catch(() => geocodeAddress(suggestion.display_name));
    } else { geocodeAddress(suggestion.display_name); }
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
          address, lat, lng,
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
        <button onClick={() => navigate(-1)} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 26, color: '#333', padding: 0, lineHeight: 1, width: 36 }}>‹</button>
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

        {/* Seção: endereço */}
        <div style={{ padding: '20px 16px 20px' }}>
          <div style={{ fontWeight: 700, fontSize: 17, marginBottom: 16 }}>Entregar no endereço</div>

          {!editAddr && hasAddress ? (
            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 12 }}>
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#333" strokeWidth="2" style={{ marginTop: 2, flexShrink: 0 }}>
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7z"/><circle cx="12" cy="9" r="2.5"/>
              </svg>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, fontSize: 15, lineHeight: 1.3 }}>{addrLines.line1}</div>
                {addrLines.line2 && <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{addrLines.line2}</div>}
              </div>
              <button onClick={() => setEditAddr(true)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--primary)', fontWeight: 700, fontSize: 14, flexShrink: 0 }}>
                Trocar
              </button>
            </div>
          ) : (
            <div style={{ background: '#F8F4FC', borderRadius: 12, padding: 16 }}>
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

              {/* Endereços salvos */}
              {savedAddresses.length > 0 && (
                <select className="input" style={{ marginBottom: 10, fontSize: 14 }}
                  value=""
                  onChange={e => {
                    const a = savedAddresses.find(s => s.address === e.target.value);
                    if (a) { setAddress(a.address); if (a.lat && a.lng) { setLat(a.lat); setLng(a.lng); updateDeliveryFee(a.lat, a.lng); } setEditAddr(false); }
                  }}>
                  <option value="">Selecionar endereço salvo...</option>
                  {savedAddresses.map(a => <option key={a.id} value={a.address}>{a.label || shortAddress(a.address)}</option>)}
                </select>
              )}

              {/* Campo de texto */}
              <div style={{ position: 'relative', marginBottom: 10 }}>
                <input className="input" type="text" value={address}
                  onChange={e => { setAddress(e.target.value); searchAddress(e.target.value); }}
                  onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                  placeholder="Rua, número, bairro" />
                {showSuggestions && addressSuggestions.length > 0 && (
                  <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10, background: 'white', border: '1px solid #DDD', borderRadius: 8, maxHeight: 180, overflow: 'auto', boxShadow: '0 4px 12px rgba(0,0,0,0.1)' }}>
                    {addressSuggestions.map((s, i) => (
                      <div key={i} onMouseDown={() => selectSuggestion(s)}
                        style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F0F0F0' }}>
                        {s.display_name}
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* CEP */}
              {!showCep ? (
                <button type="button" onClick={() => setShowCep(true)}
                  style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '4px 0', marginBottom: 12 }}>
                  Buscar por CEP
                </button>
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

          <div style={{ border: '2px solid #333', borderRadius: 12, padding: '16px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15 }}>Padrão</div>
              <div style={{ fontSize: 13, color: '#888', marginTop: 3 }}>Hoje, 30 – 45 min</div>
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
              <span style={{ fontWeight: 700, fontSize: 15 }}>R$ {deliveryFee.toFixed(2)}</span>
              <div style={{ width: 24, height: 24, borderRadius: '50%', border: '2px solid var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <div style={{ width: 14, height: 14, borderRadius: '50%', background: 'var(--primary)' }} />
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

      {/* Barra inferior fixa */}
      <div style={{ position: 'fixed', bottom: 0, left: 0, right: 0, background: 'white', borderTop: '1px solid #EFEFEF', padding: '12px 16px', paddingBottom: 'max(12px, env(safe-area-inset-bottom))' }}>
        <button className="btn btn-primary"
          style={{ fontSize: 15, padding: '14px 20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center', opacity: (!hasAddress || loading) ? 0.6 : 1 }}
          disabled={!hasAddress || loading}
          onClick={handleSubmit}>
          <span>{loading ? 'Processando...' : 'Continuar'}</span>
          <span>R$ {total.toFixed(2)} com entrega</span>
        </button>
      </div>
    </div>
  );
}
