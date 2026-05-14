import { useState, useEffect } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

function MapClickHandler({ onClick }) {
  useMapEvents({
    click(e) {
      onClick(e.latlng.lat, e.latlng.lng);
    }
  });
  return null;
}

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
  const [mapCenter, setMapCenter] = useState([-23.5505, -46.6333]);
  const [geocoding, setGeocoding] = useState(false);
  const [showMap, setShowMap] = useState(false);
  const [addrSaved, setAddrSaved] = useState(false);
  const [editAddr, setEditAddr] = useState(false);
  const [splitLiter, setSplitLiter] = useState(false);
  const [cep, setCep] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [distanceWarning, setDistanceWarning] = useState('');
  const [gpsLoading, setGpsLoading] = useState(false);
  const [showCep, setShowCep] = useState(false);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);

  function shortAddress(addr) {
    if (!addr) return '';
    const parts = addr.split(',').map(p => p.trim());
    if (parts.length <= 2) return addr;
    return parts.slice(0, 2).join(', ');
  }

  function cleanNominatimAddress(displayName) {
    if (!displayName) return '';
    const parts = displayName.split(',').map(p => p.trim());
    const skip = ['Região Norte', 'Região Nordeste', 'Região Sudeste', 'Região Sul', 'Região Centro-Oeste', 'Brazil', 'Brasil'];
    const filtered = parts.filter((p) => {
      if (skip.includes(p)) return false;
      if (/^\d{5}-\d{3}$/.test(p)) return false;
      return true;
    });
    return filtered.join(', ');
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

  useEffect(() => {
    if (orderItems.some(i => (i.size_ml || product?.size_ml) >= 1000)) {
      setSplitLiter(splitCount > 0);
    }
  }, []);

  function updateDeliveryFee(custLat, custLng) {
    if (!store?.id || !custLat || !custLng) { setDeliveryFee(6.50); return; }
    apiFetch('/orders/estimate-fee', {
      method: 'POST',
      body: JSON.stringify({ store_id: store.id, lat: custLat, lng: custLng })
    }).then(d => {
      if (d.fee) setDeliveryFee(d.fee);
    }).catch(() => setDeliveryFee(6.50));
  }

  useEffect(() => {
    if (!store) {
      apiFetch('/stores').then(d => {
        if (d.data?.[0]) setStore(d.data[0]);
      });
    }
  }, []);

  useEffect(() => {
    updateDeliveryFee(lat, lng);
  }, [lat, lng, store]);

  useEffect(() => {
    if (user?.address && !address) {
      setAddress(user.address);
      if (user.lat && user.lng) {
        setLat(user.lat);
        setLng(user.lng);
        setMapCenter([user.lat, user.lng]);
        setShowMap(true);
        updateDeliveryFee(user.lat, user.lng);
      }
      setAddrSaved(true);
    }
  }, [user]);

  async function geocodeAddress() {
    if (!address) return;
    setGeocoding(true);
    setError('');
    try {
      const res = await fetch(`/api/orders/geocode?q=${encodeURIComponent(address)}`);
      const data = await res.json();
      if (data.length > 0) {
        const newLat = parseFloat(data[0].lat);
        const newLng = parseFloat(data[0].lon);
        setLat(newLat);
        setLng(newLng);
        setMapCenter([newLat, newLng]);
        setShowMap(true);
        updateDeliveryFee(newLat, newLng);
        checkDistanceWarning(newLat, newLng);
      } else {
        setError('Endereço não encontrado. Tente um endereço mais específico ou o CEP.');
        setTimeout(() => setError(''), 4000);
      }
    } catch {
      setError('Erro ao buscar endereço.');
      setTimeout(() => setError(''), 4000);
    } finally {
      setGeocoding(false);
    }
  }

  async function searchAddress(q) {
    if (q.length < 4) { setAddressSuggestions([]); setShowSuggestions(false); return; }
    try {
      const res = await fetch(`/api/orders/geocode?q=${encodeURIComponent(q)}`);
      const data = await res.json();
      setAddressSuggestions(data || []);
      setShowSuggestions((data || []).length > 0);
    } catch { setShowSuggestions(false); }
  }

  function selectSuggestion(suggestion) {
    setAddress(suggestion.display_name);
    setAddressSuggestions([]);
    setShowSuggestions(false);
  }

  async function lookupCep() {
    const cleaned = cep.replace(/\D/g, '');
    if (cleaned.length !== 8) return;
    setCepLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/orders/cep/${cleaned}`);
      const data = await res.json();
      if (data.error) {
        setError(data.error);
        setTimeout(() => setError(''), 4000);
        return;
      }
      const fullAddr = data.display_name;
      setAddress(fullAddr);
      const geoRes = await fetch(`/api/orders/geocode?q=${encodeURIComponent(fullAddr)}`);
      const geoData = await geoRes.json();
      if (geoData.length > 0) {
        const newLat = parseFloat(geoData[0].lat);
        const newLng = parseFloat(geoData[0].lon);
        setLat(newLat);
        setLng(newLng);
        setMapCenter([newLat, newLng]);
        setShowMap(true);
        updateDeliveryFee(newLat, newLng);
        checkDistanceWarning(newLat, newLng);
      }
      setEditAddr(true);
    } catch {
      setError('Erro ao consultar CEP.');
      setTimeout(() => setError(''), 4000);
    } finally {
      setCepLoading(false);
    }
  }

  function checkDistanceWarning(newLat, newLng) {
    if (user?.lat && user?.lng) {
      const d = calcDistance(user.lat, user.lng, newLat, newLng);
      if (d > 5) {
        setDistanceWarning(`Você está a ${d.toFixed(1)}km do seu endereço cadastrado. Confirme se o endereço está correto.`);
      } else {
        setDistanceWarning('');
      }
    }
  }

  function calcDistance(lat1, lng1, lat2, lng2) {
    const R = 6371;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLng = (lng2 - lng1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  }

  function useMyLocation() {
    if (!navigator.geolocation) {
      setError('Geolocalização não disponível no seu navegador.');
      setTimeout(() => setError(''), 4000);
      return;
    }
    setGpsLoading(true);
    setError('');
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setLat(latitude);
        setLng(longitude);
        setMapCenter([latitude, longitude]);
        setShowMap(true);
        setEditAddr(true);
        try {
          const res = await fetch(`/api/orders/reverse-geocode?lat=${latitude}&lng=${longitude}`);
          const data = await res.json();
          if (data.display_name) {
            setAddress(cleanNominatimAddress(data.display_name));
          } else {
            setAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
          }
        } catch {
          setAddress(`${latitude.toFixed(5)}, ${longitude.toFixed(5)}`);
        }
        updateDeliveryFee(latitude, longitude);
        setGpsLoading(false);
      },
      (err) => {
        setGpsLoading(false);
        if (err.code === 1) {
          setError('Permissão de localização negada. Digite o endereço manualmente.');
        } else {
          setError('Não foi possível obter sua localização. Digite o endereço.');
        }
        setTimeout(() => setError(''), 5000);
      },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 }
    );
  }

  function handleMapClick(clickLat, clickLng) {
    setLat(clickLat);
    setLng(clickLng);
    updateDeliveryFee(clickLat, clickLng);
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!address) { setError('Informe o endereço de entrega'); return; }
    if (!store?.id) { setError('Loja não encontrada. Volte ao cardápio e tente novamente.'); return; }
    setLoading(true);
    setError('');

    try {
      const data = await apiFetch('/orders', {
        method: 'POST',
        body: JSON.stringify({
          store_id: store.id,
          items: orderItems.map(i => ({ product_id: i.product_id, quantity: i.quantity })),
          address,
          lat: lat,
          lng: lng,
          notes: splitLiter ? `Modo: ${(orderItems[0]?.quantity || 1)}L dividido. ` + (notes || '') : notes
        })
      });
      console.log('[Order response]', data);
      if (data.order?.id) {
        const mpData = await apiFetch('/create-preference', {
          method: 'POST',
          body: JSON.stringify({ order_id: data.order.id })
        });
        if (mpData.init_point) {
          window.location.href = mpData.init_point;
        } else {
          navigate(`/customer/payment/${data.order.id}`);
        }
      } else {
        const msg = data.error || data.message || JSON.stringify(data);
        setError(msg || 'Erro ao criar pedido');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div>
      <div className="header">
        <div className="header-left">
          <button className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 14 }}
            onClick={() => navigate(-1)}>
            Voltar
          </button>
        </div>
        <div className="header-title">Finalizar Pedido</div>
        <div className="header-right" />
      </div>

      <div className="container">
        <div className="card">
          <h3 style={{ marginBottom: 12, color: 'var(--primary)' }}>Resumo do Pedido</h3>
          {orderItems.map((item, i) => (
            <div key={i} className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid var(--border)' }}>
              <div>
                <span style={{ fontWeight: 600 }}>{item.quantity}x </span>
                {item.name}
              </div>
              <span className="font-bold">R$ {((item.price || 0) * (item.quantity || 1)).toFixed(2)}</span>
            </div>
          ))}
          <div className="flex-between" style={{ padding: '8px 0', fontSize: 14, color: '#666' }}>
            <span>Taxa de entrega</span>
            <span>R$ {deliveryFee.toFixed(2)}</span>
          </div>
          <div className="flex-between font-bold" style={{ marginTop: 12, fontSize: 18, color: 'var(--primary)' }}>
            <span>Total</span>
            <span>R$ {total.toFixed(2)}</span>
          </div>

          {orderItems.some(i => i.size_ml >= 1000 || i.product?.size_ml >= 1000) && (
            <div style={{ marginTop: 12 }}>
              <div style={{ fontSize: 13, fontWeight: 600, color: '#888', marginBottom: 8 }}>Como quer receber?</div>
              <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                {Array.from({ length: (orderItems[0]?.quantity || 1) + 1 }, (_, k) => {
                  const litrosInteiros = (orderItems[0]?.quantity || 1) - k;
                  const meios = k * 2;
                  if (litrosInteiros === 0 && meios === 0) return null;
                  let label = '';
                  if (litrosInteiros > 0 && meios > 0) label = `${litrosInteiros}L + ${meios} de meio`;
                  else if (litrosInteiros > 0) label = `${litrosInteiros}L`;
                  else label = `${meios} de meio`;
                  const isActive = k > 0;
                  return (
                    <button key={k}
                      onClick={() => setSplitLiter(k > 0)}
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

        <div className="card">
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{ background: '#FFEBEE', color: '#C62828', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
                {error}
              </div>
            )}

            <div className="form-group">
              <label className="label">Endereço de entrega</label>
              {user?.address && !editAddr ? (
                <div>
                  <div style={{ fontSize: 15, fontWeight: 600, color: '#333', marginBottom: 6 }}>{shortAddress(user.address)}</div>
                  <button type="button" className="btn btn-sm btn-outline"
                    onClick={() => { setEditAddr(true); setAddress(user.address); }}>
                    Alterar endereço
                  </button>
                  <input type="hidden" value={user.address} />
                </div>
              ) : (
                <>
                  {!lat && (
                    <button type="button" className="btn btn-outline"
                      onClick={useMyLocation} disabled={gpsLoading}
                      style={{ marginBottom: 12, width: '100%', justifyContent: 'flex-start', gap: 10, padding: '12px 16px' }}>
                      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                        <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
                        <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
                        <line x1="2" y1="12" x2="6" y2="12"/><line x1="18" y1="12" x2="22" y2="12"/>
                      </svg>
                      {gpsLoading ? 'Obtendo sua localização...' : 'Usar minha localização atual'}
                    </button>
                  )}
                  <div style={{ position: 'relative' }}>
                    <div className="flex-row" style={{ gap: 8 }}>
                      <input className="input" type="text" value={address}
                        onChange={e => { setAddress(e.target.value); searchAddress(e.target.value); }}
                        onFocus={() => { if (addressSuggestions.length > 0) setShowSuggestions(true); }}
                        onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
                        placeholder="Rua, número, bairro - Cidade" required
                        style={{ flex: 1 }} />
                      <button type="button" className="btn btn-sm btn-secondary"
                        onClick={geocodeAddress} disabled={geocoding || !address}
                        style={{ width: 'auto', whiteSpace: 'nowrap' }}>
                        {geocoding ? '...' : 'Buscar'}
                      </button>
                    </div>
                    {showSuggestions && addressSuggestions.length > 0 && (
                      <div style={{
                        position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                        background: 'white', border: '1px solid #DDD', borderRadius: 8, maxHeight: 200, overflow: 'auto',
                        boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
                      }}>
                        {addressSuggestions.map((s, i) => (
                          <div key={i} onMouseDown={() => selectSuggestion(s)}
                            style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F0F0F0' }}>
                            {s.display_name}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                  {!showCep ? (
                    <button type="button" onClick={() => setShowCep(true)}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', fontSize: 13, fontWeight: 600, cursor: 'pointer', padding: '8px 0', textDecoration: 'underline' }}>
                      Buscar por CEP
                    </button>
                  ) : (
                    <div className="flex-row" style={{ gap: 8, marginTop: 8 }}>
                      <input className="input" type="text" value={cep}
                        onChange={e => { setCep(e.target.value.replace(/\D/g, '').slice(0, 8)); }}
                        placeholder="CEP (ex: 01001000)" maxLength={8}
                        style={{ width: 140, flexShrink: 0 }} />
                      <button type="button" className="btn btn-sm btn-secondary"
                        onClick={lookupCep} disabled={cepLoading || cep.replace(/\D/g, '').length !== 8}
                        style={{ whiteSpace: 'nowrap' }}>
                        {cepLoading ? '...' : 'Buscar CEP'}
                      </button>
                      <button type="button" onClick={() => setShowCep(false)}
                        style={{ background: 'none', border: 'none', color: '#999', fontSize: 20, cursor: 'pointer', padding: '0 4px' }}>
                        ×
                      </button>
                    </div>
                  )}
                </>
              )}
            </div>

            {distanceWarning && (
              <div style={{ background: '#FFF3E0', color: '#E65100', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 14, fontWeight: 600 }}>
                {distanceWarning}
              </div>
            )}

            {showMap && lat && editAddr && (
              <div className="form-group">
                <label className="label">Confirme no mapa (clique para ajustar)</label>
                <div style={{ height: 250, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)' }}>
                  <MapContainer
                    center={mapCenter}
                    zoom={15}
                    style={{ height: '100%', width: '100%' }}
                    key={`cust-${mapCenter[0]}-${mapCenter[1]}`}
                  >
                    <TileLayer
                      attribution='&copy; OpenStreetMap'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />
                    {lat && lng && (
                      <Marker
                        position={[lat, lng]}
                        draggable={true}
                        eventHandlers={{
                          dragend(e) {
                            const pos = e.target.getLatLng();
                            setLat(pos.lat);
                            setLng(pos.lng);
                            checkDistanceWarning(pos.lat, pos.lng);
                          }
                        }}
                      />
                    )}
                    <MapClickHandler onClick={(clickLat, clickLng) => {
                      handleMapClick(clickLat, clickLng);
                      checkDistanceWarning(clickLat, clickLng);
                    }} />
                  </MapContainer>
                </div>
                <p className="text-xs text-muted mt-2">Arraste o marcador ou clique para posicionar exatamente.</p>
              </div>
            )}

            <div className="form-group">
              <label className="label">Observações (opcional)</label>
              <textarea className="input" value={notes} onChange={e => setNotes(e.target.value)}
                placeholder="Ex: Sem granola, troco para R$ 50..."
                style={{ resize: 'vertical', minHeight: 60 }} />
            </div>

            <button className="btn btn-primary" type="submit" disabled={loading}>
              {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : 'Ir para Pagamento'}
            </button>

            <p className="text-xs text-muted" style={{ marginTop: 8, textAlign: 'center' }}>
              Pagamento seguro via Mercado Pago
            </p>
          </form>
        </div>
      </div>
    </div>
  );
}
