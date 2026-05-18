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
  const fLat = Number(from?.lat), fLng = Number(from?.lng), tLat = Number(to?.lat), tLng = Number(to?.lng);
  const valid = !isNaN(fLat) && !isNaN(fLng) && !isNaN(tLat) && !isNaN(tLng);

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    setPositions(null);
    setFailed(false);

    fetch(`https://router.project-osrm.org/route/v1/driving/${fLng},${fLat};${tLng},${tLat}?geometries=geojson&overview=full`)
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
  }, [fLat, fLng, tLat, tLng]);

  const straightLine = [[fLat, fLng], [tLat, tLng]];
  const bounds = positions || straightLine;

  return (
    <>
      {bounds && <FitBounds bounds={bounds} />}
      {positions ? (
        <Polyline positions={positions} pathOptions={{ color, weight, opacity: 0.8 }} />
      ) : valid ? (
        <Polyline positions={straightLine} pathOptions={{ color: '#999', weight: 2, dashArray: '6 4', opacity: 0.6 }} />
      ) : null}
    </>
  );
}