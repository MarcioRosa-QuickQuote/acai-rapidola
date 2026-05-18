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

  useEffect(() => {
    if (!from || !to) return;
    let cancelled = false;
    fetch(`https://router.project-osrm.org/route/v1/driving/${from.lng},${from.lat};${to.lng},${to.lat}?geometries=geojson&overview=full`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.code === 'Ok' && data.routes?.[0]?.geometry?.coordinates) {
          setPositions(data.routes[0].geometry.coordinates.map(c => [c[1], c[0]]));
        }
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [from?.lat, from?.lng, to?.lat, to?.lng]);

  return (
    <>
      {positions && (
        <>
          <FitBounds bounds={positions} />
          <Polyline positions={positions} pathOptions={{ color, weight, opacity: 0.7 }} />
        </>
      )}
    </>
  );
}