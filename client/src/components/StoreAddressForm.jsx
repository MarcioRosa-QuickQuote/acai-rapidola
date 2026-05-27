import { useState, useRef, useEffect, memo } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';

export default memo(function StoreAddressForm({ settings, setSettings, saveSettings, uploading, saveMsg, setSaveMsg }) {
  const [localAddr, setLocalAddr] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [showSugs, setShowSugs] = useState(false);
  const [searching, setSearching] = useState(false);
  const [showCep, setShowCep] = useState(false);
  const [cep, setCep] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [locating, setLocating] = useState(false);
  const [mapLat, setMapLat] = useState(null);
  const [mapLng, setMapLng] = useState(null);
  const debounce = useRef(null);
  const inited = useRef(false);

  useEffect(() => {
    if (!inited.current) {
      setLocalAddr(settings.address || '');
      setMapLat(settings.lat || null);
      setMapLng(settings.lng || null);
      inited.current = true;
    }
  }, []);

  function searchAddr(q) {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.length < 3) { setSuggestions([]); setShowSugs(false); setSearching(false); return; }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        const params = new URLSearchParams({ q });
        if (mapLat) params.set('lat', mapLat);
        if (mapLng) params.set('lng', mapLng);
        const res = await fetch(`/api/orders/places-autocomplete?${params}`);
        const data = await res.json();
        setSuggestions((data.results || []).map(r => ({ display_name: r.display_name, lat: r.lat || null, lon: r.lon || null, place_id: r.place_id || null })));
        setShowSugs(data.results?.length > 0);
      } catch { setShowSugs(false); }
      setSearching(false);
    }, 350);
  }

  function pickAddr(s) {
    setLocalAddr(s.display_name);
    setSettings(prev => ({ ...prev, address: s.display_name }));
    if (s.lat && s.lon) {
      setSettings(prev => ({ ...prev, lat: s.lat, lng: s.lon }));
    } else if (s.place_id) {
      fetch(`/api/orders/place-details?place_id=${s.place_id}`)
        .then(r => r.json())
        .then(data => { if (data.lat && data.lon) setSettings(prev => ({ ...prev, lat: String(data.lat), lng: String(data.lon) })); })
        .catch(() => {});
    }
    setShowSugs(false);
    setSuggestions([]);
  }

  async function useLocation() {
    if (!navigator.geolocation) { setSaveMsg('Geolocalização não disponível'); setTimeout(() => setSaveMsg(''), 3000); return; }
    setLocating(true);
    navigator.geolocation.getCurrentPosition(
      async (pos) => {
        const { latitude, longitude } = pos.coords;
        setSettings(prev => ({ ...prev, lat: String(latitude.toFixed(6)), lng: String(longitude.toFixed(6)) }));
        try {
          const res = await fetch(`/api/orders/reverse-geocode?lat=${latitude}&lng=${longitude}`);
          const data = await res.json();
          if (data.display_name) {
            setLocalAddr(data.display_name);
            setSettings(prev => ({ ...prev, address: data.display_name }));
          }
        } catch {}
        setLocating(false);
      },
      () => { setSaveMsg('Permissão negada'); setLocating(false); setTimeout(() => setSaveMsg(''), 3000); },
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 120000 }
    );
  }

  async function lookupCep() {
    const c = cep.replace(/\D/g, '');
    if (c.length !== 8) return;
    setCepLoading(true);
    try {
      const res = await fetch(`/api/orders/cep/${c}`);
      const data = await res.json();
      if (data.error) { setSaveMsg(data.error); setTimeout(() => setSaveMsg(''), 3000); return; }
      setLocalAddr(data.display_name);
      setSettings(prev => ({ ...prev, address: data.display_name }));
      if (data.lat && data.lon) setSettings(prev => ({ ...prev, lat: String(data.lat), lng: String(data.lon) }));
    } catch { setSaveMsg('Erro CEP'); setTimeout(() => setSaveMsg(''), 3000); }
    finally { setCepLoading(false); }
  }

  return (
    <div className="card">
      <div className="page-title" style={{ fontSize: 18, marginBottom: 16 }}>Endereço da Loja</div>

      <button type="button" className="btn btn-outline btn-sm" onClick={useLocation} disabled={locating}
        style={{ width: '100%', justifyContent: 'flex-start', gap: 8, marginBottom: 10, padding: '10px 14px' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
          <circle cx="12" cy="12" r="10"/><circle cx="12" cy="12" r="3"/>
          <line x1="12" y1="2" x2="12" y2="6"/><line x1="12" y1="18" x2="12" y2="22"/>
        </svg>
        {locating ? 'Obtendo localização...' : 'Usar minha localização'}
      </button>

      <div style={{ position: 'relative', marginBottom: 8 }}>
        <input className="input" type="text" value={localAddr}
          onChange={e => { setLocalAddr(e.target.value); searchAddr(e.target.value); }}
          onFocus={() => { if (suggestions.length > 0) setShowSugs(true); }}
          onBlur={() => setTimeout(() => setShowSugs(false), 200)}
          placeholder="Buscar rua, número, bairro…"
          style={{ paddingRight: 40 }} />
        {localAddr && (
          <button type="button" onClick={() => { setLocalAddr(''); setSuggestions([]); setShowSugs(false); }}
            style={{ position: 'absolute', right: 8, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', fontSize: 18, color: '#999', cursor: 'pointer', padding: '4px', lineHeight: 1 }}>
            ✕
          </button>
        )}
        {searching && <span style={{ position: 'absolute', right: 32, top: '50%', transform: 'translateY(-50%)', fontSize: 12, color: '#BBB' }}>…</span>}
        {showSugs && suggestions.length > 0 && (
          <div style={{ position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 50, background: 'white', border: '1px solid #DDD', borderRadius: 8, maxHeight: 220, overflow: 'auto', boxShadow: '0 4px 16px rgba(0,0,0,0.15)' }}>
            {suggestions.map((s, i) => (
              <div key={i} onMouseDown={() => pickAddr(s)}
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
            <MapContainer center={[parseFloat(settings.lat), parseFloat(settings.lng)]} zoom={16}
              style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
              <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker position={[parseFloat(settings.lat), parseFloat(settings.lng)]} draggable={true}
                eventHandlers={{
                  dragend: (e) => {
                    const { lat, lng } = e.target.getLatLng();
                    setSettings(prev => ({ ...prev, lat: String(lat.toFixed(6)), lng: String(lng.toFixed(6)) }));
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
            onChange={e => setCep(e.target.value.replace(/\D/g, '').slice(0, 8))}
            placeholder="CEP (ex: 01001000)" maxLength={8} style={{ width: 140, flexShrink: 0 }} />
          <button type="button" className="btn btn-sm btn-secondary" onClick={lookupCep}
            disabled={cepLoading || cep.replace(/\D/g, '').length !== 8}
            style={{ whiteSpace: 'nowrap' }}>{cepLoading ? '...' : 'Buscar CEP'}</button>
        </div>
      )}

      {saveMsg && (
        <div style={{ background: '#E8F5E9', color: '#2E7D32', padding: 10, borderRadius: 8, marginBottom: 12, textAlign: 'center', fontWeight: 600 }}>
          {saveMsg}
        </div>
      )}

      <button className="btn btn-primary" style={{ marginTop: 14, width: '100%' }} onClick={() => {
        setSettings(prev => ({ ...prev, address: localAddr }));
        saveSettings();
      }} disabled={uploading}>
        {uploading ? 'Salvando...' : 'Salvar Endereço'}
      </button>
    </div>
  );
});
