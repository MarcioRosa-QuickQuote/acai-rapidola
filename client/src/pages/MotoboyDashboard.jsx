import { useState, useEffect, useMemo, useRef } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { App as CapApp } from '@capacitor/app';
import { APP_BUILD } from '../version';
import { requestLocationPermission, watchPosition, getCurrentPosition } from '../utils/geolocation';
import { MapContainer, TileLayer, Marker, Polyline, useMap, useMapEvents } from 'react-leaflet';
import RoutePolyline, { useRoute, abbrevStreet, DirectionArrow } from '../components/RouteMap';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import MLMap, { Marker as MLMarker, Source, Layer } from 'react-map-gl/maplibre';
import 'maplibre-gl/dist/maplibre-gl.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const statusLabels = {
  pending: 'Aguardando pgto', confirmed: 'Aguardando preparo', preparing: 'Preparando',
  ready: 'Pronto p/ retirar', assigned: 'Retirar na loja',
  picked_up: 'Saiu pra entrega', in_transit: 'Saiu pra entrega',
  arriving: 'Chegando!', delivered: 'Entregue', cancelled: 'Cancelado'
};

const statusColors = {
  assigned: 'badge-primary', picked_up: 'badge-info',
  arriving: 'badge-accent', delivered: 'badge-success'
};

// Reformata endereços no padrão "BR, 2629, Avenida X, Bairro, Cidade, Estado"
// (código de rodovia federal retornado pelo Nominatim) → "Av. X, 2629 - Bairro"
function fmtAddr(full) {
  if (!full) return '';
  const parts = full.split(',').map(s => s.trim()).filter(Boolean);
  if (!parts.length) return '';
  if (
    parts.length >= 3 &&
    /^[A-Z]{2}(-\d+)?$/i.test(parts[0]) &&
    /^\d+$/.test(parts[1]) &&
    /^(Avenida|Rua|Travessa|Alameda|Passagem|Rodovia|Estrada|Praça)/i.test(parts[2])
  ) {
    const street = abbrevStreet(parts[2]);
    const hood = parts[3] || '';
    const isCity = /^(Belém|Manaus|São Paulo|Rio|Salvador|Fortaleza|Recife|Curitiba|Porto Alegre|Brasília|Goiânia|Pará|Amazonas|Bahia|Ceará|Minas|Paraná|Santa|Mato|Goiás|Piauí|Maranhão|Sergipe|Alagoas|Pernambuco|Paraíba|Tocantins|Rondônia|Roraima|Amapá|Acre)/i.test(hood);
    return `${street}, ${parts[1]}${hood && !isCity ? ` - ${hood}` : ''}`;
  }
  return abbrevStreet(parts.slice(0, 2).join(', '));
}

// Motoboy confirma entrega a partir de picked_up, in_transit ou arriving
// A saída da loja (assigned → picked_up) é confirmada pela loja
const nextStatus = {
  picked_up: 'delivered',
  in_transit: 'delivered',
  arriving:   'delivered',
};

const nextStatusLabel = {
  picked_up: 'Entregue ✓',
  in_transit: 'Entregue ✓',
  arriving:   'Entregue ✓',
};

function FollowMotoboy({ pos, follow }) {
  const map = useMap();
  useEffect(() => {
    if (follow && pos) map.setView([pos.lat, pos.lng], map.getZoom(), { animate: true });
  }, [pos?.lat, pos?.lng, follow]);
  return null;
}

function calcBearing(from, to) {
  const dLng = (to.lng - from.lng) * Math.PI / 180;
  const lat1 = from.lat * Math.PI / 180;
  const lat2 = to.lat * Math.PI / 180;
  const y = Math.sin(dLng) * Math.cos(lat2);
  const x = Math.cos(lat1) * Math.sin(lat2) - Math.sin(lat1) * Math.cos(lat2) * Math.cos(dLng);
  return (Math.atan2(y, x) * 180 / Math.PI + 360) % 360;
}

function haversineKm(from, to) {
  const R = 6371;
  const dLat = (to.lat - from.lat) * Math.PI / 180;
  const dLng = (to.lng - from.lng) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(from.lat * Math.PI / 180) * Math.cos(to.lat * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

// Pé perpendicular do ponto p sobre o segmento a→b (em lat/lng 2D, válido para distâncias pequenas)
function closestPointOnSegment(p, a, b) {
  const dx = b.lng - a.lng;
  const dy = b.lat - a.lat;
  const lenSq = dx * dx + dy * dy;
  if (lenSq === 0) return a;
  const t = Math.max(0, Math.min(1, ((p.lng - a.lng) * dx + (p.lat - a.lat) * dy) / lenSq));
  return { lat: a.lat + t * dy, lng: a.lng + t * dx };
}

// Projeta a posição GPS no segmento mais próximo da rota (map matching simplificado)
// Retorna { snappedPos, routeBearing } — pos sobre a rua + direção do trecho
function snapToRoute(pos, coords) {
  if (!coords || coords.length < 2) return { snappedPos: pos, routeBearing: 0 };
  let minDist = Infinity, snappedPos = pos, routeBearing = 0;
  for (let i = 0; i < coords.length - 1; i++) {
    const a = { lat: coords[i][0], lng: coords[i][1] };
    const b = { lat: coords[i + 1][0], lng: coords[i + 1][1] };
    const foot = closestPointOnSegment(pos, a, b);
    const dist = haversineKm(pos, foot);
    if (dist < minDist) {
      minDist = dist;
      snappedPos = foot;
      routeBearing = calcBearing(a, b);
    }
  }
  return { snappedPos, routeBearing };
}

// Mantém o mapa Leaflet centralizado na posição do motoboy (usado na nav ativa)
function LeafletRecenter({ pos }) {
  const map = useMap();
  useEffect(() => {
    if (pos) map.setView([pos.lat, pos.lng], map.getZoom(), { animate: true, duration: 0.5 });
  }, [pos?.lat, pos?.lng]);
  return null;
}

// Detecta quando o usuário arrasta o mapa manualmente
function PanDetector({ onPan }) {
  useMapEvents({ dragstart: () => onPan() });
  return null;
}

function NavScreen({ order, onClose, onStatusUpdate, statusLabel }) {
  const [pos, setPos] = useState(null);
  const [heading, setHeading] = useState(0);
  const [follow, setFollow] = useState(true);

  // Intercepta botão voltar do Android nesta tela
  useEffect(() => {
    let handler;
    CapApp.addListener('backButton', () => onClose()).then(h => { handler = h; });
    return () => { handler?.remove(); };
  }, [onClose]);
  const [currentStepIdx, setCurrentStepIdx] = useState(0);
  const [navStarted, setNavStarted] = useState(false);
  const prevPosRef = useRef(null);
  const headingRef = useRef(0);
  const coordsRef = useRef(null);
  const mapRef = useRef(null);
  const lastRouteOriginRef = useRef(null);
  const [routeOrigin, setRouteOrigin] = useState(null);
  const [showOverview, setShowOverview] = useState(false);
  const [overviewPanned, setOverviewPanned] = useState(false); // usuário soltou a mão no overview

  const isToStore = order.status === 'assigned';

  const storeCoords = { lat: order.store_lat, lng: order.store_lng };
  const customerCoords = { lat: order.customer_lat, lng: order.customer_lng };
  const routeDest = isToStore ? storeCoords : customerCoords;
  const { steps, totalDist, totalDur, coords, loading: routeLoading } = useRoute(routeOrigin || {}, routeDest);

  // Quando a rota carrega: seta heading inicial pelo 1º segmento e guarda coords na ref
  useEffect(() => {
    if (!coords || coords.length < 2) return;
    coordsRef.current = coords;
    // Heading inicial = direção do primeiro segmento da rota (funciona mesmo parado)
    const a = { lat: coords[0][0], lng: coords[0][1] };
    const b = { lat: coords[1][0], lng: coords[1][1] };
    const initBearing = calcBearing(a, b);
    headingRef.current = initBearing;
    setHeading(initBearing);
  }, [coords]);

  // Quando nav inicia: posiciona câmera no ponto inicial da rota com bearing correto
  useEffect(() => {
    if (!navStarted) return;
    const timer = setTimeout(() => {
      const map = mapRef.current?.getMap?.() ?? mapRef.current;
      const c = coordsRef.current;
      if (!map || !c || c.length < 2) return;
      const center = pos
        ? (() => { const { snappedPos } = snapToRoute(pos, c); return [snappedPos.lng, snappedPos.lat]; })()
        : [c[0][1], c[0][0]];
      try {
        map.easeTo({ center, bearing: headingRef.current, pitch: 60, zoom: 17.5, duration: 700, padding: { top: 320, bottom: 0 } });
      } catch (_) {}
    }, 400);
    return () => clearTimeout(timer);
  }, [navStarted]);

  // Segue o motoboy com câmera MapLibre (pitch 60°, bearing = direção de viagem)
  useEffect(() => {
    if (!pos || !follow || !navStarted) return;
    const map = mapRef.current?.getMap?.() ?? mapRef.current;
    if (!map) return;
    try {
      map.easeTo({
        center: [pos.lng, pos.lat],
        bearing: heading,
        pitch: 60,
        zoom: 17.5,
        duration: 900,
        padding: { top: 320, bottom: 0, left: 0, right: 0 }
      });
    } catch (_) {}
  }, [pos?.lat, pos?.lng, heading, follow, navStarted]);

  // Solicita permissão de localização ao montar (Android/iOS nativo)
  useEffect(() => {
    requestLocationPermission().catch(() => {});
  }, []);

  // GPS: snap à rota + heading pelo segmento atual (não pelo magnetômetro)
  useEffect(() => {
    const watch = watchPosition(
      p => {
        const rawPos = { lat: p.coords.latitude, lng: p.coords.longitude };
        prevPosRef.current = rawPos;
        const lastOrigin = lastRouteOriginRef.current;
        if (!lastOrigin || haversineKm(rawPos, lastOrigin) > 0.08) {
          lastRouteOriginRef.current = rawPos;
          setRouteOrigin({ lat: rawPos.lat, lng: rawPos.lng });
        }
        const c = coordsRef.current;

        if (c && c.length >= 2) {
          // Snap to route: projeta GPS no segmento mais próximo
          const { snappedPos, routeBearing } = snapToRoute(rawPos, c);
          setPos(snappedPos);
          // Suavização 30% no bearing da rota
          const diff = ((routeBearing - headingRef.current + 540) % 360) - 180;
          const smoothed = (headingRef.current + diff * 0.3 + 360) % 360;
          headingRef.current = smoothed;
          setHeading(smoothed);
        } else {
          setPos(rawPos);
        }
      },
      () => {},
      { enableHighAccuracy: true, timeout: 10000, maximumAge: 3000 }
    );
    return () => watch.remove();
  }, []);


  // Auto-avança para próximo passo quando motoboy está a < 30m da próxima manobra
  useEffect(() => {
    if (!pos || !steps.length) return;
    const nextStep = steps[currentStepIdx + 1];
    if (!nextStep?.location) return;
    const distToNext = haversineKm(pos, nextStep.location) * 1000; // metros
    if (distToNext < 30 && currentStepIdx < steps.length - 1) {
      setCurrentStepIdx(i => i + 1);
    }
  }, [pos?.lat, pos?.lng, steps, currentStepIdx]);

  const step = steps[currentStepIdx];
  const nextStep = steps[currentStepIdx + 1]; // próxima manobra (o que o motoboy vai fazer)
  const remaining = steps.slice(currentStepIdx).reduce((s, st) => s + st.dist, 0);
  const hasRoute = order.store_lat && order.customer_lat;
  const mapCenterLeaflet = pos
    ? [pos.lat, pos.lng]
    : [(order.store_lat + order.customer_lat) / 2 || -1.45, (order.store_lng + order.customer_lng) / 2 || -48.5];

  // Ícones Leaflet (usados apenas na tela overview)
  const motoboyIcon = useMemo(() => L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#1565C0" stroke="white" stroke-width="3"/><polygon points="20,8 28,28 20,23 12,28" fill="white"/></svg>`,
    className: '', iconSize: [40, 40], iconAnchor: [20, 20]
  }), []);

  const destIcon = useMemo(() => L.divIcon({
    html: `<svg xmlns="http://www.w3.org/2000/svg" width="28" height="36" viewBox="0 0 28 36"><ellipse cx="14" cy="14" rx="14" ry="14" fill="#4A148C"/><line x1="14" y1="26" x2="14" y2="36" stroke="#4A148C" stroke-width="3"/><circle cx="14" cy="14" r="6" fill="white"/></svg>`,
    className: '', iconSize: [28, 36], iconAnchor: [14, 36]
  }), []);

  const storeIcon = useMemo(() => L.divIcon({
    html: `<img src="/logo_placa.png" style="width:44px;height:44px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5))"/>`,
    className: '', iconSize: [44, 44], iconAnchor: [22, 22]
  }), []);

  // GeoJSON da rota para MapLibre (formato [lng, lat])
  const routeGeoJSON = useMemo(() => {
    if (!coords || coords.length < 2) return null;
    return {
      type: 'Feature',
      geometry: { type: 'LineString', coordinates: coords.map(([lat, lng]) => [lng, lat]) }
    };
  }, [coords]);

  // ── OVERVIEW (igual tela 1 do Waze) ──────────────────────────────────────
  if (!navStarted) {
    return (
      <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000 }}>
        {hasRoute && (
          <div style={{ position: 'absolute', inset: 0 }}>
            <MapContainer center={mapCenterLeaflet} zoom={14} style={{ width: '100%', height: '100%' }}
              zoomControl={false} key={`ov-${order.id}`}>
              <TileLayer
                attribution='&copy; <a href="https://carto.com">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              />
              {/* Detecta pan manual; se pan ativo não auto-centraliza */}
              <PanDetector onPan={() => setOverviewPanned(true)} />
              {!overviewPanned && <LeafletRecenter pos={pos} />}
              {pos && <Marker position={[pos.lat, pos.lng]} icon={motoboyIcon} />}
              {/* Loja SEMPRE visível como logo_placa */}
              {order.store_lat && <Marker position={[order.store_lat, order.store_lng]} icon={storeIcon} />}
              {/* Destino do cliente (quando indo ao cliente) */}
              {!isToStore && <Marker position={[order.customer_lat, order.customer_lng]} icon={destIcon} />}
              <RoutePolyline
                from={routeOrigin || (pos ? pos : storeCoords)}
                to={routeDest}
                color="#4A148C" weight={8} />
            </MapContainer>
          </div>
        )}

        {/* Botão recentralizar — aparece quando usuário soltou o mapa */}
        {overviewPanned && pos && (
          <div onClick={() => setOverviewPanned(false)} style={{
            position: 'absolute', bottom: 240, right: 20, zIndex: 22,
            width: 46, height: 46, borderRadius: 23,
            background: 'white', boxShadow: '0 3px 12px rgba(0,0,0,0.25)',
            display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer'
          }}>
            <svg width="24" height="24" viewBox="0 0 24 24" fill="#4A148C">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
            </svg>
          </div>
        )}

        {/* Voltar */}
        <div onClick={onClose} style={{
          position: 'absolute', top: 48, left: 16, zIndex: 20,
          width: 40, height: 40, borderRadius: 20, background: 'white',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', boxShadow: '0 2px 8px rgba(0,0,0,0.2)'
        }}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="#333"><path d="M20 11H7.83l5.59-5.59L12 4l-8 8 8 8 1.41-1.41L7.83 13H20v-2z"/></svg>
        </div>

        {/* Label de rota */}
        <div style={{
          position: 'absolute', top: 48, left: '50%', transform: 'translateX(-50%)', zIndex: 20,
          background: 'white', borderRadius: 20, padding: '8px 18px',
          fontSize: 13, fontWeight: 600, whiteSpace: 'nowrap',
          boxShadow: '0 2px 8px rgba(0,0,0,0.15)', color: '#333'
        }}>
          {isToStore ? 'Sua localização' : (order.store_name || 'Loja')} → {isToStore ? (order.store_name || 'Loja') : order.customer_name}
        </div>

        {/* Painel inferior */}
        <div style={{
          position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
          background: 'white', borderRadius: '24px 24px 0 0',
          padding: '20px 20px 40px', boxShadow: '0 -4px 30px rgba(0,0,0,0.2)'
        }}>
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 14, marginBottom: 6 }}>
            <div style={{ fontSize: 42, fontWeight: 900, color: '#111' }}>
              {totalDist > 0 ? (totalDur > 0 ? `${totalDur} min` : '< 1 min') : '-- min'}
            </div>
            <div style={{ fontSize: 20, color: '#888', fontWeight: 600 }}>
              {totalDist > 0 ? `${(totalDist / 1000).toFixed(1)} km` : ''}
            </div>
          </div>
          <div style={{ fontSize: 14, color: '#444', fontWeight: 500, marginBottom: 4, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {isToStore
              ? `Por ${order.store_address || order.store_name || 'loja'}`
              : `Por ${fmtAddr(order.customer_address) || order.customer_name}`}
          </div>
          <div style={{ fontSize: 13, color: '#888', marginBottom: 24 }}>
            {isToStore ? 'Retirar pedido na loja' : 'Melhor rota, Trânsito normal'}
          </div>
          <div style={{ display: 'flex' }}>
            <button style={{
              flex: 1, padding: '15px 0', borderRadius: 32, border: 'none',
              background: (routeLoading || !routeOrigin) ? '#90A4AE' : '#1565C0',
              fontSize: 17, fontWeight: 800, color: 'white',
              cursor: (routeLoading || !routeOrigin) ? 'default' : 'pointer',
              opacity: (routeLoading || !routeOrigin) ? 0.8 : 1,
              transition: 'background 0.3s'
            }} onClick={() => { if (!routeLoading && routeOrigin) setNavStarted(true); }}>
              {!routeOrigin ? 'Calculando rota…' : routeLoading ? 'Calculando rota…' : 'Iniciar corrida'}
            </button>
          </div>
        </div>
      </div>
    );
  }

  // ── NAVEGAÇÃO ATIVA — MapLibre GL (visão em primeira pessoa, mapa inclinado) ──
  const instrBg = isToStore ? '#1565C0' : '#4A148C';
  const initLng = pos?.lng ?? ((order.store_lng + order.customer_lng) / 2) ?? -48.5;
  const initLat = pos?.lat ?? ((order.store_lat + order.customer_lat) / 2) ?? -1.45;
  const navHour = new Date().getHours();
  const isDaytime = navHour >= 6 && navHour < 19;
  const mapTileStyle = isDaytime
    ? 'https://basemaps.cartocdn.com/gl/voyager-gl-style/style.json'
    : 'https://basemaps.cartocdn.com/gl/dark-matter-gl-style/style.json';

  return (
    <div style={{ position: 'fixed', top: 0, left: 0, right: 0, bottom: 0, zIndex: 1000, background: isDaytime ? '#e8e8e0' : '#0f0f19' }}>
      {/* Mapa MapLibre GL — perspectiva 3D em primeira pessoa */}
      {hasRoute && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 2 }}>
          <MLMap
            ref={mapRef}
            initialViewState={{
              longitude: initLng,
              latitude: initLat,
              zoom: 17.5,
              pitch: 60,
              bearing: heading
            }}
            style={{ width: '100%', height: '100%' }}
            mapStyle={mapTileStyle}
            attributionControl={false}
          >
            {routeGeoJSON && (
              <Source id="route-src" type="geojson" data={routeGeoJSON}>
                <Layer id="route-shadow" type="line"
                  paint={{ 'line-color': '#000', 'line-width': 16, 'line-opacity': 0.25, 'line-blur': 6 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
                <Layer id="route-line" type="line"
                  paint={{ 'line-color': '#7B1FA2', 'line-width': 10, 'line-opacity': 1 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
                <Layer id="route-edge" type="line"
                  paint={{ 'line-color': '#CE93D8', 'line-width': 3, 'line-opacity': 0.7 }}
                  layout={{ 'line-cap': 'round', 'line-join': 'round' }} />
              </Source>
            )}
            {order.store_lat ? (
              <MLMarker longitude={order.store_lng} latitude={order.store_lat} anchor="bottom">
                <img src="/logo_placa.png" style={{ width: 52, height: 52, objectFit: 'contain', filter: 'drop-shadow(0 3px 8px rgba(0,0,0,0.6))' }} />
              </MLMarker>
            ) : null}
            {!isToStore && (
              <MLMarker longitude={order.customer_lng} latitude={order.customer_lat} anchor="bottom">
                <svg width="32" height="42" viewBox="0 0 32 42" xmlns="http://www.w3.org/2000/svg">
                  <circle cx="16" cy="16" r="16" fill="#4A148C"/>
                  <line x1="16" y1="30" x2="16" y2="42" stroke="#4A148C" strokeWidth="4"/>
                  <circle cx="16" cy="16" r="7" fill="white"/>
                </svg>
              </MLMarker>
            )}
            {pos && (
              <MLMarker longitude={pos.lng} latitude={pos.lat} anchor="center" offset={[0, 16]}>
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center' }}>
                  <div style={{ filter: 'drop-shadow(0 4px 10px rgba(0,180,255,0.6))' }}>
                    <svg width="48" height="64" viewBox="0 0 48 64" xmlns="http://www.w3.org/2000/svg">
                      <path d="M24 2 L44 60 L24 48 L4 60 Z"
                        fill="#00BFFF" stroke="white" strokeWidth="2.5" strokeLinejoin="round"/>
                      <ellipse cx="24" cy="18" rx="4" ry="6" fill="white" opacity="0.5"/>
                      <ellipse cx="24" cy="44" rx="5" ry="7" fill="rgba(0,0,0,0.25)"/>
                    </svg>
                  </div>
                  {step?.street && (
                    <div style={{ position: 'relative', marginTop: 0, pointerEvents: 'none' }}>
                      <div style={{
                        position: 'absolute', top: -5, left: '50%',
                        transform: 'translateX(-50%)',
                        width: 0, height: 0,
                        borderLeft: '6px solid transparent',
                        borderRight: '6px solid transparent',
                        borderBottom: isDaytime ? '6px solid white' : '6px solid rgba(28,28,44,0.97)'
                      }} />
                      <div style={{
                        background: isDaytime ? 'white' : 'rgba(28,28,44,0.97)',
                        color: isDaytime ? '#1a1a2e' : 'white',
                        fontWeight: 700, fontSize: 12, padding: '5px 14px',
                        borderRadius: 20, whiteSpace: 'nowrap', maxWidth: 240,
                        overflow: 'hidden', textOverflow: 'ellipsis',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.35)', letterSpacing: 0.1
                      }}>
                        {abbrevStreet(step.street)}
                      </div>
                    </div>
                  )}
                </div>
              </MLMarker>
            )}
          </MLMap>
        </div>
      )}

      {/* Overlay: mapa overview durante navegação ativa */}
      {showOverview && (
        <div style={{ position: 'absolute', inset: 0, zIndex: 30 }}>
          {hasRoute && (
            <MapContainer center={mapCenterLeaflet} zoom={14} style={{ width: '100%', height: '100%' }}
              zoomControl={false} key={`ov-active-${order.id}`}>
              <TileLayer
                attribution='&copy; <a href="https://carto.com">CARTO</a>'
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              />
              <LeafletRecenter pos={pos} />
              {pos && <Marker position={[pos.lat, pos.lng]} icon={motoboyIcon} />}
              {/* Loja sempre visível */}
              {order.store_lat && <Marker position={[order.store_lat, order.store_lng]} icon={storeIcon} />}
              {/* Pino do cliente só quando indo ao cliente */}
              {!isToStore && <Marker position={[order.customer_lat, order.customer_lng]} icon={destIcon} />}
              <RoutePolyline from={routeOrigin || (pos ? pos : storeCoords)} to={routeDest} color="#4A148C" weight={8} />
            </MapContainer>
          )}
          {/* Botão voltar à primeira pessoa */}
          <div onClick={() => setShowOverview(false)} style={{
            position: 'absolute', bottom: 40, right: 20, zIndex: 40,
            width: 54, height: 54, borderRadius: 27,
            background: '#1565C0',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', boxShadow: '0 4px 18px rgba(0,0,0,0.4)'
          }}>
            <svg width="26" height="26" viewBox="0 0 24 24" fill="white">
              <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
            </svg>
          </div>
        </div>
      )}

      {/* Barra de instrução no topo (estilo Waze) */}
      <div style={{
        position: 'absolute', top: 0, left: 0, right: 0, zIndex: 25,
        background: instrBg,
        paddingTop: 'max(10px, env(safe-area-inset-top, 10px))',
        paddingBottom: 10, paddingLeft: 16, paddingRight: 16
      }}>
        {/* Instrução unificada para ir à loja OU ao cliente:
            seta = próxima manobra, nome = rua em que vai entrar */}
        {step ? (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            {/* Ícone de direção (SVG, sem problema de renderização) */}
            <div style={{
              width: 52, height: 52, borderRadius: 14, background: 'rgba(255,255,255,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <DirectionArrow
                type={nextStep ? (nextStep.type || 'straight') : 'arrive'}
                modifier={nextStep ? (nextStep.modifier ?? '') : ''}
                size={30}
                color="white"
              />
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              {/* Distância até a próxima manobra */}
              <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: 14, fontWeight: 700, marginBottom: 2 }}>
                {remaining < 1000 ? `${remaining} m` : `${(remaining / 1000).toFixed(1)} km`}
              </div>
              {/* Próxima manobra: nome da rua em que vai dobrar OU "Siga em frente" */}
              <div style={{
                color: 'white', fontWeight: 800, fontSize: 19, lineHeight: 1.25,
                overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap'
              }}>
                {(() => {
                  if (!nextStep || nextStep.type === 'arrive') return abbrevStreet(step.street) || 'Chegando…';
                  const mod = nextStep.modifier ?? '';
                  const typ = nextStep.type ?? '';
                  // Siga em frente: modifier vazio em passo de continuação, ou modifier='straight'
                  const isStraight = mod === 'straight' ||
                    (mod === '' && (typ === 'continue' || typ === 'new name' || typ === 'depart'));
                  if (isStraight) return 'Siga em frente';
                  // Curva: nome da rua que vai entrar
                  if (nextStep.street) return abbrevStreet(nextStep.street);
                  // Fallback descritivo quando não há nome de rua
                  if (mod.includes('left'))  return 'Vire à esquerda';
                  if (mod.includes('right')) return 'Vire à direita';
                  return 'Siga em frente';
                })()}
              </div>
              {/* Sub-label contextual */}
              {isToStore && (
                <div style={{ color: 'rgba(255,255,255,0.6)', fontSize: 11, marginTop: 2 }}>
                  Retirar pedido — {order.store_name || 'Loja'}
                </div>
              )}
            </div>
          </div>
        ) : (
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 52, height: 52, borderRadius: 14, background: 'rgba(255,255,255,0.18)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0
            }}>
              <DirectionArrow type="arrive" size={30} color="white" />
            </div>
            <div style={{ color: 'white', fontWeight: 800, fontSize: 18 }}>
              {isToStore
                ? `Chegando em ${order.store_name || 'Loja'}…`
                : `Chegando em ${order.customer_name || 'destino'}…`}
            </div>
          </div>
        )}

        {/* Bolinhas de progresso */}
        {steps.length > 1 && (
          <div style={{ display: 'flex', gap: 4, marginTop: 10, justifyContent: 'center' }}>
            {steps.map((_, i) => (
              <div key={i} style={{
                width: i === currentStepIdx ? 20 : 6, height: 4, borderRadius: 2,
                background: i === currentStepIdx ? 'white' : 'rgba(255,255,255,0.3)',
                transition: 'all 0.3s'
              }} />
            ))}
          </div>
        )}
      </div>


      {/* Barra inferior — tema escuro para combinar com mapa dark */}
      <div style={{
        position: 'absolute', bottom: 0, left: 0, right: 0, zIndex: 20,
        background: 'rgba(15,15,25,0.96)', padding: '14px 16px 32px',
        display: 'flex', alignItems: 'center', gap: 12,
        boxShadow: '0 -2px 30px rgba(0,0,0,0.5)', backdropFilter: 'blur(16px)'
      }}>
        {/* Re-center */}
        <div onClick={() => {
          setFollow(f => {
            if (!f) {
              const map = mapRef.current?.getMap?.() ?? mapRef.current;
              if (map && pos) {
                map.easeTo({ center: [pos.lng, pos.lat], bearing: heading, pitch: 60, zoom: 17.5, duration: 800, padding: { top: 320, bottom: 0 } });
              }
            }
            return !f;
          });
        }} style={{
          width: 46, height: 46, borderRadius: 23,
          background: follow ? 'rgba(0,191,255,0.15)' : 'rgba(255,255,255,0.08)',
          display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', flexShrink: 0,
          border: follow ? '1.5px solid rgba(0,191,255,0.5)' : '1.5px solid rgba(255,255,255,0.12)'
        }}>
          <svg width="22" height="22" viewBox="0 0 24 24" fill={follow ? '#00BFFF' : '#666'}>
            <path d="M12 8c-2.21 0-4 1.79-4 4s1.79 4 4 4 4-1.79 4-4-1.79-4-4-4zm8.94 3c-.46-4.17-3.77-7.48-7.94-7.94V1h-2v2.06C6.83 3.52 3.52 6.83 3.06 11H1v2h2.06c.46 4.17 3.77 7.48 7.94 7.94V23h2v-2.06c4.17-.46 7.48-3.77 7.94-7.94H23v-2h-2.06zM12 19c-3.87 0-7-3.13-7-7s3.13-7 7-7 7 3.13 7 7-3.13 7-7 7z"/>
          </svg>
        </div>

        {/* ETA */}
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 28, fontWeight: 900, color: 'white', lineHeight: 1 }}>
            {totalDist > 0 ? (totalDur > 0 ? `${totalDur} min` : '< 1 min') : '-- min'}
          </div>
          <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.5)', marginTop: 3 }}>
            {totalDist > 0 ? `${(totalDist / 1000).toFixed(1)} km` : ''}
            {totalDist > 0 && ' • '}
            {isToStore ? 'Ir à loja' : order.customer_name}
          </div>
        </div>

        {/* Botão mapa overview + Ação/Fechar */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          <div onClick={() => setShowOverview(true)} style={{
            width: 46, height: 46, borderRadius: 23,
            background: 'rgba(255,255,255,0.08)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            cursor: 'pointer', border: '1.5px solid rgba(255,255,255,0.15)'
          }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="#CCC">
              <path d="M20.5 3l-.16.03L15 5.1 9 3 3.36 4.9c-.21.07-.36.25-.36.48V20.5c0 .28.22.5.5.5l.16-.03L9 18.9l6 2.1 5.64-1.9c.21-.07.36-.25.36-.48V3.5c0-.28-.22-.5-.5-.5zM15 19l-6-2.11V5l6 2.11V19z"/>
            </svg>
          </div>
          <div style={{
            padding: '13px 18px', borderRadius: 26,
            background: 'rgba(255,255,255,0.08)', border: '1.5px solid rgba(255,255,255,0.15)',
            color: 'rgba(255,255,255,0.8)', fontWeight: 700, fontSize: 14,
            cursor: 'pointer'
          }} onClick={() => setNavStarted(false)}>Fechar</div>
        </div>
      </div>
    </div>
  );
}

export default function MotoboyDashboard() {
  const { user, apiFetch, logout } = useAuth();
  const { socket, setToast, notifications } = useSocket();
  const [availableOrders, setAvailableOrders] = useState([]);
  const [myOrders, setMyOrders] = useState([]);
  const [store, setStore] = useState(null);
  const [route, setRoute] = useState(null);
  const [pixKey, setPixKey] = useState(() => localStorage.getItem('motoboy_pix_key') || '');
  const [pixSaving, setPixSaving] = useState(false);
  const [pixMsg, setPixMsg] = useState('');
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [editName, setEditName] = useState('');
  const [editEmail, setEditEmail] = useState('');
  const [editCpf, setEditCpf] = useState('');
  const [editPlate, setEditPlate] = useState('');
  const [editWhatsapp, setEditWhatsapp] = useState('');

  function maskCpf(v) {
    const nums = v.replace(/\D/g, '').slice(0, 11);
    return nums.replace(/^(\d{3})(\d{3})?(\d{3})?(\d{2})?$/, (_, a, b, c, d) =>
      a + (b ? '.' + b : '') + (c ? '.' + c : '') + (d ? '-' + d : '')
    );
  }
  const [loading, setLoading] = useState(true);
  const [online, setOnline] = useState(true);
  const [darkMode, setDarkMode] = useState(() => {
    const saved = localStorage.getItem('mb_dark');
    if (saved !== null) return saved === '1';
    const h = new Date().getHours();
    return h >= 18 || h < 7; // automático: escuro após 18h e antes das 7h
  });
  const [showPaymentModal, setShowPaymentModal] = useState(false);
  const [modalCpf, setModalCpf] = useState('');
  const [modalVehicle, setModalVehicle] = useState('moto');
  const [modalPix, setModalPix] = useState('');
  const [modalSaving, setModalSaving] = useState(false);
  const [selectedTab, setSelectedTab] = useState('available');
  const [pageTab, setPageTab] = useState('inicio');
  const [isEmployee, setIsEmployee] = useState(false);
  const [isLinked, setIsLinked] = useState(false); // vinculado a alguma loja → recebe pedidos automático
  const [earnings, setEarnings] = useState({ total: 0, pending: 0, list: [] });
  const [myRating, setMyRating] = useState(null); // { avg, count }
  const [fullscreenOrder, setFullscreenOrder] = useState(null);
  const restoredNav = useRef(false);

  // Quando a loja confirma a saída (assigned → picked_up), myOrders atualiza via
  // polling/socket e este efeito propaga o novo status para o fullscreenOrder,
  // fazendo o nav trocar automaticamente o destino (loja → cliente)
  useEffect(() => {
    if (!fullscreenOrder) return;
    const updated = myOrders.find(o => o.id === fullscreenOrder.id);
    if (updated && updated.status !== fullscreenOrder.status) {
      setFullscreenOrder(updated);
    }
  }, [myOrders]);

  const openNav = (order) => {
    localStorage.setItem('mb_nav_order', order.id);
    setFullscreenOrder(order);
  };
  const closeNav = () => {
    localStorage.removeItem('mb_nav_order');
    setFullscreenOrder(null);
    setPageTab('inicio');
  };
  const [finPeriod, setFinPeriod] = useState('dia');

  useEffect(() => {
    loadData();
    apiFetch('/stores').then(d => {
      if (d.data && d.data.length > 0) setStore(d.data[0]);
    });
    apiFetch('/motoboy/profile').then(d => {
      if (d.employments && d.employments.some(e => e.employee)) setIsEmployee(true);
      if (d.employments && d.employments.length > 0) setIsLinked(true);
      if (d.total !== undefined) setEarnings({ total: d.total, pending: d.pending, list: d.earnings || [] });
    });
    // Busca a média de avaliações do entregador logado
    if (user?.id) {
      apiFetch(`/ratings/motoboy/${user.id}`).then(d => {
        if (d.count > 0) setMyRating({ avg: d.avg, count: d.count });
      }).catch(() => {});
    }
    const interval = setInterval(loadData, 30000); // fallback — socket cobre em real-time
    return () => clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!socket) return;
    // Ao reconectar: recarrega dados imediatamente (eventos perdidos durante o drop)
    socket.on('connect', () => loadData());
    socket.on('order_updated', () => loadData());
    // new_available_order: servidor emite para sala role:motoboy quando pedido novo chega
    socket.on('new_available_order', () => loadData());
    return () => {
      socket.off('connect');
      socket.off('order_updated');
      socket.off('new_available_order');
    };
  }, [socket]);

  async function loadData() {
    const [avail, mine] = await Promise.all([
      apiFetch('/motoboy/available'),
      apiFetch('/orders')
    ]);
    if (avail.data) setAvailableOrders(avail.data);
    if (mine.data) {
      // Filtra por motoboy_id != null: o servidor retorna (meus pedidos) OU (disponíveis com null).
      // Não usar user?.id aqui — closure pode capturar user=null na primeira renderização.
      const filtered = mine.data.filter(o => o.motoboy_id != null);
      setMyOrders(filtered);

      // Restaurar rota ativa após refresh
      if (!restoredNav.current) {
        restoredNav.current = true;
        const savedId = localStorage.getItem('mb_nav_order');
        if (savedId) {
          const active = filtered.find(o =>
            o.id === savedId && ['assigned', 'picked_up', 'in_transit', 'arriving'].includes(o.status)
          );
          if (active) setFullscreenOrder(active);
          else localStorage.removeItem('mb_nav_order');
        }
      }
    }
    setLoading(false);
  }

  async function acceptOrder(orderId) {
    const result = await apiFetch(`/motoboy/accept/${orderId}`, { method: 'POST' });
    if (result.error) { setToast(result.error); return; }
    setToast('Pedido aceito!');
    const [, mine] = await Promise.all([
      apiFetch('/motoboy/available'),
      apiFetch('/orders')
    ]);
    if (mine.data) {
      setMyOrders(mine.data.filter(o => o.motoboy_id != null));
      const accepted = mine.data.find(o => o.id === orderId);
      if (accepted) openNav(accepted);
    }
    setLoading(false);
  }

  async function updateStatus(orderId) {
    const order = myOrders.find(o => o.id === orderId);
    if (!order) return;
    const next = nextStatus[order.status];
    if (!next) return;

    await apiFetch(`/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: next })
    });

    await loadData();
  }

  async function optimizeRoute() {
    const activeIds = myOrders.map(o => o.id);
    const data = await apiFetch('/motoboy/optimize-route', {
      method: 'POST',
      body: JSON.stringify({ orderIds: activeIds })
    });
    if (data.route) {
      setRoute({ store: data.store, route: data.route });
    }
  }

  async function sendLocation() {
    getCurrentPosition(async (pos) => {
      await apiFetch('/motoboy/location', {
        method: 'POST',
        body: JSON.stringify({
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          online: online ? 1 : 0
        })
      });
    }, (err) => {
      console.warn('[GPS] Erro ao obter posição:', err.message);
    }, { enableHighAccuracy: true, timeout: 10000, maximumAge: 5000 });
  }

  useEffect(() => {
    if (online) {
      sendLocation();
      const interval = setInterval(sendLocation, 15000);
      return () => clearInterval(interval);
    }
  }, [online]);

  // Telas de status especial não precisam esperar o loadData — approval_status já vem no JWT
  if (user?.approval_status === 'pending') return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'flex-start',
      minHeight: '100vh', padding: 32, paddingTop: 'clamp(32px, 12vh, 100px)', textAlign: 'center',
      background: 'linear-gradient(160deg, #1a0533 0%, #4A148C 100%)'
    }}>
      <img src="/lp_motoboytrans.png" alt="entregador" style={{ width: 220, objectFit: 'contain', marginBottom: 24 }} />
      <div style={{ fontSize: 40, marginBottom: 12 }}>⏳</div>
      <div style={{ fontWeight: 800, fontSize: 22, color: 'white', marginBottom: 8 }}>Cadastro em análise</div>
      <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.8, maxWidth: 320, marginBottom: 32 }}>
        Recebemos seu cadastro!<br />
        Nossa equipe irá revisar seus dados e<br />
        você receberá uma confirmação em breve.
      </div>
      <button onClick={logout} style={{
        background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none',
        padding: '10px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600
      }}>Sair</button>
    </div>
  );

  // Tela de conta suspensa
  if (user?.approval_status === 'suspended') {
    const suspendedUntil = user.suspended_until ? new Date(user.suspended_until) : null;
    const now = new Date();
    const daysLeft = suspendedUntil
      ? Math.max(0, Math.ceil((suspendedUntil - now) / (1000 * 60 * 60 * 24)))
      : null;
    const dtFmt = suspendedUntil
      ? suspendedUntil.toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: 'numeric' })
      : null;
    return (
      <div style={{
        display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
        minHeight: '100vh', padding: 32, textAlign: 'center',
        background: 'linear-gradient(160deg, #1a0533 0%, #4A148C 100%)'
      }}>
        <img src="/logo_placa.png" alt="logo" style={{ width: 100, height: 100, objectFit: 'contain', marginBottom: 24, filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))' }} />
        <div style={{ fontSize: 40, marginBottom: 12 }}>⏸</div>
        <div style={{ fontWeight: 800, fontSize: 22, color: 'white', marginBottom: 8 }}>Conta suspensa</div>
        {dtFmt && (
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, maxWidth: 320, marginBottom: 16 }}>
            {daysLeft === 0
              ? 'Suspensão termina hoje. Tente novamente mais tarde.'
              : `Suspensão por mais ${daysLeft} dia${daysLeft !== 1 ? 's' : ''} (até ${dtFmt}).`}
          </div>
        )}
        {!dtFmt && (
          <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.7)', lineHeight: 1.6, maxWidth: 320, marginBottom: 16 }}>
            Sua conta foi suspensa. Entre em contato com o suporte.
          </div>
        )}
        {user.rejection_reason && (
          <div style={{ background: 'rgba(106,27,154,0.3)', borderRadius: 12, padding: '12px 20px', maxWidth: 320, marginBottom: 24, border: '1px solid rgba(255,255,255,0.15)' }}>
            <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.6)', marginBottom: 4 }}>Motivo:</div>
            <div style={{ fontSize: 13, color: 'white' }}>{user.rejection_reason}</div>
          </div>
        )}
        <button onClick={logout} style={{
          background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none',
          padding: '10px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600
        }}>Sair</button>
      </div>
    );
  }

  // Tela de cadastro recusado
  if (user?.approval_status === 'rejected') return (
    <div style={{
      display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center',
      minHeight: '100vh', padding: 32, textAlign: 'center',
      background: 'linear-gradient(160deg, #1a0533 0%, #4A148C 100%)'
    }}>
      <img src="/logo_placa.png" alt="logo" style={{ width: 100, height: 100, objectFit: 'contain', marginBottom: 24, filter: 'drop-shadow(0 4px 16px rgba(0,0,0,0.5))' }} />
      <div style={{ fontSize: 40, marginBottom: 12 }}>❌</div>
      <div style={{ fontWeight: 800, fontSize: 22, color: 'white', marginBottom: user.rejection_reason ? 8 : 24 }}>Cadastro não aprovado</div>
      {user.rejection_reason && (
        <div style={{ background: 'rgba(229,57,53,0.2)', borderRadius: 12, padding: '12px 20px', maxWidth: 320, marginBottom: 24, border: '1px solid rgba(229,57,53,0.3)' }}>
          <div style={{ fontSize: 13, color: 'white' }}>{user.rejection_reason}</div>
        </div>
      )}
      <button onClick={logout} style={{
        background: 'rgba(255,255,255,0.15)', color: 'white', border: 'none',
        padding: '10px 24px', borderRadius: 10, cursor: 'pointer', fontSize: 13, fontWeight: 600
      }}>Sair</button>
    </div>
  );

  // Spinner só aparece para entregadores aprovados enquanto carrega os dados
  if (loading) return <div className="loading"><img className="spin" src="/saco_acai.png" /></div>;

  const tabs = [
    { key: 'inicio', label: 'Início', icon: '🏠' },
    { key: 'pedidos', label: 'Pedidos', icon: '📋' },
    { key: 'saldo', label: 'Saldo', icon: '💰' },
    { key: 'perfil', label: 'Perfil', icon: '👤' },
  ];

  // myOrders só contém pedidos com motoboy_id preenchido (os do motoboy logado).
  // Mostra tudo que ainda não foi entregue — inclui confirmed/preparing/ready
  // para quando a loja ainda não finalizou o preparo.
  const activeDeliveries = myOrders.filter(o => o.status !== 'delivered');
  // Remove da lista "disponível" pedidos que já estão nos ativos (evita duplicata)
  const activeIds = new Set(activeDeliveries.map(o => o.id));
  const filteredAvailable = availableOrders.filter(o => !activeIds.has(o.id));

  function renderInicio() {
    const primary = activeDeliveries[0];
    const others  = activeDeliveries.slice(1);

    return (
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>

        {/* ── Status online/offline ── */}
        <div style={{
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          background: online ? mb.greenBg : mb.card,
          borderRadius: 14, padding: '14px 18px',
          border: `1px solid ${online ? mb.greenBorder : mb.cardBorder}`
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
            <div style={{
              width: 11, height: 11, borderRadius: '50%',
              background: online ? mb.green : mb.sub,
              boxShadow: online ? `0 0 0 3px ${mb.greenBorder}` : 'none'
            }} />
            <div>
              <div style={{ fontSize: 15, fontWeight: 700, color: online ? mb.green : mb.sub }}>
                {online ? 'Online · aceitando corridas' : 'Offline'}
              </div>
              <div style={{ fontSize: 11, color: mb.sub, marginTop: 1 }}>
                {online ? 'Toque para pausar' : 'Toque para ativar'}
              </div>
            </div>
          </div>
          <div className="toggle-switch" onClick={() => {
            if (online) { setOnline(false); return; }
            if (!user?.cpf || !user?.pix_key) { setShowPaymentModal(true); return; }
            setOnline(true); sendLocation();
          }}>
            <input type="checkbox" checked={online} readOnly />
            <span className="toggle-slider" />
          </div>
        </div>

        {/* ── Label "Em andamento" ── */}
        {activeDeliveries.length > 0 && (
          <div style={{ fontSize: 12, fontWeight: 700, color: mb.sub, textTransform: 'uppercase', letterSpacing: 1.2, paddingLeft: 2 }}>
            Em andamento
          </div>
        )}

        {/* ── Entrega ativa — card HERO ── */}
        {primary && (
          <div style={{
            background: `linear-gradient(145deg, ${mb.accentDark}, ${mb.accent})`,
            borderRadius: 18, padding: '20px 20px 18px',
            position: 'relative', overflow: 'hidden', cursor: 'pointer'
          }} onClick={() => openNav(primary)}>
            {/* Círculo decorativo */}
            <div style={{ position: 'absolute', top: -28, right: -28, width: 130, height: 130, borderRadius: '50%', background: 'rgba(255,255,255,0.06)', pointerEvents: 'none' }} />
            {(() => {
              const isToStore = primary.status === 'assigned';
              const destName    = isToStore ? primary.store_name    : primary.customer_name;
              const destAddr    = isToStore ? (primary.store_address || primary.store_name) : primary.customer_address;
              const destLabel   = isToStore ? '🏪 Buscar na loja' : '📦 Entregar ao cliente';
              const secondLabel = isToStore ? `👤 ${primary.customer_name}` : `🏪 ${primary.store_name}`;
              return (
                <>
                  {/* Topo: label + valor no canto direito */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                    <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.65)', fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1.2 }}>
                      {destLabel}
                    </div>
                    <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
                      <div style={{ fontSize: 10, color: 'rgba(255,255,255,0.55)', marginBottom: 1 }}>Seu frete</div>
                      <div style={{ fontSize: 20, fontWeight: 800, color: 'white', lineHeight: 1 }}>R$ {(primary.delivery_fee ?? 0).toFixed(2)}</div>
                    </div>
                  </div>
                  {/* Linha 1 — destino principal (grande) */}
                  <div style={{ fontSize: 22, fontWeight: 800, color: 'white', lineHeight: 1.2, marginBottom: 4 }}>
                    {destName}
                  </div>
                  {/* Linha 2 — endereço do destino */}
                  <div style={{ fontSize: 14, color: 'rgba(255,255,255,0.8)', marginBottom: 16, lineHeight: 1.4 }}>
                    📍 {fmtAddr(destAddr)}
                  </div>
                  {/* Linha 3 — info secundária + status */}
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.65)' }}>{secondLabel}</div>
                    <div style={{ fontSize: 12, fontWeight: 700, color: 'white', background: 'rgba(255,255,255,0.16)', padding: '4px 12px', borderRadius: 20 }}>
                      {statusLabels[primary.status] || primary.status}
                    </div>
                  </div>
                </>
              );
            })()}
            {/* Navegar chip */}
            <div style={{ marginTop: 14, display: 'flex', alignItems: 'center', gap: 6, color: 'rgba(255,255,255,0.75)', fontSize: 12, fontWeight: 600 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="rgba(255,255,255,0.75)">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              Toque para navegar
            </div>
          </div>
        )}

        {/* ── Outras entregas ativas (se houver mais de 1) ── */}
        {others.map(order => (
          <div key={order.id} style={{
            background: mb.card, borderRadius: 14, padding: '14px 16px',
            border: `1px solid ${mb.accent}44`, cursor: 'pointer',
            display: 'flex', justifyContent: 'space-between', alignItems: 'center'
          }} onClick={() => openNav(order)}>
            {(() => {
              const toStore = !['picked_up', 'in_transit', 'arriving', 'delivered'].includes(order.status);
              return (
                <div style={{ flex: 1, minWidth: 0 }}>
                  {/* Linha 1 */}
                  <div style={{ fontSize: 15, fontWeight: 700, color: mb.text, marginBottom: 3 }}>
                    {toStore ? order.store_name : order.customer_name}
                  </div>
                  {/* Linha 2 */}
                  <div style={{ fontSize: 12, color: mb.sub, marginBottom: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    📍 {fmtAddr(toStore ? (order.store_address || order.store_name) : order.customer_address)}
                  </div>
                  {/* Linha 3 */}
                  <div style={{ fontSize: 11, color: mb.sub }}>
                    #{order.id.slice(-4)} · {toStore ? `👤 ${order.customer_name}` : `🏪 ${order.store_name}`}
                  </div>
                </div>
              );
            })()}
            <div style={{ textAlign: 'right', flexShrink: 0, marginLeft: 12 }}>
              <div style={{ fontSize: 16, fontWeight: 800, color: mb.accent }}>R$ {(order.delivery_fee ?? 0).toFixed(2)}</div>
              <div style={{ fontSize: 11, color: mb.sub, marginTop: 3 }}>{statusLabels[order.status]}</div>
            </div>
          </div>
        ))}

        {/* ── Aguardando (vinculado, sem pedido ativo) ── */}
        {isLinked && activeDeliveries.length === 0 && (
          <div style={{ background: mb.accentLight, borderRadius: 14, padding: '18px 18px', border: `1px solid ${mb.accent}44`, display: 'flex', alignItems: 'center', gap: 14 }}>
            <span style={{ fontSize: 28 }}>🔔</span>
            <div>
              <div style={{ fontWeight: 700, fontSize: 15, color: mb.accent }}>Aguardando pedidos</div>
              <div style={{ fontSize: 12, color: mb.sub, marginTop: 3 }}>Os pedidos chegam automaticamente quando a loja estiver pronta</div>
            </div>
          </div>
        )}

        {/* ── Pedidos disponíveis para aceitar (avulso) ── */}
        {!isLinked && filteredAvailable.length > 0 && (
          <>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0' }}>
              <div style={{ flex: 1, height: 1, background: mb.cardBorder }} />
              <span style={{ fontSize: 10, fontWeight: 700, color: mb.sub, textTransform: 'uppercase', letterSpacing: 0.8, whiteSpace: 'nowrap' }}>
                Disponíveis para aceitar
              </span>
              <div style={{ flex: 1, height: 1, background: mb.cardBorder }} />
            </div>
            {filteredAvailable.map(order => (
              <div key={order.id} style={{ background: mb.card, borderRadius: 14, padding: '14px 16px', border: `1px solid ${mb.cardBorder}` }}>
                {/* Linha 1 — destino + valor */}
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                  <div style={{ fontSize: 16, fontWeight: 700, color: mb.text }}>🏪 {order.store_name}</div>
                  <div style={{ fontSize: 18, fontWeight: 800, color: mb.green, flexShrink: 0, marginLeft: 10 }}>R$ {(order.delivery_fee ?? 0).toFixed(2)}</div>
                </div>
                {/* Linha 2 — endereço da loja */}
                <div style={{ fontSize: 13, color: mb.sub, marginBottom: 4 }}>📍 {fmtAddr(order.store_address || order.store_name)}</div>
                {/* Linha 3 — cliente + ID */}
                <div style={{ fontSize: 11, color: mb.sub, marginBottom: 12 }}>👤 {order.customer_name} · #{order.id.slice(-4)}</div>
                <button style={{
                  width: '100%', height: 44, background: mb.accent, color: 'white',
                  border: 'none', borderRadius: 12, fontSize: 14, fontWeight: 700, cursor: 'pointer'
                }} onClick={() => acceptOrder(order.id)}>
                  Aceitar Entrega →
                </button>
              </div>
            ))}
          </>
        )}

        {/* ── Empty state ── */}
        {!isLinked && filteredAvailable.length === 0 && activeDeliveries.length === 0 && (
          <div style={{ textAlign: 'center', padding: '48px 24px', color: mb.sub }}>
            <div style={{ fontSize: 48, marginBottom: 12 }}>🛵</div>
            <div style={{ fontSize: 16, fontWeight: 600, color: mb.sub }}>Nenhum pedido disponível</div>
            <div style={{ fontSize: 12, marginTop: 6, opacity: 0.7 }}>Fique online para receber corridas</div>
          </div>
        )}
      </div>
    );
  }

  function formatTime(d) {
    if (!d) return '--:--';
    return new Date(d).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });
  }

  function calcDuration(start, end) {
    if (!start || !end) return '';
    const mins = Math.round((new Date(end) - new Date(start)) / 60000);
    if (mins < 60) return `${mins}min`;
    return `${Math.floor(mins/60)}h${mins%60}min`;
  }

  function groupByDate(orders) {
    const groups = {};
    for (const o of orders) {
      const dateKey = new Date(o.updated_at || o.created_at).toLocaleDateString('pt-BR');
      if (!groups[dateKey]) groups[dateKey] = [];
      groups[dateKey].push(o);
    }
    return groups;
  }

  function renderPedidos() {
    const completed = myOrders.filter(o => o.status === 'delivered');

    if (completed.length === 0) {
      return (
        <div className="empty-state" style={{ paddingTop: 40 }}>
          <div className="empty-state-icon">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <path d="M20 48V24l8-12h8l8 12v24" stroke="var(--border)" strokeWidth="2" strokeLinejoin="round"/>
              <circle cx="32" cy="36" r="4" stroke="var(--border)" strokeWidth="2"/>
            </svg>
          </div>
          <p>Nenhuma entrega concluída ainda</p>
        </div>
      );
    }

    return (
      <>
        {Object.entries(groupByDate(completed)).reverse().map(([date, orders]) => (
          <div key={date}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#999', margin: '12px 0 8px' }}>{date}</div>
            {orders.reverse().map(order => {
              const pickedTime = order.status === 'delivered' ? (order.updated_at) : null;
              const deliveredTime = order.status === 'delivered' ? order.updated_at : null;
              return (
                <div key={order.id} className="card" style={{ cursor: 'pointer' }}
                  onClick={() => openNav(order)}>
                  <div className="flex-between" style={{ marginBottom: 4 }}>
                    <span style={{ fontSize: 11, color: '#bbb', fontFamily: 'monospace', letterSpacing: 0.3, userSelect: 'all' }}>#{order.id.slice(0, 8)}</span>
                    <span className="badge badge-success">R$ {order.total.toFixed(2)}</span>
                  </div>
                  <div className="text-sm text-muted"><strong>{order.customer_name}</strong></div>
                  <div className="text-sm text-muted" style={{ marginBottom: 4 }}>{fmtAddr(order.customer_address)}</div>
                  <div className="flex-between text-xs" style={{ color: '#888' }}>
                    <span>🕐 Saiu: {formatTime(pickedTime)}</span>
                    <span>✅ Entregue: {formatTime(deliveredTime)}</span>
                    <span>⏱ {calcDuration(pickedTime, deliveredTime)}</span>
                  </div>
                </div>
              );
            })}
          </div>
        ))}

      </>
    );
  }

  const fsOrder = fullscreenOrder;

  function filterEarnings() {
    const list = earnings?.list || [];
    const now = new Date();
    let start;
    if (finPeriod === 'dia') {
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate());
    } else if (finPeriod === 'semana') {
      const day = now.getDay();
      start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - (day === 0 ? 6 : day - 1));
    } else if (finPeriod === 'mes') {
      start = new Date(now.getFullYear(), now.getMonth(), 1);
    } else {
      return list;
    }
    return list.filter(e => new Date(e.created_at) >= start);
  }

  function renderSaldo() {
    const filtered = filterEarnings();
    const periodTotal = filtered.reduce((s, e) => s + e.amount, 0);
    const periodPending = filtered.filter(e => e.status === 'pending').reduce((s, e) => s + e.amount, 0);

    return (
      <div>
        <div className="swipe-row" style={{ marginBottom: 12 }}>
          {['dia', 'semana', 'mes'].map(p => (
            <button key={p} className={`btn btn-sm ${finPeriod === p ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setFinPeriod(p)}>
              {p === 'dia' ? 'Hoje' : p === 'semana' ? 'Semana' : 'Mês'}
            </button>
          ))}
        </div>

        <div className="card" style={{
          background: `linear-gradient(135deg, ${mb.accentDark}, ${mb.accent})`,
          color: 'white', marginBottom: 16
        }}>
          <div style={{ fontSize: 13, opacity: 0.8, marginBottom: 4 }}>
            Ganhos {finPeriod === 'dia' ? 'de hoje' : finPeriod === 'semana' ? 'da semana' : 'do mês'}
          </div>
          <div style={{ fontSize: 42, fontWeight: 800, marginBottom: 4 }}>R$ {periodTotal.toFixed(2)}</div>
          {periodPending > 0 && (
            <div style={{ marginTop: 12, background: 'rgba(255,255,255,0.15)', borderRadius: 12, padding: '10px 16px', display: 'inline-block' }}>
              <span style={{ fontSize: 12, opacity: 0.8 }}>A receber: </span>
              <span style={{ fontWeight: 700 }}>R$ {periodPending.toFixed(2)}</span>
            </div>
          )}
        </div>

        {filtered.length > 0 ? (
          <div className="card" style={{ textAlign: 'left' }}>
            <div style={{ fontWeight: 700, fontSize: 14, marginBottom: 12, color: 'var(--primary)' }}>Histórico</div>
            {filtered.reverse().map((e, i) => (
              <div key={i} className="flex-between" style={{ padding: '8px 0', borderBottom: '1px solid #F5F5F5', fontSize: 13 }}>
                <div>
                  <span>R$ {e.amount.toFixed(2)}</span>
                  <span className="text-xs text-muted" style={{ marginLeft: 8 }}>
                    {new Date(e.created_at).toLocaleDateString('pt-BR')}
                  </span>
                </div>
                <span className={e.status === 'paid' ? 'badge badge-success' : 'badge badge-warning'}>
                  {e.status === 'paid' ? 'Pago' : 'Pendente'}
                </span>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state" style={{ paddingTop: 40 }}>
            <p>Nenhum ganho nesse período</p>
          </div>
        )}
      </div>
    );
  }

  function renderPerfil() {
    return (
      <div className="card" style={{ textAlign: 'left' }}>
        <div className="page-title" style={{ fontSize: 20 }}>Meu Perfil</div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
          <label style={{ cursor: 'pointer', position: 'relative' }}>
            {user?.photo_url ? (
              <img src={user.photo_url} alt="Foto" style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }}
                onError={e => { e.target.style.display = 'none'; }} />
            ) : (
              <div style={{ width: 56, height: 56, borderRadius: '50%', background: 'linear-gradient(135deg, #CE93D8, #6A1B9A)',
                display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 24 }}>
                {user?.name?.charAt(0)?.toUpperCase()}
              </div>
            )}
            <input type="file" accept="image/*" style={{ display: 'none' }}
              onChange={async (e) => {
                const file = e.target.files?.[0];
                if (!file) return;
                const formData = new FormData();
                formData.append('image', file);
                const res = await fetch('/api/products/upload-image', {
                  method: 'POST',
                  headers: { Authorization: 'Bearer ' + localStorage.getItem('token') },
                  body: formData
                });
                const data = await res.json();
                if (data.url) {
                  await apiFetch('/auth/profile', { method: 'PATCH', body: JSON.stringify({ photo_url: data.url }) });
                  window.location.reload();
                }
              }} />
            <div style={{ fontSize: 9, color: '#888', textAlign: 'center', marginTop: 2 }}>Alterar foto</div>
          </label>
          <div>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{user?.name}</div>
            <div style={{ fontSize: 12, color: '#888' }}>Entregador</div>
            {myRating && (
              <div style={{ fontSize: 13, color: '#F57F17', fontWeight: 700, marginTop: 2 }}>
                ⭐ {myRating.avg} <span style={{ fontSize: 11, fontWeight: 400, color: '#888' }}>({myRating.count} avaliações)</span>
              </div>
            )}
          </div>
        </div>
        <div className="form-group">
          <label className="label">Nome</label>
          <input className="input" type="text" value={editName || user?.name || ''}
            onChange={e => setEditName(e.target.value)} placeholder="Seu nome" />
        </div>
        <div className="form-group">
          <label className="label" style={{ textTransform: 'none' }}>E-mail (usado para trocar a senha quando esquecer)</label>
          <input className="input" type="email" value={editEmail || user?.email || ''}
            onChange={e => setEditEmail(e.target.value)} placeholder="seu@email.com" />
        </div>
        <div className="form-group"><label className="label">Telefone</label><div style={{ fontWeight: 600 }}>{user?.phone}</div></div>
        <div className="form-group">
          <label className="label">WhatsApp</label>
          <input className="input" type="tel" value={editWhatsapp}
            onChange={e => setEditWhatsapp(e.target.value.replace(/\D/g, '').slice(0, 11))}
            placeholder="(99) 99999-9999" />
        </div>
        <div className="form-group">
          <label className="label">CPF</label>
          <input className="input" type="text" value={editCpf}
            onChange={e => setEditCpf(maskCpf(e.target.value))} placeholder="000.000.000-00" maxLength={14} />
        </div>
        <div className="form-group">
          <label className="label">Placa da moto</label>
          <input className="input" type="text" value={editPlate}
            onChange={e => setEditPlate(e.target.value.toUpperCase().slice(0, 8))} placeholder="ABC-1234" />
        </div>
        <div className="form-group">
          <label className="label">Chave PIX</label>
          <input className="input" type="text" value={pixKey} onChange={e => setPixKey(e.target.value)}
            placeholder="CPF, telefone, e-mail ou chave aleatória" />
        </div>
        {pixMsg && <div style={{ fontSize: 13, fontWeight: 600, padding: '10px 14px', borderRadius: 8, marginBottom: 12,
          background: pixMsg.includes('Erro') ? '#FFEBEE' : '#E8F5E9', color: pixMsg.includes('Erro') ? '#C62828' : '#2E7D32' }}>{pixMsg}</div>}
        <button className="btn btn-primary" onClick={async () => {
          setPixSaving(true);
          try {
            localStorage.setItem('motoboy_pix_key', pixKey);
            const body = { pix_key: pixKey };
            if (editName) body.name = editName;
            if (editEmail) body.email = editEmail;
            if (editCpf.replace(/\D/g, '').length === 11) body.cpf = editCpf;
            if (editPlate) body.vehicle_type = editPlate;
            if (editWhatsapp) body.whatsapp = editWhatsapp;
            const res = await apiFetch('/motoboy/profile', { method: 'PATCH', body: JSON.stringify(body) });
            setPixMsg(res.ok ? 'Salvo com sucesso!' : (res.error || 'Erro ao salvar'));
            if (res.ok && editName) { user.name = editName; window.location.reload(); }
          } catch { localStorage.setItem('motoboy_pix_key', pixKey); setPixMsg('Salvo localmente!'); }
          setPixSaving(false);
          setTimeout(() => setPixMsg(''), 4000);
        }} disabled={pixSaving}>{pixSaving ? 'Salvando...' : 'Salvar'}</button>

        <div style={{ borderTop: '1px solid var(--border)', marginTop: 20, paddingTop: 16 }}>
          <div className="page-title" style={{ fontSize: 16, marginBottom: 12 }}>Alterar Senha</div>
          <div className="form-group">
            <label className="label">Senha atual</label>
            <input className="input" type="password" value={pwCurrent}
              onChange={e => setPwCurrent(e.target.value)} placeholder="Senha atual" />
          </div>
          <div className="form-group">
            <label className="label">Nova senha</label>
            <input className="input" type="password" value={pwNew}
              onChange={e => setPwNew(e.target.value)} placeholder="Nova senha (min 4 caracteres)" />
          </div>
          {pwMsg && <div style={{ fontSize: 13, fontWeight: 600, padding: '10px 14px', borderRadius: 8, marginBottom: 12,
            background: pwMsg.includes('sucesso') ? '#E8F5E9' : '#FFEBEE',
            color: pwMsg.includes('sucesso') ? '#2E7D32' : '#C62828' }}>{pwMsg}</div>}
          <button className="btn btn-outline" onClick={async () => {
            setPwSaving(true);
            const res = await apiFetch('/auth/password', {
              method: 'PATCH',
              body: JSON.stringify({ current_password: pwCurrent, new_password: pwNew })
            });
            setPwMsg(res.ok ? 'Senha alterada com sucesso!' : (res.error || 'Erro ao alterar senha'));
            if (res.ok) { setPwCurrent(''); setPwNew(''); }
            setPwSaving(false);
            setTimeout(() => setPwMsg(''), 4000);
          }} disabled={pwSaving}>{pwSaving ? 'Salvando...' : 'Alterar Senha'}</button>
        </div>

        {/* Sair */}
        <div style={{ borderTop: '1px solid var(--border)', marginTop: 24, paddingTop: 16 }}>
          <button className="btn btn-outline" onClick={logout}
            style={{ width: '100%', color: '#C62828', borderColor: '#FFCDD2', fontWeight: 600 }}>
            🚪 Sair da Conta
          </button>
        </div>
      </div>
    );
  }

  // ── Tema azul cobalto + dark/light ──────────────────────────────────────
  const toggleDark = () => setDarkMode(d => {
    localStorage.setItem('mb_dark', d ? '0' : '1');
    return !d;
  });
  const mb = {
    bg:          darkMode ? '#0c0f1a' : '#f0f4f8',
    card:        darkMode ? '#161b2e' : '#ffffff',
    cardBorder:  darkMode ? 'rgba(255,255,255,0.07)' : '#e4e8f0',
    text:        darkMode ? '#eef0f4' : '#1a1f2e',
    sub:         darkMode ? 'rgba(255,255,255,0.65)' : '#667',
    accent:      '#6A1B9A',
    accentDark:  '#4A148C',
    accentLight: darkMode ? 'rgba(106,27,154,0.18)' : '#f3e5f5',
    green:       '#1B8A3A',
    greenBg:     darkMode ? 'rgba(27,138,58,0.18)'  : '#e8f5e9',
    greenBorder: darkMode ? 'rgba(27,138,58,0.35)'  : '#a8d5b5',
    hdr:         darkMode ? '#0c0f1a' : '#ffffff',
    hdrBorder:   darkMode ? 'rgba(255,255,255,0.06)' : '#e0e4ee',
    nav:         darkMode ? '#0c0f1a' : '#ffffff',
    navBorder:   darkMode ? 'rgba(255,255,255,0.06)' : '#e0e4ee',
    tabActive:   '#6A1B9A',
  };

  // botão hero: mostra quando há entrega ativa com ação disponível e está na tab início
  const heroOrder = activeDeliveries[0];
  const heroAction = heroOrder ? nextStatus[heroOrder.status] : null;

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', minHeight: '100vh',
      background: mb.bg, color: mb.text,
      // Sobrescreve as CSS vars do tema para o escopo do motoboy
      '--primary':      mb.accent,
      '--primary-dark': mb.accentDark,
      '--primary-light':'#9C27B0',
      '--bg':           mb.bg,
      '--bg-card':      mb.card,
      '--text':         mb.text,
      '--text-light':   mb.sub,
      '--border':       mb.cardBorder,
    }}>
      {/* ── TOPBAR ──────────────────────────────────────────────── */}
      <div className="header" style={{ padding: '4px 16px', background: '#967BB6', borderBottom: '1px solid #7D5FA0' }}>
        <div className="header-left" style={{ gap: 10 }}>
          <img src="/logo_placa.png" alt="Pé de Açaí" style={{ width: 58, height: 58, objectFit: 'contain', flexShrink: 0, transform: 'rotate(15deg)' }} />
        </div>
        <div className="header-right" style={{ gap: 14 }}>
          {/* Dark/light toggle */}
          <button onClick={toggleDark}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20, lineHeight: 1, padding: 2, opacity: 0.8 }}>
            {darkMode ? '☀️' : '🌙'}
          </button>
          {/* Avatar (sem nome) */}
          <div style={{ cursor: 'pointer' }} onClick={() => setPageTab('perfil')}>
            {user?.photo_url ? (
              <img src={user.photo_url} alt="Foto"
                style={{ width: 36, height: 36, borderRadius: '50%', objectFit: 'cover', display: 'block' }}
                onError={e => { e.target.style.display = 'none'; }} />
            ) : (
              <div style={{ width: 36, height: 36, borderRadius: '50%', background: 'linear-gradient(135deg, #CE93D8, #6A1B9A)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 700, fontSize: 16 }}>
                {user?.name?.charAt(0)?.toUpperCase()}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ── CONTEÚDO ────────────────────────────────────────────── */}
      <div className="container" style={{ flex: 1, paddingBottom: pageTab === 'inicio' && heroAction ? 148 : 88 }}>
        {pageTab === 'inicio' && renderInicio()}
        {pageTab === 'pedidos' && renderPedidos()}
        {pageTab === 'saldo' && renderSaldo()}
        {pageTab === 'perfil' && renderPerfil()}
      </div>

      {/* ── BOTÃO HERO FIXO (Entregue ✓) ────────────────────────── */}
      {pageTab === 'inicio' && heroAction && (
        <div style={{ position: 'fixed', bottom: 78, left: 0, right: 0, padding: '0 16px', zIndex: 250 }}>
          <button onClick={() => updateStatus(heroOrder.id)}
            style={{
              width: '100%', height: 56,
              background: 'linear-gradient(135deg, #1B8A3A, #2E7D32)',
              color: 'white', border: 'none', borderRadius: 16,
              fontSize: 17, fontWeight: 800, cursor: 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              boxShadow: '0 4px 20px rgba(27,138,58,0.45)'
            }}>
            ✅ {nextStatusLabel[heroOrder.status]}
          </button>
        </div>
      )}

      {/* ── NAV BAR ─────────────────────────────────────────────── */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 300,
        background: mb.nav, borderTop: `1px solid ${mb.navBorder}`,
        flexDirection: 'column', paddingBottom: 'env(safe-area-inset-bottom, 4px)'
      }}>
        <div style={{ display: 'flex', padding: '6px 0' }}>
          {tabs.map(tab => (
            <button key={tab.key} onClick={() => setPageTab(tab.key)}
              style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2, padding: '6px 0', border: 'none', background: 'none', cursor: 'pointer', opacity: pageTab === tab.key ? 1 : (darkMode ? 0.65 : 0.45), transition: 'opacity 0.2s' }}>
              <span style={{ fontSize: 22 }}>{tab.icon}</span>
              <span style={{ fontSize: 11, fontWeight: pageTab === tab.key ? 700 : 500, color: pageTab === tab.key ? mb.tabActive : mb.sub }}>
                {tab.label}
              </span>
            </button>
          ))}
        </div>
        <div style={{ textAlign: 'center', fontSize: 9, color: mb.sub, fontFamily: 'monospace', letterSpacing: 0.5, paddingBottom: 2 }}>
          build #{APP_BUILD}
        </div>
      </div>

      {fsOrder && (
        <NavScreen order={fsOrder} onClose={closeNav}
          onStatusUpdate={async () => {
            // Só chega aqui para picked_up → delivered (motoboy confirma entrega)
            await updateStatus(fsOrder.id);
            closeNav();
          }}
          statusLabel={nextStatus[fsOrder.status] ? nextStatusLabel[fsOrder.status] : null} />
      )}

      {showPaymentModal && (
        <div style={{
          position: 'fixed', inset: 0, zIndex: 500,
          background: 'rgba(0,0,0,0.55)', display: 'flex', alignItems: 'flex-end'
        }} onClick={() => setShowPaymentModal(false)}>
          <div onClick={e => e.stopPropagation()} style={{
            background: 'white', borderRadius: '20px 20px 0 0',
            padding: '24px 20px 40px', width: '100%'
          }}>
            <div style={{ width: 40, height: 4, background: '#E0E0E0', borderRadius: 2, margin: '0 auto 20px' }} />
            <div style={{ fontSize: 18, fontWeight: 800, color: '#1a1a2e', marginBottom: 4 }}>Dados de pagamento</div>
            <div style={{ fontSize: 13, color: '#888', marginBottom: 20 }}>
              Necessário para ficar online e receber pagamentos.
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block' }}>CPF</label>
              <input
                type="text" value={modalCpf}
                onChange={e => {
                  const n = e.target.value.replace(/\D/g, '').slice(0, 11);
                  setModalCpf(n.replace(/^(\d{3})(\d{3})?(\d{3})?(\d{2})?$/, (_, a, b, c, d) =>
                    a + (b ? '.' + b : '') + (c ? '.' + c : '') + (d ? '-' + d : '')));
                }}
                placeholder="000.000.000-00"
                style={{ width: '100%', padding: '12px 14px', fontSize: 15, border: '2px solid #E8E0F0', borderRadius: 10, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block' }}>Tipo de veículo</label>
              <select value={modalVehicle} onChange={e => setModalVehicle(e.target.value)}
                style={{ width: '100%', padding: '12px 14px', fontSize: 15, border: '2px solid #E8E0F0', borderRadius: 10, outline: 'none', boxSizing: 'border-box', background: 'white' }}>
                <option value="moto">Moto</option>
                <option value="bike">Bicicleta</option>
              </select>
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block' }}>Chave Pix</label>
              <input
                type="text" value={modalPix} onChange={e => setModalPix(e.target.value)}
                placeholder="CPF, telefone ou e-mail"
                style={{ width: '100%', padding: '12px 14px', fontSize: 15, border: '2px solid #E8E0F0', borderRadius: 10, outline: 'none', boxSizing: 'border-box' }}
              />
            </div>

            <button
              disabled={modalSaving || !modalCpf || !modalPix}
              onClick={async () => {
                setModalSaving(true);
                const res = await apiFetch('/auth/profile', {
                  method: 'PATCH',
                  body: JSON.stringify({ cpf: modalCpf, vehicle_type: modalVehicle, pix_key: modalPix })
                });
                if (res.ok) {
                  user.cpf = modalCpf.replace(/\D/g, '');
                  user.pix_key = modalPix;
                  user.vehicle_type = modalVehicle;
                  setShowPaymentModal(false);
                  setOnline(true);
                  sendLocation();
                }
                setModalSaving(false);
              }}
              style={{
                width: '100%', padding: 14,
                background: 'linear-gradient(135deg, #2E7D32, #43A047)',
                color: 'white', border: 'none', borderRadius: 12,
                fontSize: 15, fontWeight: 700, cursor: modalSaving || !modalCpf || !modalPix ? 'default' : 'pointer',
                opacity: modalSaving || !modalCpf || !modalPix ? 0.6 : 1
              }}>
              {modalSaving ? 'Salvando...' : 'Salvar e ficar online'}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
