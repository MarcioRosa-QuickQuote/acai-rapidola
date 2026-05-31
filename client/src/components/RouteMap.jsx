import { useState, useEffect, useRef } from 'react';
import { Polyline, useMap } from 'react-leaflet';

function FitBounds({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds) map.fitBounds(bounds, { padding: [40, 40], maxZoom: 16 });
  }, [bounds]);
  return null;
}

export function abbrevStreet(name) {
  if (!name) return name;
  return name
    .replace(/\bTravessa\b/gi, 'Tv.')
    .replace(/\bAvenida\b/gi, 'Av.')
    .replace(/\bDoutor\b/gi, 'Dr.')
    .replace(/\bDoutora\b/gi, 'Dra.')
    .replace(/\bPassagem\b/gi, 'Pass.')
    .replace(/\bRodovia\b/gi, 'Rod.')
    .replace(/\bEstrada\b/gi, 'Est.')
    .replace(/\bPra[çc]a\b/gi, 'Praç.')
    .replace(/\bAlameda\b/gi, 'Al.')
    .replace(/\bConjunto\b/gi, 'Conj.')
    .replace(/\bResidencial\b/gi, 'Res.')
    .replace(/\bServidão\b/gi, 'Serv.')
    .replace(/\bVila\b/gi, 'Vl.')
    .trim();
}

// Ícones de manobra: armazena tipo+modificador OSRM → { path SVG, rotate graus }
const maneuverSVG = {
  straight:      { rotate: 0 },
  'turn-right':  { rotate: 90 },
  'turn-left':   { rotate: -90 },
  'turn-slight-right': { rotate: 45 },
  'turn-slight-left':  { rotate: -45 },
  'turn-sharp-right':  { rotate: 135 },
  'turn-sharp-left':   { rotate: -135 },
  uturn:         { rotate: 180 },
  arrive:        { rotate: 0, arrive: true },
  depart:        { rotate: 0 },
  roundabout:    { rotate: 90 },
  'ramp-right':  { rotate: 45 },
  'ramp-left':   { rotate: -45 },
  'fork-right':  { rotate: 30 },
  'fork-left':   { rotate: -30 },
};

function getManeuverKey(type, modifier) {
  if (modifier) {
    const k = `${type}-${modifier.replace(/ /g, '-')}`;
    if (maneuverSVG[k]) return k;
  }
  if (maneuverSVG[type]) return type;
  return 'straight';
}

export function DirectionArrow({ type = 'straight', modifier = '', size = 32, color = 'white' }) {
  const key = getManeuverKey(type, modifier);
  const { rotate = 0, arrive } = maneuverSVG[key] || {};

  if (arrive) {
    return (
      <svg width={size} height={size} viewBox="0 0 24 24" fill={color}>
        <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
      </svg>
    );
  }

  // Seta para cima, rotacionada conforme a manobra
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill={color}
      style={{ transform: `rotate(${rotate}deg)`, display: 'block' }}>
      <path d="M4 12l1.41 1.41L11 7.83V20h2V7.83l5.58 5.59L20 12l-8-8-8 8z"/>
    </svg>
  );
}

function parseInstruction(step) {
  const type = step.maneuver?.type || 'straight';
  const modifier = step.maneuver?.modifier || '';
  const street = step.name || '';
  const dist = Math.round(step.distance);
  const location = step.maneuver?.location
    ? { lat: step.maneuver.location[1], lng: step.maneuver.location[0] }
    : null;
  const text = step.instruction || `Siga em ${street ? `direção a ${street}` : 'frente'}`;
  return { type, modifier, text, dist, street, location };
}

// Pé perpendicular do ponto p sobre o segmento a→b
function closestPointOnSegment(p, a, b) {
  const dx = b.lng - a.lng, dy = b.lat - a.lat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return a;
  const t = Math.max(0, Math.min(1, ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / lenSq));
  return { lat: a.lat + t * dy, lng: a.lng + t * dx };
}

// Projeta pos no segmento mais próximo da rota — mantém o marcador na rua
// coords: array [[lat, lng], ...] retornado por useRoute
export function snapToRoute(pos, coords) {
  if (!coords || coords.length < 2) return pos;
  let minDist = Infinity, best = pos;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = { lat: coords[i][0],     lng: coords[i][1] };
    const b = { lat: coords[i + 1][0], lng: coords[i + 1][1] };
    const foot = closestPointOnSegment(pos, a, b);
    const d = Math.hypot(pos.lat - foot.lat, pos.lng - foot.lng);
    if (d < minDist) { minDist = d; best = foot; }
  }
  return best;
}

export function useRoute(from, to) {
  const [routeData, setRouteData] = useState(null);
  // Mantém última rota boa enquanto carrega nova (sem piscar)
  const lastGoodRef = useRef(null);
  const fLat = Number(from?.lat), fLng = Number(from?.lng), tLat = Number(to?.lat), tLng = Number(to?.lng);
  const valid = !isNaN(fLat) && !isNaN(fLng) && !isNaN(tLat) && !isNaN(tLng)
    && fLat !== 0 && fLng !== 0 && tLat !== 0 && tLng !== 0;

  useEffect(() => {
    if (!valid) return;
    let cancelled = false;
    // NÃO limpa routeData aqui — mantém rota anterior visível enquanto carrega

    fetch(`/api/route?fLng=${fLng}&fLat=${fLat}&tLng=${tLng}&tLat=${tLat}`)
      .then(r => r.json())
      .then(data => {
        if (cancelled) return;
        if (data.code === 'Ok' && data.routes?.[0]) {
          const r = data.routes[0];
          const coords = r.geometry?.coordinates?.map(c => [c[1], c[0]]) || [];
          const stepsList = r.legs?.[0]?.steps || [];
          const newData = {
            coords,
            steps: stepsList.map(parseInstruction),
            totalDist: Math.round(r.distance),
            totalDur: Math.round(r.duration / 60)
          };
          lastGoodRef.current = newData;
          setRouteData(newData);
        }
        // Se falhou, mantém rota anterior (não limpa)
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [fLat, fLng, tLat, tLng]);

  // Retorna última rota boa enquanto carrega, para evitar piscar
  const effective = routeData || lastGoodRef.current;
  return effective
    ? effective
    : { coords: null, steps: [], totalDist: 0, totalDur: 0, loading: valid };
}

export default function RoutePolyline({ from, to, color = '#1565C0', weight = 3 }) {
  const { coords } = useRoute(from, to);
  const fLat = Number(from?.lat), fLng = Number(from?.lng), tLat = Number(to?.lat), tLng = Number(to?.lng);
  const valid = !isNaN(fLat) && !isNaN(fLng) && !isNaN(tLat) && !isNaN(tLng);
  const straightLine = [[fLat, fLng], [tLat, tLng]];
  const bounds = coords || (valid ? straightLine : null);

  return (
    <>
      {bounds && <FitBounds bounds={bounds} />}
      {coords ? (
        <Polyline positions={coords} pathOptions={{ color, weight, opacity: 0.85 }} />
      ) : valid ? (
        <Polyline positions={straightLine} pathOptions={{ color: '#999', weight: 2, dashArray: '6 4', opacity: 0.6 }} />
      ) : null}
    </>
  );
}
