import { useState, useEffect } from 'react';
import { Polyline, useMap } from 'react-leaflet';

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [bounds]);
  return null;
}

export default function RoutePolyline({ from, to, color = '#1565C0', weight = 3 }) {
  const [positions, setPositions] = useState(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!from || !to || from.lat == null || from.lng == null || to.lat == null || to.lng == null) return;
    let cancelled = false;
    setFailed(false);
    setPositions(null);

    fetch(`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
          setPositions(data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]));
        } else {
          setFailed(true);
        }
      })
      .catch(() => { if (!cancelled) setFailed(true); });
    return () => { cancelled = true; };
  }, [from?.lat, from?.lng, to?.lat, to?.lng]);

  const bounds = positions || (failed ? [[from.lat, from.lng], [to.lat, to.lng]] : null);

  return (
    <>
      {positions && (
        <Polyline positions={positions} pathOptions={{ color, weight, opacity: 0.7 }} />
      )}
      {failed && (
        <Polyline positions={[[from.lat, from.lng], [to.lat, to.lng]]} pathOptions={{ color: '#999', weight: 2, dashArray: '8 4', opacity: 0.5 }} />
      )}
      {bounds && <FitBounds bounds={bounds} />}
    </>
  );
}