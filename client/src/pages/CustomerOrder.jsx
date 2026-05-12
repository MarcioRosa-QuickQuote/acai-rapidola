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
  const [splitLiter, setSplitLiter] = useState(false);

  useEffect(() => {
    if (orderItems.some(i => (i.size_ml || product?.size_ml) >= 1000)) {
      setSplitLiter(splitCount > 0);
    }
  }, []);

  function updateDeliveryFee(custLat, custLng) {
    setDeliveryFee(d => d > 0 ? d : 6.50);
    if (!store?.lat || !store?.lng || !custLat || !custLng) return;
    const R = 6371;
    const dLat = (custLat - store.lat) * Math.PI / 180;
    const dLng = (custLng - store.lng) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(store.lat * Math.PI / 180) * Math.cos(custLat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
    const km = R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
    const fee = Math.max(6.50, parseFloat((5.00 + km * 1.80).toFixed(2)));
    setDeliveryFee(fee);
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
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(address)}&limit=1&countrycodes=BR`
      );
      const data = await res.json();
      if (data.length > 0) {
        const newLat = parseFloat(data[0].lat);
        const newLng = parseFloat(data[0].lon);
        setLat(newLat);
        setLng(newLng);
        setMapCenter([newLat, newLng]);
        setShowMap(true);
        updateDeliveryFee(newLat, newLng);
      } else {
        setError('Endereço não encontrado. Tente um endereço mais específico.');
        setTimeout(() => setError(''), 4000);
      }
    } catch {
      setError('Erro ao buscar endereço.');
      setTimeout(() => setError(''), 4000);
    } finally {
      setGeocoding(false);
    }
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
        navigate(`/customer/payment/${data.order.id}`);
      } else {
        setError(data.error || data.message || 'Erro ao criar pedido');
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
            onClick={() => navigate('/customer')}>
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
              {addrSaved && (
                <div style={{ background: '#E8F5E9', color: '#2E7D32', padding: '8px 12px', borderRadius: 8, marginBottom: 10, fontSize: 13, fontWeight: 600 }}>
                  Endereço salvo! So precisa cadastrar uma vez.
                </div>
              )}
              <div className="flex-row" style={{ gap: 8 }}>
                <input className="input" type="text" value={address} onChange={e => setAddress(e.target.value)}
                  onBlur={() => { if (address.length > 10) geocodeAddress(); }}
                  placeholder="Rua, número, bairro - Cidade" required
                  style={{ flex: 1 }} />
                <button type="button" className="btn btn-sm btn-secondary"
                  onClick={geocodeAddress} disabled={geocoding}
                  style={{ width: 'auto', whiteSpace: 'nowrap' }}>
                  {geocoding ? '...' : 'Buscar'}
                </button>
              </div>
            </div>

            {(showMap || lat) && (
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
                          }
                        }}
                      />
                    )}
                    <MapClickHandler onClick={handleMapClick} />
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
          </form>
        </div>
      </div>
    </div>
  );
}
