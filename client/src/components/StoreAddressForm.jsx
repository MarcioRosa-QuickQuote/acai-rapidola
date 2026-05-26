import { useState, useRef } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';

export default function StoreAddressForm({ settings, setSettings, mapCenter, saveSettings, uploading, saveMsg, setSaveMsg }) {
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showAddrSuggestions, setShowAddrSuggestions] = useState(false);
  const [searchingAddr, setSearchingAddr] = useState(false);
  const [showCep, setShowCep] = useState(false);
  const [cep, setCep] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [savingAddr, setSavingAddr] = useState(false);
  const searchTimer = useRef(null);

  function searchAddress(q) {
    if (searchTimer.current) clearTimeout(searchTimer.current);
    if (q.length < 3) { setAddressSuggestions([]); setShowAddrSuggestions(false); setSearchingAddr(false); return; }
    setSearchingAddr(true);
    searchTimer.current = setTimeout(async () => {
      try {
        const nomUrl = `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(q)}&countrycodes=br&limit=5&addressdetails=1`;
        const res = await fetch(nomUrl, { headers: { 'User-Agent': 'AcaiRapidola/1.0' } });
        const data = await res.json();
        const results = (data || []).map(r => ({ display_name: r.display_name, lat: r.lat, lon: r.lon }));
        setAddressSuggestions(results);
        setShowAddrSuggestions(results.length > 0);
      } catch { setShowAddrSuggestions(false); }
      setSearchingAddr(false);
    }, 350);
  }

  function selectAddress(suggestion) {
    setSettings(s => ({ ...s, address: suggestion.display_name, lat: suggestion.lat, lng: suggestion.lon }));
    setShowAddrSuggestions(false);
    setAddressSuggestions([]);
  }

  async function geocodeAddress() {
    if (!settings.address) return;
    setSavingAddr(true);
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(settings.address)}&limit=1&countrycodes=BR`);
      const data = await res.json();
      if (data.length > 0) {
        setSettings(s => ({ ...s, lat: String(parseFloat(data[0].lat)), lng: String(parseFloat(data[0].lon)) }));
      } else {
        setSaveMsg('Endereço não encontrado. Tente um endereço mais específico.');
        setTimeout(() => setSaveMsg(''), 4000);
      }
    } catch {
      setSaveMsg('Erro ao buscar endereço.');
      setTimeout(() => setSaveMsg(''), 4000);
    }
    setSavingAddr(false);
  }

  async function lookupCep() {
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
      if (data.lat && data.lon) setSettings(s => ({ ...s, lat: String(data.lat), lng: String(data.lon) }));
      setShowAddrSuggestions(false);
    } catch {
      setSaveMsg('Erro ao consultar CEP');
      setTimeout(() => setSaveMsg(''), 3000);
    }
    setCepLoading(false);
  }

  async function useMyLocation() {
    if (!navigator.geolocation) { setSaveMsg('Geolocalização não disponível'); setTimeout(() => setSaveMsg(''), 3000); return; }
    setSavingAddr(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setSettings(s => ({ ...s, lat: String(latitude.toFixed(6)), lng: String(longitude.toFixed(6)) }));
        try {
          const res = await fetch(`/api/orders/reverse-geocode?lat=${latitude}&lng=${longitude}`);
          const data = await res.json();
          if (data.display_name) setSettings(s => ({ ...s, address: data.display_name }));
        } catch {}
        setSavingAddr(false);
      },
      () => { setSaveMsg('Permissão de localização negada'); setSavingAddr(false); setTimeout(() => setSaveMsg(''), 3000); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 }
    );
  }

  return (
    <div className="card">
      <div className="page-title" style={{ fontSize: 18, marginBottom: 16 }}>Endereço da Loja</div>

      <button type="button" className="btn btn-outline btn-sm"
        onClick={useMyLocation} disabled={savingAddr}
        style={{ width: '100%', justifyContent: 'flex-start', gap: 8, marginBottom: 10, padding: '10px 14px' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
          <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
        </svg>
        {savingAddr ? 'Obtendo localização...' : 'Usar minha localização'}
      </button>

      <div style={{ position: 'relative', marginBottom: 8 }}>
        <input className="input" type="text" value={settings.address}
          onChange={e => { setSettings(s => ({ ...s, address: e.target.value })); searchAddress(e.target.value); }}
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
        {searchingAddr && <span style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#BBB' }}>…</span>}
        {showAddrSuggestions && addressSuggestions.length > 0 && (
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

      {settings.lat && settings.lng && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Use o mapa para ajustar o ponto exato</div>
          <div style={{ height: 200, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <MapContainer center={[parseFloat(settings.lat) || mapCenter[0], parseFloat(settings.lng) || mapCenter[1]]} zoom={16}
              style={{ height: '100%', width: '100%' }}
              key={`addr-map-${settings.lat || 0}-${settings.lng || 0}`} scrollWheelZoom={false}>
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
            onClick={lookupCep} disabled={cepLoading || cep.replace(/\D/g, '').length !== 8}
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
