import { useState, useEffect } from 'react';
import { Polyline, useMap } from 'react-leaflet';

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [bounds]);
  return null;
}

const maneuverIcons = {
  'turn-right': '→', 'turn-left': '←',
  'turn-slight-right': '↗', 'turn-slight-left': '↖',
  'turn-sharp-right': '⇀', 'turn-sharp-left': '↩',
  'straight': '↑', 'uturn': '↩',
  'roundabout': '⤻', 'ramp-right': '→', 'ramp-left': '←',
  'fork-right': 'Y', 'fork-left': 'Y',
  'arrive': '📍', 'depart': '🏁'
};

function parseInstruction(step) {
  const type = step.maneuver?.type || 'straight';
  const modifier = step.maneuver?.modifier || '';
  const street = step.name || '';
  const dist = Math.round(step.distance);
  const key = modifier ? `${type}-${modifier}` : type;
  const icon = maneuverIcons[key] || '↑';
  const text = step.instruction || `Siga em ${street ? `direção a ${street}` : 'frente'}`;
  return { icon, text, dist, street };
}

export function useRoute(from, to) {
  const [routeData, setRouteData] = useState(null);
  const fLat = Number(from?.lat), fLng = Number(from?.lng), tLat = Number(to?.lat), tLng = Number(to?.lng);
  const valid = !isNaN(fLat) && !isNaN(fLng) && !isNaN(tLat) && !isNaN(tLng);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    setRouteData(null);

    fetch(`https://router.project-osrm.org/route/v1/driving/${fLng},${fLat};${tLng},${tLat}?geometries=geojson&overview=full&steps=true`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.code === 'Ok' && data.routes?.[0]) {
          const r = data.routes[0];
          const coords = r.geometry?.coordinates?.map(c => [c[1], c[0]]) || [];
          const stepsList = r.legs?.[0]?.steps || [];
          setRouteData({
            coords,
            steps: stepsList.map(parseInstruction),
            totalDist: Math.round(r.distance),
            totalDur: Math.round(r.duration / 60)
          });
        } else {
          setRouteData({ coords: null, steps: [], totalDist: 0, totalDur: 0, error: true });
        }
      })
      .catch(() => { if (!cancelled) setRouteData({ coords: null, steps: [], totalDist: 0, totalDur: 0, error: true }); });
    return () => { cancelled = true; };
  }, [fLat, fLng, tLat, tLng]);

  return routeData || { coords: null, steps: [], totalDist: 0, totalDur: 0, loading: !routeData && valid };
}

export default function RoutePolyline({ from, to, color = '#1565C0', weight = 3 }) {
  const { coords } = useRoute(from, to);
  const fLat = Number(from?.lat), fLng = Number(from?.lng), tLat = Number(to?.lat), tLng = Number(to?.lng);
  const valid = !isNaN(fLat) && !isNaN(fLng) && !isNaN(tLat) && !isNaN(tLng);
  const straightLine = [[fLat, fLng], [tLat, tLng]];
  const bounds = coords || straightLine;

  return (
    <>
      {bounds && <FitBounds bounds={bounds} />}
      {coords ? (
        <Polyline positions={coords} pathOptions={{ color, weight, opacity: 0.8 }} />
      ) : valid ? (
        <Polyline positions={straightLine} pathOptions={{ color: '#999', weight: 2, dashArray: '6 4', opacity: 0.6 }} />
      ) : null}
    </>
  );
}

export function NavSteps({ steps }) {
  const [currentIdx, setCurrentIdx] = useState(0);
  const current = steps[currentIdx];
  if (!steps.length) return null;

  const remaining = steps.slice(currentIdx).reduce((s, st) => s + st.dist, 0);

  return (
    <div style={{
      position: 'absolute', top: 10, left: 10, right: 10, zIndex: 10,
      background: 'rgba(255,255,255,0.95)', backdropFilter: 'blur(8px)',
      borderRadius: 14, padding: 14, boxShadow: '0 4px 20px rgba(0,0,0,0.15)'
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 8 }}>
        <div style={{
          width: 44, height: 44, borderRadius: 12,
          background: 'var(--primary)', display: 'flex', alignItems: 'center', justifyContent: 'center',
          fontSize: 22, color: 'white', flexShrink: 0
        }}>{current.icon}</div>
        <div style={{ flex: 1 }}>
          <div style={{ fontWeight: 700, fontSize: 15 }}>{current.text}</div>
          {current.street && <div style={{ fontSize: 13, color: '#888' }}>{current.street}</div>}
        </div>
        <div style={{ textAlign: 'right', flexShrink: 0 }}>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--primary)' }}>
            {remaining < 1000 ? `${remaining}m` : `${(remaining/1000).toFixed(1)}km`}
          </div>
        </div>
      </div>
      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' }}>
        {steps.map((_, i) => (
          <div key={i} style={{
            width: i === currentIdx ? 16 : 6, height: 6, borderRadius: 3,
            background: i === currentIdx ? 'var(--primary)' : '#DDD',
            transition: 'all 0.3s'
          }} />
        ))}
      </div>
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        {currentIdx > 0 && (
          <button className="btn btn-sm btn-outline" style={{ flex: 1 }}
            onClick={() => setCurrentIdx(i => Math.max(0, i - 1))}>Anterior</button>
        )}
        {currentIdx < steps.length - 1 && (
          <button className="btn btn-sm btn-primary" style={{ flex: 1 }}
            onClick={() => setCurrentIdx(i => Math.min(steps.length - 1, i + 1))}>Próxima</button>
        )}
      </div>
    </div>
  );
}