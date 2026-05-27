import { useState, useRef, useEffect, memo } from 'react';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';

function shortAddr(full) {
  if (!full) return '';
  const parts = full.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return '';
  let s = parts[0];
  let n = '', h = '', c = 1;
  if (parts[c] && /^\d+(\s*-?\s*\d+)?$/.test(parts[c].replace(/\s/g, ''))) { n = parts[c]; c++; }
  if (parts[c]) h = parts[c];
  let r = s.replace(/\bPassagem\b/gi, 'Pass.').replace(/\bTravessa\b/gi, 'Tv.').replace(/\bAvenida\b/gi, 'Av.').replace(/\bAlameda\b/gi, 'Al.').replace(/\bPraça\b/gi, 'Praç.').replace(/\bRodovia\b/gi, 'Rod.').replace(/\bEstrada\b/gi, 'Est.');
  if (n) r += `, ${n}`;
  if (h) r += ` - ${h.replace(/\bPassagem\b/gi, 'Pass.').replace(/\bTravessa\b/gi, 'Tv.').replace(/\bAvenida\b/gi, 'Av.').replace(/\bAlameda\b/gi, 'Al.').replace(/\bPraça\b/gi, 'Praç.').replace(/\bRodovia\b/gi, 'Rod.').replace(/\bEstrada\b/gi, 'Est.')}`;
  return r;
}

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

  function extractCity(name) {
    const parts = (name || '').split(',').map(s => s.trim());
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i];
      if (/^(Região|Estado|Brazil|Brasil)$/i.test(p)) continue;
      if (/^\d/.test(p)) continue;
      if (p && !p.includes('-') && !p.includes('R$')) return p;
    }
    return '';
  }

  const knownCity = extractCity(settings.address);

  function searchAddr(q) {
    if (debounce.current) clearTimeout(debounce.current);
    if (q.length < 3) { setSuggestions([]); setShowSugs(false); setSearching(false); return; }
    setSearching(true);
    debounce.current = setTimeout(async () => {
      try {
        const searchQ = knownCity ? `${q}, ${knownCity}` : q;
        const params = new URLSearchParams({ q: searchQ });
        if (mapLat) params.set('lat', mapLat);
        if (mapLng) params.set('lng', mapLng);
        const res = await fetch(`/api/orders/places-autocomplete?${params}`);
        const data = await res.json();
        let results = (data.results || []).map(r => ({
          display_name: r.display_name,
          lat: r.lat || null,
          lon: r.lon || null,
          place_id: r.place_id || null,
          _city: extractCity(r.display_name),
        }));
        const numInQuery = q.match(/(\d[\d\s\-]*)$/);
        if (results.length === 0 && q.length >= 5) {
          const latLng = (mapLat && mapLng);
          const viewbox = latLng ? `&viewbox=${mapLng - 0.05},${mapLat + 0.05},${mapLng + 0.05},${mapLat - 0.05}&bounded=1` : '';
          if (numInQuery) {
            const streetQ = searchQ.replace(numInQuery[0], '').trim();
            const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(streetQ)}&countrycodes=br&limit=5&addressdetails=1${viewbox}`, { headers: { 'User-Agent': 'AcaiRapidola/1.0' } });
            const nomData = await nomRes.json();
            results = (nomData || []).map(r => {
              const short = shortAddr(r.display_name);
              const withNum = short.replace(/(,\s*\d+)?\s*-\s*/, `, ${numInQuery[1].trim()} - `);
              return { display_name: withNum, _city: extractCity(r.display_name), lat: r.lat, lon: r.lon, place_id: null };
            });
          } else {
            const nomRes = await fetch(`https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(searchQ)}&countrycodes=br&limit=7&addressdetails=1${viewbox}`, { headers: { 'User-Agent': 'AcaiRapidola/1.0' } });
            const nomData = await nomRes.json();
            results = (nomData || []).map(r => {
              const short = shortAddr(r.display_name);
              return { display_name: short, _city: extractCity(r.display_name), lat: r.lat, lon: r.lon, place_id: null };
            });
          }
        } else if (results.length > 0 && numInQuery) {
          results = results.map(r => {
            const short = shortAddr(r.display_name);
            const hasNum = short.match(/\d+/);
            if (!hasNum) {
              const streetOnly = short.replace(/,\s*\d+\s*-\s*/, ' - ').replace(/,\s*\d+$/, '');
              return { ...r, display_name: `${streetOnly}, ${numInQuery[1].trim()}`, _city: extractCity(r.display_name) };
            }
            return { ...r, display_name: short, _city: extractCity(r.display_name) };
          });
        } else {
          results = results.map(r => ({ ...r, display_name: shortAddr(r.display_name), _city: extractCity(r.display_name) }));
        }
        if (knownCity)
          results = results.filter(r => !r._city || r._city.toLowerCase().includes(knownCity.toLowerCase().slice(0, 6)));
        setSuggestions(results);
        setShowSugs(results.length > 0);
      } catch { setShowSugs(false); }
      setSearching(false);
    }, 350);
  }

  function pickAddr(s) {
    setLocalAddr(s.display_name);
    setSettings(prev => ({ ...prev, address: s.display_name }));
    if (s.lat && s.lon) {
      const lat = parseFloat(s.lat), lng = parseFloat(s.lon);
      setMapLat(lat); setMapLng(lng);
      setSettings(prev => ({ ...prev, lat: String(lat), lng: String(lng) }));
    } else if (s.place_id) {
      fetch(`/api/orders/place-details?place_id=${s.place_id}`)
        .then(r => r.json())
        .then(data => {
          if (data.lat && data.lon) {
            const lat = parseFloat(data.lat), lng = parseFloat(data.lon);
            setMapLat(lat); setMapLng(lng);
            setSettings(prev => ({ ...prev, lat: String(lat), lng: String(lng) }));
            if (data.display_name) setLocalAddr(data.display_name);
          }
        })
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
        const lat = parseFloat(latitude.toFixed(6)), lng = parseFloat(longitude.toFixed(6));
        setMapLat(lat); setMapLng(lng);
        setSettings(prev => ({ ...prev, lat: String(lat), lng: String(lng) }));
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
      if (data.lat && data.lon) { const lat = parseFloat(data.lat), lng = parseFloat(data.lon); setMapLat(lat); setMapLng(lng); setSettings(prev => ({ ...prev, lat: String(lat), lng: String(lng) })); }
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

      {(mapLat || settings.lat) && (mapLng || settings.lng) && (
        <div style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 11, color: '#888', marginBottom: 4 }}>Use o mapa para ajustar o ponto exato</div>
          <div style={{ height: 200, borderRadius: 10, overflow: 'hidden', border: '1px solid var(--border)' }}>
            <MapContainer center={[mapLat || parseFloat(settings.lat), mapLng || parseFloat(settings.lng)]} zoom={16}
              key={`map-${mapLat || 0}-${mapLng || 0}`}
              style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
              <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
              <Marker position={[mapLat || parseFloat(settings.lat), mapLng || parseFloat(settings.lng)]} draggable={true}
                eventHandlers={{
                  dragend: (e) => {
                    const { lat, lng } = e.target.getLatLng();
                    setMapLat(lat); setMapLng(lng);
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
