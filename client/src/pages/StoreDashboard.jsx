import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import { fmt } from '../utils/fmt';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import { APP_BUILD } from '../version';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import RoutePolyline from '../components/RouteMap';
import StoreMessages from '../components/StoreMessages';
import StoreAddressForm from '../components/StoreAddressForm';

function abbr(s) {
  if (!s) return s;
  return s.replace(/\bPassagem\b/gi, 'Pass.').replace(/\bTravessa\b/gi, 'Tv.').replace(/\bAvenida\b/gi, 'Av.').replace(/\bAlameda\b/gi, 'Al.').replace(/\bPraça\b/gi, 'Praç.').replace(/\bRodovia\b/gi, 'Rod.').replace(/\bEstrada\b/gi, 'Est.');
}

function shortAddress(full) {
  if (!full) return '';
  const parts = full.split(',').map(s => s.trim()).filter(Boolean);
  if (parts.length === 0) return '';
  // Detecta padrão de rodovia federal: "BR, 2629, Avenida X, Bairro, Cidade, Estado"
  // → reordena para "Av. X, 2629 - Bairro"
  if (
    parts.length >= 3 &&
    /^[A-Z]{2}(-\d+)?$/i.test(parts[0]) &&
    /^\d+$/.test(parts[1]) &&
    /^(Avenida|Rua|Travessa|Alameda|Passagem|Rodovia|Estrada|Praça)/i.test(parts[2])
  ) {
    const street = abbr(parts[2]);
    const hood = parts[3] || '';
    const isCity = /^(Belém|Manaus|São Paulo|Rio|Salvador|Fortaleza|Recife|Curitiba|Porto Alegre|Brasília|Goiânia|Pará|Amazonas|Bahia|Ceará|Minas|Paraná|Santa|Mato|Goiás|Piauí|Maranhão|Sergipe|Alagoas|Pernambuco|Paraíba|Tocantins|Rondônia|Roraima|Amapá|Acre)/i.test(hood);
    return `${street}, ${parts[1]}${hood && !isCity ? ` - ${hood}` : ''}`;
  }
  const street = parts[0];
  let num = '';
  let hood = '';
  let cursor = 1;
  if (parts[cursor] && /^\d+(\s*-?\s*\d+)?$/.test(parts[cursor].replace(/\s/g, ''))) { num = parts[cursor]; cursor++; }
  if (parts[cursor]) { hood = parts[cursor]; cursor++; }
  let result = abbr(street);
  if (num) result += `, ${num}`;
  if (hood) result += ` - ${abbr(hood)}`;
  return result;
}
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const statusLabels = {
  pending: 'Aguardando pgto', confirmed: 'Aguardando preparo', preparing: 'Preparando',
  ready: 'Aguardando Entregador', assigned: 'Entregador a caminho',
  picked_up: 'Saiu pra entrega', in_transit: 'Saiu pra entrega', arriving: 'Saiu pra entrega',
  delivered: 'Entregue', cancelled: 'Cancelado'
};

const statusColors = {
  pending: 'badge-warning', confirmed: 'badge-info', preparing: 'badge-info',
  ready: 'badge-primary', assigned: 'badge-primary', picked_up: 'badge-primary',
  in_transit: 'badge-primary', arriving: 'badge-primary',
  delivered: 'badge-success', cancelled: 'badge-danger'
};

const actionMap = {
  confirmed: { label: 'Preparar', next: 'preparing' },
  preparing: { label: 'Pronto!', next: 'ready' },
  // 'ready' só mostra o botão quando o motoboy já está atribuído (motoboy_id set)
  ready:     { label: 'Saiu da Loja', next: 'picked_up' },
  assigned:  { label: 'Saiu da Loja', next: 'picked_up' }
};

// Retorna a ação disponível para o pedido, respeitando a regra de 'ready'
function getAction(order) {
  const a = actionMap[order.status];
  if (!a) return null;
  if (order.status === 'ready' && !order.motoboy_id) return null;
  return a;
}

const DEMO_ORDERS = [
  { id: 'a1b2c3d4-e5f6-7890-aaaa-111122223333', customer_name: 'Ana Lima',      status: 'confirmed',  payment_status: 'paid', total: 32.00, delivery_fee: 5.00, customer_address: 'Av. Nazaré, 1200 - Nazaré, Belém',            created_at: new Date(Date.now() - 4  * 60000).toISOString(), order_items: [{ quantity: 1, unit_price: 27.00, products: { name: 'Açaí 1L' } }] },
  { id: 'b2c3d4e5-f6a7-8901-bbbb-222233334444', customer_name: 'Carlos Mendes', status: 'preparing',  payment_status: 'paid', total: 48.00, delivery_fee: 5.00, customer_address: 'Tv. Mauriti, 340 - Umarizal, Belém',          created_at: new Date(Date.now() - 11 * 60000).toISOString(), order_items: [{ quantity: 2, unit_price: 21.50, products: { name: 'Açaí 500ml' } }] },
  { id: 'c3d4e5f6-a7b8-9012-cccc-333344445555', customer_name: 'Fernanda Costa',status: 'ready',      payment_status: 'paid', total: 55.00, delivery_fee: 6.00, customer_address: 'Rua dos Mundurucus, 720 - Batista Campos',    created_at: new Date(Date.now() - 18 * 60000).toISOString(), motoboy_name: 'João Silva', order_items: [{ quantity: 1, unit_price: 49.00, products: { name: 'Açaí 2L' } }] },
  { id: 'd4e5f6a7-b8c9-0123-dddd-444455556666', customer_name: 'Rafael Souza',  status: 'picked_up', payment_status: 'paid', total: 39.00, delivery_fee: 5.00, customer_address: 'Passagem Marques, 18 - Marco, Belém',         created_at: new Date(Date.now() - 25 * 60000).toISOString(), motoboy_name: 'Pedro Nunes', order_items: [{ quantity: 1, unit_price: 34.00, products: { name: 'Açaí 1L Especial' } }] },
];

function d(day, hour = 12) { return new Date(2026, 5, day, hour, 0, 0).toISOString(); }
const DEMO_FIN_ORDERS = [
  { id: 'e1f2a3b4-c5d6-7890-1111-aabbccddeef0', customer_name: 'Mariana Dias',    status: 'delivered', payment_status: 'paid', total: 54.00, delivery_fee: 5.00, customer_address: 'Av. Nazaré, 780', created_at: d(1,11),  order_items: [{ quantity: 2, unit_price: 24.50, products: { name: 'Açaí 500ml' } }] },
  { id: 'f2a3b4c5-d6e7-8901-2222-bbccddeeff01', customer_name: 'Lucas Ferreira',  status: 'delivered', payment_status: 'paid', total: 38.00, delivery_fee: 5.00, customer_address: 'Rua Boaventura, 14', created_at: d(2,13), order_items: [{ quantity: 1, unit_price: 33.00, products: { name: 'Açaí 1L' } }] },
  { id: 'a3b4c5d6-e7f8-9012-3333-ccddeeff0102', customer_name: 'Camila Rocha',    status: 'delivered', payment_status: 'paid', total: 62.00, delivery_fee: 6.00, customer_address: 'Tv. Mauriti, 210',  created_at: d(3,12),  order_items: [{ quantity: 1, unit_price: 56.00, products: { name: 'Açaí 2L' } }] },
  { id: 'b4c5d6e7-f8a9-0123-4444-ddeeff010203', customer_name: 'João Neto',       status: 'delivered', payment_status: 'paid', total: 33.00, delivery_fee: 5.00, customer_address: 'Av. Almirante, 55', created_at: d(4,10),  order_items: [{ quantity: 1, unit_price: 28.00, products: { name: 'Açaí 1L' } }] },
  { id: 'c5d6e7f8-a9b0-1234-5555-eeff01020304', customer_name: 'Tatiane Alves',   status: 'delivered', payment_status: 'paid', total: 47.00, delivery_fee: 5.00, customer_address: 'Rua Padre Eutíquio, 88', created_at: d(5,14), order_items: [{ quantity: 2, unit_price: 21.00, products: { name: 'Açaí 500ml' } }] },
  { id: 'd6e7f8a9-b0c1-2345-6666-ff0102030405', customer_name: 'Paulo Carvalho',  status: 'delivered', payment_status: 'paid', total: 71.00, delivery_fee: 6.00, customer_address: 'Av. Visconde, 300', created_at: d(7,11),  order_items: [{ quantity: 1, unit_price: 65.00, products: { name: 'Açaí 3L' } }] },
  { id: 'e7f8a9b0-c1d2-3456-7777-010203040506', customer_name: 'Aline Gomes',     status: 'delivered', payment_status: 'paid', total: 42.00, delivery_fee: 5.00, customer_address: 'Tv. 14 de Março, 67', created_at: d(8,13), order_items: [{ quantity: 1, unit_price: 37.00, products: { name: 'Açaí 1L' } }] },
  { id: 'f8a9b0c1-d2e3-4567-8888-020304050607', customer_name: 'Bruno Monteiro',  status: 'delivered', payment_status: 'paid', total: 58.00, delivery_fee: 6.00, customer_address: 'Rua Municipalidade, 120', created_at: d(9,12), order_items: [{ quantity: 1, unit_price: 52.00, products: { name: 'Açaí 2L' } }] },
  { id: 'a9b0c1d2-e3f4-5678-9999-030405060708', customer_name: 'Larissa Pinto',   status: 'delivered', payment_status: 'paid', total: 36.00, delivery_fee: 5.00, customer_address: 'Av. Gentil Bittencourt, 45', created_at: d(10,10), order_items: [{ quantity: 1, unit_price: 31.00, products: { name: 'Açaí 1L' } }] },
  { id: 'b0c1d2e3-f4a5-6789-aaaa-040506070809', customer_name: 'Rodrigo Santos',  status: 'delivered', payment_status: 'paid', total: 49.00, delivery_fee: 5.00, customer_address: 'Rua Jerônimo Pimentel, 88', created_at: d(11,14), order_items: [{ quantity: 2, unit_price: 22.00, products: { name: 'Açaí 500ml' } }] },
  { id: 'c1d2e3f4-a5b6-7890-bbbb-05060708090a', customer_name: 'Vanessa Lima',    status: 'delivered', payment_status: 'paid', total: 65.00, delivery_fee: 6.00, customer_address: 'Av. Magalhães Barata, 200', created_at: d(12,11), order_items: [{ quantity: 1, unit_price: 59.00, products: { name: 'Açaí 2L' } }] },
  { id: 'd2e3f4a5-b6c7-8901-cccc-060708090a0b', customer_name: 'Felipe Araújo',   status: 'delivered', payment_status: 'paid', total: 44.00, delivery_fee: 5.00, customer_address: 'Rua dos Mundurucus, 512', created_at: d(14,13), order_items: [{ quantity: 1, unit_price: 39.00, products: { name: 'Açaí 1L' } }] },
  { id: 'e3f4a5b6-c7d8-9012-dddd-0708090a0b0c', customer_name: 'Natália Castro',  status: 'delivered', payment_status: 'paid', total: 53.00, delivery_fee: 5.00, customer_address: 'Av. Nazaré, 640', created_at: d(15,12), order_items: [{ quantity: 2, unit_price: 24.00, products: { name: 'Açaí 500ml' } }] },
  { id: 'f4a5b6c7-d8e9-0123-eeee-08090a0b0c0d', customer_name: 'Thiago Barbosa',  status: 'delivered', payment_status: 'paid', total: 76.00, delivery_fee: 6.00, customer_address: 'Rua Bernal do Couto, 33', created_at: d(16,10), order_items: [{ quantity: 1, unit_price: 70.00, products: { name: 'Açaí 3L' } }] },
  { id: 'a5b6c7d8-e9f0-1234-ffff-090a0b0c0d0e', customer_name: 'Priscila Moura',  status: 'delivered', payment_status: 'paid', total: 40.00, delivery_fee: 5.00, customer_address: 'Tv. 9 de Janeiro, 77', created_at: d(17,14), order_items: [{ quantity: 1, unit_price: 35.00, products: { name: 'Açaí 1L' } }] },
  { id: 'b6c7d8e9-f0a1-2345-1122-0a0b0c0d0e0f', customer_name: 'Eduardo Cunha',   status: 'delivered', payment_status: 'paid', total: 61.00, delivery_fee: 6.00, customer_address: 'Av. Brás de Aguiar, 180', created_at: d(18,11), order_items: [{ quantity: 1, unit_price: 55.00, products: { name: 'Açaí 2L' } }] },
  { id: 'c7d8e9f0-a1b2-3456-2233-0b0c0d0e0f10', customer_name: 'Débora Freitas',  status: 'delivered', payment_status: 'paid', total: 37.00, delivery_fee: 5.00, customer_address: 'Rua Siqueira Mendes, 22', created_at: d(19,13), order_items: [{ quantity: 1, unit_price: 32.00, products: { name: 'Açaí 1L' } }] },
  { id: 'd8e9f0a1-b2c3-4567-3344-0c0d0e0f1011', customer_name: 'Gabriel Costa',   status: 'delivered', payment_status: 'paid', total: 52.00, delivery_fee: 5.00, customer_address: 'Av. 16 de Novembro, 290', created_at: d(20,12), order_items: [{ quantity: 2, unit_price: 23.50, products: { name: 'Açaí 500ml' } }] },
  { id: 'e9f0a1b2-c3d4-5678-4455-0d0e0f101112', customer_name: 'Isabela Torres',  status: 'delivered', payment_status: 'paid', total: 68.00, delivery_fee: 6.00, customer_address: 'Rua Aristides Lobo, 55', created_at: d(21,10), order_items: [{ quantity: 1, unit_price: 62.00, products: { name: 'Açaí 2L' } }] },
  { id: 'f0a1b2c3-d4e5-6789-5566-0e0f10111213', customer_name: 'Marcos Vieira',   status: 'delivered', payment_status: 'paid', total: 45.00, delivery_fee: 5.00, customer_address: 'Tv. Mauriti, 410', created_at: d(22,11), order_items: [{ quantity: 1, unit_price: 40.00, products: { name: 'Açaí 1L' } }] },
];

export default function StoreDashboard() {
  const { user, store: storeData, apiFetch, logout, setStore } = useAuth();
  const { socket, joinStore, toast, setToast, notifications } = useSocket();
  const [orders, setOrders] = useState([]);
  const [demoActive, setDemoActive] = useState(false);
  const [open, setOpen] = useState(true);
  const [loading, setLoading] = useState(true);
  const [view, setView] = useState('painel');
  const [selectedOrder, setSelectedOrder] = useState(null);
  const [showMapForOrder, setShowMapForOrder] = useState(null);
  const [settings, setSettings] = useState({ name: '', logo: '', address: '', lat: '', lng: '', pix_key: localStorage.getItem('store_pix_key') || '', cpf_cnpj: localStorage.getItem('store_cpf_cnpj') || '' });
  const [saveMsg, setSaveMsg] = useState('');
  const [mapCenter, setMapCenter] = useState([-23.5505, -46.6333]);
  const [geocoding, setGeocoding] = useState(false);
  const [uploading, setUploading] = useState(false);
  const fileRef = useRef(null);
  const [logoSaving, setLogoSaving] = useState(false);
  const [orderFilter, setOrderFilter] = useState('ativos');
  const [motoboys, setMotoboys] = useState([]);
  const [motoboyPhone, setMotoboyPhone] = useState('');
  const [motoboyMsg, setMotoboyMsg] = useState('');
  const [invites, setInvites] = useState([]);
  const [inviteLink, setInviteLink] = useState('');
  const [products, setProducts] = useState([]);
  const [productForm, setProductForm] = useState(null);
  const [productImg, setProductImg] = useState(null);
  const [earnings, setEarnings] = useState({ store: { pending: 0, paid: 0 }, motoboy: { pending: 0, paid: 0 } });
  const [payoutMsg, setPayoutMsg] = useState('');
  const [pwCurrent, setPwCurrent] = useState('');
  const [pwNew, setPwNew] = useState('');
  const [pwMsg, setPwMsg] = useState('');
  const [pwSaving, setPwSaving] = useState(false);
  const [finMonth, setFinMonth] = useState(() => new Date().getMonth() + 1);
  const [finYear, setFinYear] = useState(() => new Date().getFullYear());
  const [finPeriod, setFinPeriod] = useState('mes');
  const [expandedOrder, setExpandedOrder] = useState(null);
  const [isDesktop, setIsDesktop] = useState(window.innerWidth >= 768);
  const [perfilTab, setPerfilTab] = useState(null);
  const [stockAlertMap, setStockAlertMap] = useState({});
  const [lowStockProducts, setLowStockProducts] = useState([]);
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showAddrSuggestions, setShowAddrSuggestions] = useState(false);
  const [searchingAddr, setSearchingAddr] = useState(false);
  const [showCep, setShowCep] = useState(false);
  const [cep, setCep] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const [savingAddr, setSavingAddr] = useState(false);
  const [storeMessages, setStoreMessages] = useState([]);
  const [showMotoboyInfo, setShowMotoboyInfo] = useState(false);
  const [unreadMessages, setUnreadMessages] = useState(0);
  const [showDesktopMenu, setShowDesktopMenu] = useState(false);
  const [notifOpen, setNotifOpen] = useState(false);
  const [notifList, setNotifList] = useState([]);
  const [notifLastSeen, setNotifLastSeen] = useState(() => localStorage.getItem('notif_last_seen') || null);
  const [showTV, setShowTV] = useState(false);
  const [tvLocked, setTvLocked] = useState(false);
  const [tvTime, setTvTime] = useState('');
  const [tvLight, setTvLight] = useState(false);
  const [tvLayout, setTvLayout] = useState('kanban'); // 'kanban' | 'fila' | 'linha'
  const [dashLayout, setDashLayout] = useState('kanban'); // 'kanban' | 'fila' | 'linha'
  const [tvShowPrices, setTvShowPrices] = useState(false);
  const [tvQrVisible, setTvQrVisible] = useState(true);
  const tvScrollRef  = useRef(null);
  const tvOverlayRef = useRef(null); // ref do container fixo do modo TV
  const storeIdRef = useRef(null); // ref para evitar stale closure no socket listener
  const [motoboyAlert, setMotoboyAlert] = useState(null); // { name, orderId, type, distanceMeters }
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const addrSearchRef = useRef(null);

  function playMotoboyAlarm() {
    try {
      const ctx = new (window.AudioContext || window.webkitAudioContext)();
      const beep = (freq, t, dur) => {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        osc.connect(gain); gain.connect(ctx.destination);
        osc.frequency.value = freq; osc.type = 'sine';
        gain.gain.setValueAtTime(0.35, ctx.currentTime + t);
        gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + t + dur);
        osc.start(ctx.currentTime + t); osc.stop(ctx.currentTime + t + dur + 0.05);
      };
      beep(880, 0, 0.12); beep(1100, 0.15, 0.12); beep(1320, 0.30, 0.2); beep(1100, 0.52, 0.12); beep(1320, 0.67, 0.3);
    } catch (e) {}
  }

  useEffect(() => {
    const onResize = () => setIsDesktop(window.innerWidth >= 768);
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);

  useEffect(() => {
    loadOrders();
    if (storeData) {
      joinStore(storeData.id);
      setOpen(!!storeData.open);
    }
    const pollTimer = setInterval(loadOrders, 30000); // fallback: socket cobre em real-time, 30s de segurança
    return () => clearInterval(pollTimer);
  }, [storeData]);

  useEffect(() => {
    if (storeData) {
      setSettings({
        name: storeData.name || '',
        logo: storeData.logo || '',
        address: storeData.address || '',
        lat: String(storeData.lat),
        lng: String(storeData.lng),
        pix_key: storeData.pix_key || localStorage.getItem('store_pix_key') || '',
        cpf_cnpj: storeData.cpf_cnpj || localStorage.getItem('store_cpf_cnpj') || ''
      });
      setMapCenter([storeData.lat, storeData.lng]);
    }
    // Mantém ref sempre atualizada para o socket listener não ter stale closure
    storeIdRef.current = storeData?.id ?? null;
  }, [storeData]);

  useEffect(() => {
    if (!socket) return;
    // Ao reconectar: recarrega dados e re-entra na sala da loja (servidor perde membros no drop)
    socket.on('connect', () => {
      loadOrders();
      if (storeIdRef.current) joinStore(storeIdRef.current);
    });
    socket.on('new_order', () => loadOrders());
    socket.on('order_paid', () => { loadOrders(); setToast('Pagamento confirmado! Prepare o açaí!'); });
    socket.on('order_status', (data) => {
      loadOrders();
      if (data?.status === 'assigned') {
        playMotoboyAlarm();
        setMotoboyAlert({ orderId: data.orderId, name: data.motoboyName || 'Entregador', type: 'accepted' });
        setTimeout(() => setMotoboyAlert(null), 8000);
      }
    });
    socket.on('motoboy_approaching_store', (data) => {
      playMotoboyAlarm();
      setMotoboyAlert({ orderId: data.orderId, name: data.motoboyName || 'Entregador', type: 'approaching', distanceMeters: data.distanceMeters });
      setTimeout(() => setMotoboyAlert(null), 12000);
    });
    socket.on('notification', (notif) => {
      if (notif.type === 'message') loadMessages();
      loadNotifs();
      const icons = { order: '🛒', delivery: '📦', payment: '💰', message: '💬' };
      setToast(`${icons[notif.type] || '🔔'} ${notif.body}`);
      setTimeout(() => setToast(null), 4000);
    });
    if (storeData) joinStore(storeData.id);
    return () => {
      socket.off('connect');
      socket.off('new_order');
      socket.off('order_paid');
      socket.off('order_status');
      socket.off('notification');
      socket.off('motoboy_approaching_store');
    };
  }, [socket]);

  useEffect(() => {
    if (view === 'produtos') loadProducts();
    if (view === 'perfil' && perfilTab === 'motoboy') loadMotoboys();
    if (view === 'perfil' && perfilTab === 'mensagens') loadMessages();
  }, [view, perfilTab, storeData]);

  useEffect(() => {
    if (storeData) {
      storeIdRef.current = storeData.id;
      loadMessages();
      loadNotifs();
    }
  }, [storeData]);

  // Polling de mensagens a cada 30s — garante que novas mensagens aparecem
  // mesmo se o socket falhar ou a notificação for perdida
  useEffect(() => {
    const interval = setInterval(() => {
      if (storeIdRef.current) loadMessages();
    }, 30000);
    return () => clearInterval(interval);
  }, []);

  // Recarrega mensagens quando chega qualquer notificação via socket.
  // Usar notifications[] como dep garante que loadMessages() usada aqui é
  // sempre a versão mais recente (sem stale closure), pois o effect re-executa
  // a cada nova notificação no array.
  useEffect(() => {
    if (notifications.length === 0) return;
    const last = notifications[0];
    if (last?.type === 'message') loadMessages();
  }, [notifications]);

  useEffect(() => {
    const low = products.filter(p => p.active && p.stock_quantity != null && p.min_stock_alert != null && p.stock_quantity <= p.min_stock_alert);
    setLowStockProducts(low);
  }, [products]);

  async function loadOrders() {
    const data = await apiFetch('/orders');
    if (data.data) setOrders(data.data);
    setLoading(false);
  }

  async function loadNotifs() {
    const data = await apiFetch('/notifications');
    if (data?.data) setNotifList(data.data);
  }

  async function loadMessages() {
    // Usa ref para evitar stale closure: mesmo a versão capturada pelo socket
    // listener lê o valor atual do storeId (refs são mutáveis e persistem entre renders)
    const sid = storeIdRef.current ?? storeData?.id;
    if (!sid) return;
    const data = await apiFetch(`/messages/${sid}`);
    if (data.data) {
      setStoreMessages(data.data);
      setUnreadMessages(data.data.filter(m => !m.read && !m.from_store).length);
    }
  }

  async function updateStatus(orderId, status) {
    await apiFetch(`/orders/${orderId}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status })
    });
    loadOrders();
  }

  async function toggleOpen() {
    if (!storeData) return;
    const data = await apiFetch(`/stores/${storeData.id}/toggle-open`, { method: 'PATCH' });
    if (data.ok || data.open !== undefined) setOpen(data.open);
  }

  async function uploadLogo() {
    const file = fileRef.current?.files?.[0];
    if (!file || !storeData) return;
    setLogoSaving(true);
    const formData = new FormData();
    formData.append('logo', file);
    try {
      const res = await fetch(`/api/stores/${storeData.id}/logo`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      const data = await res.json();
      if (data.logo) {
        setSettings(s => ({ ...s, logo: data.logo }));
        setStore(prev => prev ? { ...prev, logo: data.logo } : prev);
        setSaveMsg('Logo atualizado!');
        setTimeout(() => setSaveMsg(''), 2000);
      }
    } catch {
      setSaveMsg('Erro ao enviar logo.');
      setTimeout(() => setSaveMsg(''), 3000);
    } finally {
      setLogoSaving(false);
    }
  }

  async function saveSettings() {
    if (!storeData) return;
    if (!settings.pix_key.trim()) {
      setSaveMsg('⚠️ Cadastre sua chave PIX para receber pagamentos.');
      return;
    }
    setSaveMsg('');
    setUploading(true);

    const data = await apiFetch(`/stores/${storeData.id}/settings`, {
      method: 'PUT',
      body: JSON.stringify({
        name: settings.name,
        logo: settings.logo,
        address: settings.address,
        lat: parseFloat(settings.lat),
        lng: parseFloat(settings.lng),
        pix_key: settings.pix_key,
        cpf_cnpj: settings.cpf_cnpj
      })
    });
    if (!data.error) {
      localStorage.setItem('store_pix_key', settings.pix_key);
      localStorage.setItem('store_cpf_cnpj', settings.cpf_cnpj);
      if (data.id) setStore({ ...data, cpf_cnpj: settings.cpf_cnpj });
      setSaveMsg('Configurações salvas!');
      setTimeout(() => setSaveMsg(''), 3000);
    }
    setUploading(false);
  }

  async function geocodeAddress() {
    if (!settings.address) return;
    setGeocoding(true);
    try {
      const res = await fetch(
        `https://nominatim.openstreetmap.org/search?format=json&q=${encodeURIComponent(settings.address)}&limit=1&countrycodes=BR`
      );
      const data = await res.json();
      if (data.length > 0) {
        const lat = parseFloat(data[0].lat);
        const lng = parseFloat(data[0].lon);
        setSettings(s => ({ ...s, lat: String(lat), lng: String(lng) }));
        setMapCenter([lat, lng]);
      } else {
        setSaveMsg('Endereço não encontrado. Tente um endereço mais específico.');
        setTimeout(() => setSaveMsg(''), 4000);
      }
    } catch {
        setSaveMsg('Erro ao buscar endereço.');
      setTimeout(() => setSaveMsg(''), 4000);
    } finally {
      setGeocoding(false);
    }
  }

  async function loadMotoboys() {
    if (!storeData) return;
    const [motoboysData, invitesData] = await Promise.all([
      apiFetch(`/stores/${storeData.id}/motoboys`),
      apiFetch(`/stores/${storeData.id}/invites`)
    ]);
    if (motoboysData.data) setMotoboys(motoboysData.data);
    if (invitesData.data) setInvites(invitesData.data);
  }

  async function generateInvite() {
    if (!motoboyPhone.trim() || !storeData) return;
    setMotoboyMsg('');
    setInviteLink('');
    const data = await apiFetch(`/stores/${storeData.id}/invite`, {
      method: 'POST',
      body: JSON.stringify({ phone: motoboyPhone.trim() })
    });
    if (data.error) {
      setMotoboyMsg(data.error);
      setTimeout(() => setMotoboyMsg(''), 4000);
    } else if (data.direct) {
      setMotoboyPhone('');
      setMotoboyMsg(`Entregador ${data.name} vinculado diretamente como parceiro!`);
      setTimeout(() => setMotoboyMsg(''), 3000);
      loadMotoboys();
    } else if (data.inviteLink) {
      setInviteLink(data.inviteLink);
      setMotoboyMsg('Convite gerado! Compartilhe o link com o entregador.');
      setTimeout(() => setMotoboyMsg(''), 6000);
      loadMotoboys();
    }
  }

  async function copyInviteLinkToken(token) {
    const link = `${window.location.origin}/register?token=${token}`;
    try {
      await navigator.clipboard.writeText(link);
      setMotoboyMsg('Link copiado!');
      setTimeout(() => setMotoboyMsg(''), 2000);
    } catch {
      setMotoboyMsg('Erro ao copiar.');
      setTimeout(() => setMotoboyMsg(''), 2000);
    }
  }

  async function revokeInvite(inviteId) {
    if (!storeData || !confirm('Cancelar este convite?')) return;
    await apiFetch(`/stores/${storeData.id}/invite/${inviteId}`, { method: 'DELETE' });
    loadMotoboys();
  }

  async function toggleEmployee(motoboyId, current) {
    if (!storeData) return;
    await apiFetch(`/stores/${storeData.id}/motoboy/${motoboyId}`, {
      method: 'PATCH',
      body: JSON.stringify({ employee: current ? 0 : 1 })
    });
    loadMotoboys();
  }

  async function removeMotoboy(motoboyId) {
    if (!storeData || !confirm('Remover este entregador da loja?')) return;
    await apiFetch(`/stores/${storeData.id}/motoboy/${motoboyId}`, { method: 'DELETE' });
    loadMotoboys();
  }

  async function loadProducts() {
    if (!storeData) return;
    const data = await apiFetch(`/products?store_id=${storeData.id}`);
    if (data.data) setProducts(data.data);
  }

  function openNewProduct() {
    setProductForm({ name: '', description: '', price: '', size_ml: '500', stock_quantity: '', min_stock_alert: '' });
    setProductImg(null);
  }

  const productImgRef = useRef(null);

  async function saveProduct() {
    if (!storeData || !productForm) return;
    const { name, description, price, size_ml, id, stock_quantity, min_stock_alert } = productForm;
    if (!name || !price || !size_ml) return;

    let imageUrl = productForm.image || '';
    const file = productImgRef.current?.files?.[0];
    if (file) {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/products/upload-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      const data = await res.json();
      if (data.url) imageUrl = data.url;
    }

    const body = {
      name, description, price: parseFloat(price), size_ml: parseInt(size_ml),
      stock_quantity: stock_quantity !== '' ? parseInt(stock_quantity) : null,
      min_stock_alert: min_stock_alert !== '' ? parseInt(min_stock_alert) : null
    };
    if (imageUrl) body.image = imageUrl;

    if (id) {
      await apiFetch(`/products/${id}`, {
        method: 'PUT',
        body: JSON.stringify(body)
      });
    } else {
      await apiFetch('/products', {
        method: 'POST',
        body: JSON.stringify(body)
      });
    }
    setProductForm(null);
    setProductImg(null);
    loadProducts();
  }

  async function toggleProduct(id, active) {
    await apiFetch(`/products/${id}`, {
      method: 'PUT',
      body: JSON.stringify({ active: active ? 0 : 1 })
    });
    loadProducts();
  }

  async function deleteProduct(id) {
    if (!confirm('Excluir este produto permanentemente?')) return;
    await apiFetch(`/products/${id}`, { method: 'DELETE' });
    loadProducts();
  }

  function editProduct(p) {
    setProductForm({
      id: p.id, name: p.name, description: p.description || '',
      price: String(p.price), size_ml: String(p.size_ml),
      stock_quantity: p.stock_quantity != null ? String(p.stock_quantity) : '',
      min_stock_alert: p.min_stock_alert != null ? String(p.min_stock_alert) : ''
    });
  }

  function MapClickHandler() {
    useMapEvents({
      click(e) {
        const { lat, lng } = e.latlng;
        setSettings(s => ({ ...s, lat: String(lat.toFixed(6)), lng: String(lng.toFixed(6)) }));
      }
    });
    return null;
  }

  useEffect(() => {
    if (view === 'financeiro') loadEarnings();
  }, [view]);

  useEffect(() => {
    function handleClick(e) {
      if (showDesktopMenu) setShowDesktopMenu(false);
    }
    if (isDesktop && showDesktopMenu) {
      document.addEventListener('click', handleClick);
      return () => document.removeEventListener('click', handleClick);
    }
  }, [isDesktop, showDesktopMenu]);

  useEffect(() => {
    if (!showTV) return;
    const upd = () => setTvTime(new Date().toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' }));
    upd();
    const t = setInterval(upd, 1000);
    return () => clearInterval(t);
  }, [showTV]);

  useEffect(() => {
    if (!showTV) return;
    const onKey = (e) => { if (e.key === 'Escape' && !tvLocked) setShowTV(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [showTV, tvLocked]);

  // Auto-scroll TV: desce devagar, pausa no fim e volta ao topo
  useEffect(() => {
    if (!showTV) return;
    const el = tvScrollRef.current;
    if (!el) return;
    let paused = false;
    let timers = [];
    const tick = () => {
      if (paused) return;
      if (el.scrollHeight <= el.clientHeight + 5) return; // cabe tudo, não precisa
      if (el.scrollTop + el.clientHeight >= el.scrollHeight - 8) {
        paused = true;
        const t1 = setTimeout(() => {
          el.scrollTo({ top: 0, behavior: 'smooth' });
          const t2 = setTimeout(() => { paused = false; }, 1800);
          timers.push(t2);
        }, 3500); // aguarda 3,5s no fim antes de voltar ao topo
        timers.push(t1);
      } else {
        el.scrollTop += 1;
      }
    };
    const iv = setInterval(tick, 30); // ~33px/s
    return () => { clearInterval(iv); timers.forEach(clearTimeout); };
  }, [showTV, tvLayout]);

  // Mostra QR apenas quando o canto inferior direito está livre.
  // Usa elementsFromPoint no pixel central do QR — se houver um elemento
  // filho do scroll container nessa posição, há um card lá → esconde QR.
  useEffect(() => {
    if (!showTV) return;
    const check = () => {
      const overlay   = tvOverlayRef.current;
      const scrollEl  = tvScrollRef.current;
      if (!overlay || !scrollEl) { setTvQrVisible(true); return; }

      const rect = overlay.getBoundingClientRect();
      // Centro do bloco QR: bottom 24 + 90/2 = 69px do baixo; right 28 + 90/2 = 73px da direita
      const x = rect.right  - 73;
      const y = rect.bottom - 69;

      const els = document.elementsFromPoint(x, y) || [];
      // Tem conteúdo apenas se houver um card real ([data-tv-card]) nesse ponto
      // Wrapper divs/trs sem o atributo não contam como bloqueadores
      const hasCard = els.some(el => el.closest?.('[data-tv-card]'));
      setTvQrVisible(!hasCard);
    };

    // 200ms: aguarda React commit + browser layout dos novos cards
    const t = setTimeout(check, 200);
    return () => clearTimeout(t);
  }, [showTV, tvLayout, orders]);

  // WakeLock: impede a tela de dormir no modo TV
  useEffect(() => {
    if (!showTV) return;
    let lock = null;
    const acquire = async () => {
      try {
        if ('wakeLock' in navigator) lock = await navigator.wakeLock.request('screen');
      } catch {}
    };
    acquire();
    const onVis = () => { if (document.visibilityState === 'visible') acquire(); };
    document.addEventListener('visibilitychange', onVis);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      if (lock) lock.release().catch(() => {});
    };
  }, [showTV]);

  if (loading) return (
    <div className="loading">
      <img className="spin" src="/saco_acai.png" />
    </div>
  );

  async function loadEarnings() {
    const data = await apiFetch('/earnings');
    if (data.store) setEarnings(data);
  }

  async function doPayout() {
    setPayoutMsg('');
    const data = await apiFetch('/payout', { method: 'POST', body: JSON.stringify({ type: 'store' }) });
    if (data.ok) {
      setPayoutMsg(data.message);
      loadEarnings();
    } else {
      setPayoutMsg(data.error || 'Erro');
    }
    setTimeout(() => setPayoutMsg(''), 4000);
  }

  const activeOrders = demoActive ? [...DEMO_ORDERS, ...DEMO_FIN_ORDERS] : orders;
  const unpaidOrders = activeOrders.filter(o => o.payment_status !== 'paid');
  const pendingOrders = activeOrders.filter(o => o.payment_status === 'paid' && !['delivered','cancelled'].includes(o.status));
  const paidOrders = activeOrders.filter(o => o.payment_status === 'paid');

  const now = Date.now();
  const staleUnpaid = unpaidOrders.filter(o => {
    const created = new Date(o.created_at).getTime();
    return (now - created) > 2 * 60 * 60 * 1000;
  });

  const concludedOrders = activeOrders.filter(o => ['delivered', 'cancelled'].includes(o.status));
  const displayOrders = orderFilter === 'pendentes' ? unpaidOrders.filter(o => (now - new Date(o.created_at).getTime()) <= 2*60*60*1000)
    : orderFilter === 'ativos' ? pendingOrders
    : orderFilter === 'concluidos' ? concludedOrders
    : activeOrders.filter(o => (Date.now() - new Date(o.created_at).getTime()) <= 24*60*60*1000);

  const pedidosPendentes = unpaidOrders.filter(o => (now - new Date(o.created_at).getTime()) <= 2*60*60*1000).length;

  function FinanceiroTab() {
    const now = new Date();
    const finOrders = demoActive ? activeOrders : orders;
    const filteredOrders = finOrders.filter(o => {
      if (o.payment_status !== 'paid') return false;
      const d = new Date(o.created_at);
      if (finPeriod === 'hoje') return d.toDateString() === now.toDateString();
      if (finPeriod === 'semana') {
        const weekAgo = new Date(now); weekAgo.setDate(now.getDate() - 7);
        return d >= weekAgo;
      }
      return d.getMonth() + 1 === finMonth && d.getFullYear() === finYear;
    });
    const finTotal = filteredOrders.reduce((s, o) => s + o.total, 0);
    const months = ['Janeiro','Fevereiro','Março','Abril','Maio','Junho','Julho','Agosto','Setembro','Outubro','Novembro','Dezembro'];
    const years = [];
    for (let y = 2025; y <= now.getFullYear(); y++) years.push(y);

    return (
      <div>
        <div className="page-title" style={{ fontSize: 20 }}>Financeiro</div>
        {!storeData?.pix_key && (
          <div style={{ background: '#FFF3E0', border: '1px solid #FFB300', borderRadius: 10, padding: '12px 14px', marginBottom: 14, display: 'flex', alignItems: 'flex-start', gap: 10 }}>
            <span style={{ fontSize: 20 }}>⚠️</span>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#E65100' }}>Chave PIX não cadastrada</div>
              <div style={{ fontSize: 12, color: '#BF360C', marginTop: 2 }}>Você não está recebendo os pagamentos. Acesse <b>Perfil → Configurações</b> e cadastre sua chave PIX.</div>
            </div>
          </div>
        )}
        <div className="flex-row" style={{ marginBottom: 12, gap: 8 }}>
          <select className="input" value={finPeriod} onChange={e => setFinPeriod(e.target.value)}
            style={{ width: 'auto', flexShrink: 0, fontSize: 13, padding: '8px 12px' }}>
            <option value="hoje">Hoje</option>
            <option value="semana">Semana</option>
            <option value="mes">Mês</option>
          </select>
          {finPeriod === 'mes' && (
            <>
              <select className="input" value={finMonth} onChange={e => setFinMonth(parseInt(e.target.value))}
                style={{ width: 'auto', flexShrink: 0, fontSize: 13, padding: '8px 12px' }}>
                {months.map((m, i) => <option key={i} value={i+1}>{m}</option>)}
              </select>
              <select className="input" value={finYear} onChange={e => setFinYear(parseInt(e.target.value))}
                style={{ width: 90, flexShrink: 0, fontSize: 13, padding: '8px 12px' }}>
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </>
          )}
        </div>
        <div style={{ display: 'flex', gap: 12, marginBottom: 16 }}>
          <div className="card text-center" style={{ flex: 1, background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)', padding: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--secondary)' }}>
              R$ {fmt(finTotal)}
            </div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#2E7D32' }}>Total em {months[finMonth-1]}</div>
          </div>
          <div className="card text-center" style={{ flex: 1, background: 'linear-gradient(135deg, #F3E5F5, #E1BEE7)', padding: 16 }}>
            <div style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>{filteredOrders.length}</div>
            <div style={{ fontSize: 11, fontWeight: 600, color: '#6A1B9A' }}>Pedidos pagos</div>
          </div>
        </div>

        {earnings.store.pending > 0 && (
          <div className="card" style={{ background: '#FFF8E1', border: '1px solid #FFE082', marginBottom: 16 }}>
            <div className="flex-between">
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#E65100' }}>💵 A receber via PIX</div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#BF360C' }}>R$ {fmt(earnings.store.pending)}</div>
              </div>
              <button className="btn btn-sm btn-accent" onClick={doPayout} style={{ width: 'auto' }}>
                Sacar
              </button>
            </div>
          </div>
        )}

        {filteredOrders.length === 0 ? (
          <div className="empty-state"><p>Nenhum pedido pago em {months[finMonth-1]}</p></div>
        ) : (
          filteredOrders.map(order => (
            <div key={order.id} className="card" style={{ padding: 14, marginBottom: 8, cursor: 'pointer' }}
              onClick={() => setExpandedOrder(expandedOrder === order.id ? null : order.id)}>
              <div className="flex-between" style={{ marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 13 }}>#{order.id.slice(-6)}</span>
                <span style={{ fontSize: 12, color: '#888' }}>{new Date(order.created_at).toLocaleDateString('pt-BR')}</span>
              </div>
              <div className="flex-between" style={{ marginBottom: 4 }}>
                <span style={{ fontSize: 12 }}>{order.customer_name}</span>
                <span className="badge badge-success">Pago</span>
              </div>
              <div className="flex-between" style={{ fontSize: 14 }}>
                <span className={`badge ${statusColors[order.status] || 'badge-primary'}`}>
                  {statusLabels[order.status] || order.status}
                </span>
                <span style={{ fontWeight: 800, color: 'var(--primary)' }}>R$ {fmt(order.total)}</span>
              </div>
              {expandedOrder === order.id && (
                <div style={{ marginTop: 12, padding: 12, background: '#F8F4FC', borderRadius: 8, border: '1px solid var(--border)' }}>
                  <div style={{ fontSize: 12, fontWeight: 700, marginBottom: 6 }}>Detalhes do pedido</div>
                  <div className="text-sm text-muted" style={{ marginBottom: 4 }}>
                    📍 {shortAddress(order.customer_address) || 'Endereço'}
                  </div>
                  <div className="text-sm text-muted" style={{ marginBottom: 4 }}>
                    📞 {order.customer_phone || '—'}
                  </div>
                  {order.notes && (
                    <div className="text-sm text-muted" style={{ marginBottom: 4 }}>
                      📝 {order.notes}
                    </div>
                  )}
                  {order.delivery_fee > 0 && (
                    <div className="text-sm text-muted" style={{ marginBottom: 4 }}>
                      🏍️ Taxa entrega: R$ {fmt(order.delivery_fee)}
                    </div>
                  )}
                  {order.motoboy_name && (
                    <div className="text-sm text-muted" style={{ marginBottom: 4 }}>
                      👤 Entregador: {order.motoboy_name}
                    </div>
                  )}
                  <div style={{ fontSize: 13, fontWeight: 600, marginTop: 8, color: 'var(--primary)' }}>
                    Total: R$ {fmt(order.total)}
                  </div>
                </div>
              )}
            </div>
          ))
        )}
      </div>
    );
  }

  function PedidosView() {
    return (
      <>
        <div style={{ display: 'flex', gap: 8, marginBottom: 16 }}>
          <div className="card text-center" style={{ flex: 1, padding: '12px 6px', background: 'linear-gradient(135deg, #FFF3E0, #FFE0B2)', cursor: 'pointer' }}
            onClick={() => setOrderFilter(orderFilter === 'pendentes' ? 'todos' : 'pendentes')}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#E65100' }}>{pedidosPendentes}</div>
            <div className="text-sm font-bold">{orderFilter === 'pendentes' ? '▼ Pendentes' : 'Pendentes'}</div>
          </div>
          <div className="card text-center" style={{ flex: 1, padding: '12px 6px', background: 'linear-gradient(135deg, #F3E5F5, #E1BEE7)', cursor: 'pointer' }}
            onClick={() => setOrderFilter(orderFilter === 'ativos' ? 'todos' : 'ativos')}>
            <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>{pendingOrders.length}</div>
            <div className="text-sm font-bold">{orderFilter === 'ativos' ? '▼ Ativos' : 'Ativos'}</div>
          </div>
          <div className="card text-center" style={{ flex: 1, padding: '12px 6px', background: 'linear-gradient(135deg, #E8F5E9, #C8E6C9)', cursor: 'pointer' }}
            onClick={() => setOrderFilter(orderFilter === 'concluidos' ? 'todos' : 'concluidos')}>
            <div style={{ fontSize: 28, fontWeight: 800, color: '#2E7D32' }}>{concludedOrders.length}</div>
            <div className="text-sm font-bold">{orderFilter === 'concluidos' ? '▼ Concluídos' : 'Concluídos'}</div>
          </div>
        </div>

        {displayOrders.length === 0 ? (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <rect x="20" y="16" width="24" height="32" rx="3" stroke="var(--border)" strokeWidth="2"/>
                <path d="M28 28h8M28 34h8" stroke="var(--border)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <p>Nenhum pedido ainda</p>
          </div>
        ) : (
          <div style={isDesktop ? { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 } : {}}>
          {displayOrders.map(order => {
            const hasAction = order.payment_status === 'paid' && getAction(order);
            const showMap = showMapForOrder === order.id;
            return (
              <div key={order.id} className="card" style={{ cursor: 'pointer' }}
                onClick={() => setShowMapForOrder(showMap ? null : order.id)}>
                <div className="flex-between" style={{ marginBottom: 10 }}>
                  <div>
                    <span className="font-bold" style={{ fontSize: 15 }}>{order.customer_name}</span>
                    {order.payment_status !== 'paid' && (
                      <span className="badge badge-warning" style={{ marginLeft: 8, fontSize: 11 }}>Pendente</span>
                    )}
                    <span style={{ fontSize: 10, color: '#bbb', marginLeft: 8, fontFamily: 'monospace', letterSpacing: 0.3, userSelect: 'all' }}>#{order.id.slice(-6)}</span>
                  </div>
                  {hasAction ? (
                    <button className="btn btn-sm btn-primary"
                      onClick={(e) => { e.stopPropagation(); updateStatus(order.id, getAction(order).next); }}>
                      {getAction(order).label}
                    </button>
                  ) : (
                    <span className={`badge ${statusColors[order.status] || 'badge-warning'}`} style={{ fontSize: 11 }}>
                      {statusLabels[order.status]}
                    </span>
                  )}
                </div>

                <div style={{ fontWeight: 700, fontSize: 14, color: '#333', marginBottom: 8 }}>Detalhes do Pedido</div>

                <div style={{ fontSize: 13, marginBottom: 4 }}>
                  {(order.order_items || []).map((item, idx) => (
                    <div key={idx} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 2 }}>
                      <span>{item.quantity}x {item.products?.name || 'Produto'}</span>
                      <span>R$ {fmt(item.unit_price * item.quantity)}</span>
                    </div>
                  ))}
                </div>

                {order.motoboy_name && (
                  <div className="flex-between" style={{ fontSize: 13, marginBottom: 2 }}>
                    <span>Entregador: {order.motoboy_name}</span>
                    {order.delivery_fee > 0 && <span>R$ {fmt(order.delivery_fee)}</span>}
                  </div>
                )}

                <div className="flex-between" style={{ fontSize: 14, fontWeight: 700, color: 'var(--primary)', marginTop: 4, marginBottom: 8 }}>
                  <span>Total</span>
                  <span>R$ {fmt(order.total)}</span>
                </div>

                <div style={{ fontSize: 12, color: '#888', marginBottom: showMap ? 8 : 0 }}>
                  📍 {shortAddress(order.customer_address)}
                </div>

                {showMap && order.customer_lat && order.store_lat && (
                  <div style={{ height: 160, borderRadius: 8, overflow: 'hidden', border: '1px solid var(--border)', marginTop: 8 }}>
                    <MapContainer
                      center={[(order.customer_lat + order.store_lat) / 2, ((order.customer_lng || 0) + (order.store_lng || 0)) / 2]}
                      zoom={13} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                      <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                      <Marker position={[order.store_lat, order.store_lng]} icon={L.divIcon({ html: '<img src="/vai_de_acai_transp.png" style="width:44px;height:44px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5))"/>', className: '', iconSize: [44, 44], iconAnchor: [22, 22] })} />
                      <Marker position={[order.customer_lat, order.customer_lng]} />
                      <RoutePolyline from={{ lat: order.store_lat, lng: order.store_lng }} to={{ lat: order.customer_lat, lng: order.customer_lng }} color="#4A148C" />
                    </MapContainer>
                  </div>
                )}

                {(order.status === 'arriving' || order.status === 'picked_up') && (
                  <div style={{ marginTop: 8 }}>
                    <span className="badge" style={{ background: '#FFF3E0', color: '#E65100', fontSize: 11 }}>
                      🏍️ Entregador próximo!
                    </span>
                  </div>
                )}
              </div>
            );
          })}
        </div>
        )}

        <button className="btn btn-outline mt-4" onClick={loadOrders}>
          Atualizar Pedidos
        </button>
      </>
    );
  }

  function ProdutosView() {
    return (
      <>
        <div className="page-title">Cardápio</div>

        {lowStockProducts.length > 0 && (
          <div className="card" style={{ background: '#FFF3E0', border: '1px solid #FFE082', marginBottom: 16 }}>
            <div style={{ fontSize: 13, fontWeight: 700, color: '#E65100', marginBottom: 4 }}>⚠️ Estoque baixo</div>
            {lowStockProducts.map(p => (
              <div key={p.id} style={{ fontSize: 12, color: '#BF360C', marginBottom: 2 }}>
                {p.name}: {p.stock_quantity} restante(s) (mín: {p.min_stock_alert})
              </div>
            ))}
          </div>
        )}

        <div className="card">
          {!productForm ? (
            <button className="btn btn-primary" onClick={openNewProduct} style={{ marginBottom: 16 }}>
              + Novo Produto
            </button>
          ) : (
            <div style={{ marginBottom: 16, padding: 16, background: '#F3E5F5', borderRadius: 12, border: '1px solid #E1BEE7' }}>
              <div className="text-sm font-bold mb-3" style={{ color: '#6A1B9A' }}>
                {productForm.id ? 'Editar Produto' : 'Novo Produto'}
              </div>
              <div className="form-group">
                <label className="label">Nome</label>
                <input className="input" type="text" value={productForm.name}
                  onChange={e => setProductForm(p => ({ ...p, name: e.target.value }))}
                  placeholder="Ex: Açaí 500ml" />
              </div>
              <div className="form-group">
                <label className="label">Descrição</label>
                <input className="input" type="text" value={productForm.description}
                  onChange={e => setProductForm(p => ({ ...p, description: e.target.value }))}
                  placeholder="Açaí puro batido com guaraná" />
              </div>
              <div className="flex-row" style={{ gap: 8 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="label">Preço (R$)</label>
                  <input className="input" type="number" step="0.01" value={productForm.price}
                    onChange={e => setProductForm(p => ({ ...p, price: e.target.value }))}
                    placeholder="25.00" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="label">Tamanho (ml)</label>
                  <select className="input" value={productForm.size_ml}
                    onChange={e => setProductForm(p => ({ ...p, size_ml: e.target.value }))}>
                    <option value="500">500ml (Meio Litro)</option>
                    <option value="1000">1 Litro</option>
                  </select>
                </div>
              </div>
              <div className="flex-row" style={{ gap: 8 }}>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="label">Qtd em Estoque</label>
                  <input className="input" type="number" min="0" value={productForm.stock_quantity}
                    onChange={e => setProductForm(p => ({ ...p, stock_quantity: e.target.value }))}
                    placeholder="Ex: 50" />
                </div>
                <div className="form-group" style={{ flex: 1 }}>
                  <label className="label">Alerta Mínimo</label>
                  <input className="input" type="number" min="0" value={productForm.min_stock_alert}
                    onChange={e => setProductForm(p => ({ ...p, min_stock_alert: e.target.value }))}
                    placeholder="Ex: 5" />
                </div>
              </div>
              <div className="form-group">
                <label className="label">Imagem do Produto</label>
                <input type="file" accept="image/*" ref={productImgRef}
                  style={{ fontSize: 13 }} />
              </div>
              <div className="flex-row" style={{ gap: 8, marginTop: 8 }}>
                <button className="btn btn-primary btn-sm" onClick={saveProduct}>
                  {productForm.id ? 'Salvar' : 'Criar Produto'}
                </button>
                <button className="btn btn-outline btn-sm" onClick={() => setProductForm(null)}>
                  Cancelar
                </button>
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {products.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: 20 }}>
                Nenhum produto cadastrado. Clique em "Novo Produto".
              </div>
            ) : (
              products.map(p => {
                const isLow = p.active && p.stock_quantity != null && p.min_stock_alert != null && p.stock_quantity <= p.min_stock_alert;
                return (
                <div key={p.id} className="card" style={{
                  padding: '12px 16px',
                  opacity: p.active ? 1 : 0.5,
                  background: p.active ? (isLow ? '#FFF8E1' : 'white') : '#F5F5F5'
                }}>
                  <div style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                    {/* Imagem */}
                    {p.image ? (
                      <img src={p.image} alt={p.name}
                        style={{ width: 64, height: 64, borderRadius: 10, objectFit: 'cover', flexShrink: 0, border: '1px solid #eee' }}
                        onError={e => { e.target.style.display = 'none'; }} />
                    ) : (
                      <div style={{ width: 64, height: 64, borderRadius: 10, background: '#F3E5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0, fontSize: 24 }}>
                        🫙
                      </div>
                    )}
                    {/* Detalhes */}
                    <div style={{ flex: 1, minWidth: 0 }}>
                      {/* Linha 1: nome + badges */}
                      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 2 }}>
                        <span className="font-bold text-sm" style={{
                          flex: 1, minWidth: 0,
                          overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                          textDecoration: p.active ? 'none' : 'line-through'
                        }}>{p.name}</span>
                        <span className="badge" style={{
                          background: '#E8F5E9', color: '#2E7D32', fontSize: 11, whiteSpace: 'nowrap', flexShrink: 0
                        }}>{p.size_ml}ml</span>
                        {!p.active && (
                          <span className="badge" style={{
                            background: '#FFEBEE', color: '#C62828', fontSize: 10, flexShrink: 0
                          }}>Inativo</span>
                        )}
                      </div>
                      {/* Linha 2: descrição */}
                      {p.description && (
                        <div className="text-xs text-muted" style={{ marginBottom: 4 }}>{p.description}</div>
                      )}
                      {/* Linha 3: preço + estoque */}
                      <div style={{ display: 'flex', gap: 12, alignItems: 'center', marginBottom: 10 }}>
                        <div className="text-sm font-bold" style={{ color: '#6A1B9A' }}>
                          R$ {fmt(p.price)}
                        </div>
                        <div style={{ fontSize: 12, color: isLow ? '#E65100' : '#555' }}>
                          Estoque: {p.stock_quantity != null ? p.stock_quantity : '—'}
                          {p.min_stock_alert != null && p.stock_quantity != null && (
                            <span style={{ color: '#999', marginLeft: 4 }}>
                              / min {p.min_stock_alert}
                            </span>
                          )}
                        </div>
                      </div>
                      {/* Linha 4: ações */}
                      <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                        <button className="btn btn-sm"
                          style={{ fontSize: 12, padding: '5px 14px', background: '#F3E5F5', color: '#6A1B9A', border: 'none' }}
                          onClick={() => editProduct(p)}>
                          Editar
                        </button>
                        <button className="btn btn-sm"
                          style={{ fontSize: 12, padding: '5px 14px', background: p.active ? '#FFF3E0' : '#E8F5E9', color: p.active ? '#E65100' : '#2E7D32', border: 'none' }}
                          onClick={() => toggleProduct(p.id, p.active)}>
                          {p.active ? 'Desativar' : 'Ativar'}
                        </button>
                        <button className="btn btn-sm"
                          style={{ fontSize: 12, padding: '5px 14px', background: '#FFEBEE', color: '#C62828', border: 'none' }}
                          onClick={() => deleteProduct(p.id)}>
                          Excluir
                        </button>
                      </div>
                    </div>
                  </div>
                </div>
              );})
            )}
          </div>
        </div>
      </>
    );
  }

  function PerfilView() {
    if (perfilTab === 'dados') {
      return (
        <div className="card">
          <div className="page-title" style={{ fontSize: 18, marginBottom: 16 }}>Dados da Loja</div>
          <div className="form-group">
            <label className="label">Nome da Loja</label>
            <input className="input" type="text" value={settings.name}
              onChange={e => setSettings(s => ({ ...s, name: e.target.value }))}
              placeholder="Nome da loja" />
          </div>
          <div className="form-group">
            <label className="label">CPF / CNPJ</label>
            <input className="input" type="text" value={settings.cpf_cnpj}
              onChange={e => setSettings(s => ({ ...s, cpf_cnpj: e.target.value }))}
              placeholder="000.000.000-00 ou 00.000.000/0000-00" />
          </div>
          <div className="form-group">
            <label className="label" style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              Chave PIX
              <span style={{ fontSize: 11, fontWeight: 700, color: '#fff', background: '#E53935', borderRadius: 4, padding: '1px 5px' }}>Obrigatório</span>
            </label>
            <input className="input" type="text" value={settings.pix_key}
              onChange={e => setSettings(s => ({ ...s, pix_key: e.target.value }))}
              placeholder="CPF, telefone, e-mail ou chave aleatória"
              style={!settings.pix_key.trim() ? { borderColor: '#E53935', background: '#FFF8F8' } : {}} />
            {!settings.pix_key.trim() && (
              <div style={{ fontSize: 11, color: '#E53935', marginTop: 4 }}>
                Sem chave PIX você não conseguirá receber os pagamentos.
              </div>
            )}
          </div>
          <div className="form-group">
            <label className="label">Logo da Loja</label>
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
              {(settings.logo || fileRef.current?.files?.[0]) && (
                <img
                  src={settings.logo || (fileRef.current?.files?.[0] ? URL.createObjectURL(fileRef.current.files[0]) : null)}
                  alt="Logo"
                  style={{ maxWidth: 160, maxHeight: 80, objectFit: 'contain', borderRadius: 8 }}
                  onError={e => { e.target.style.display = 'none'; }}
                />
              )}
              <input type="file" accept="image/*" ref={fileRef}
                onChange={uploadLogo}
                style={{ fontSize: 14 }} />
              {logoSaving && <span className="text-xs text-muted">Enviando logo...</span>}
            </div>
          </div>
          {saveMsg && (
            <div style={{ background: '#E8F5E9', color: '#2E7D32', padding: 10, borderRadius: 8, marginBottom: 12, textAlign: 'center', fontWeight: 600 }}>
              {saveMsg}
            </div>
          )}
          <button className="btn btn-primary" onClick={saveSettings} disabled={uploading} style={{ marginTop: 12 }}>
            {uploading ? 'Salvando...' : 'Salvar Dados'}
          </button>
        </div>
      );
    }

    if (perfilTab === 'endereco') {
      return <StoreAddressForm settings={settings} setSettings={setSettings} saveSettings={saveSettings} uploading={uploading} saveMsg={saveMsg} setSaveMsg={setSaveMsg} />;
    }

    if (perfilTab === 'trocar-senha') {
      return (
        <div className="card">
          <div className="page-title" style={{ fontSize: 18, marginBottom: 16 }}>Trocar Senha</div>
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
          <button className="btn btn-primary" onClick={async () => {
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

          <div style={{ borderTop: '1px solid #f0f0f0', marginTop: 32, paddingTop: 16, display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 12, fontWeight: 600, color: '#aaa' }}>Pedidos de exemplo</div>
              <div style={{ fontSize: 11, color: '#ccc', marginTop: 2 }}>Exibe dados fictícios no painel</div>
            </div>
            <div className="toggle-switch" onClick={() => setDemoActive(d => !d)}>
              <input type="checkbox" checked={demoActive} readOnly />
              <span className="toggle-slider" />
            </div>
          </div>
        </div>
      );
    }

    if (perfilTab === 'mensagens') {
      return (
        <div>
          <StoreMessages messages={storeMessages} storeId={storeData?.id} apiFetch={apiFetch} onReload={loadMessages} />
        </div>
      );
    }

    if (perfilTab === 'vendas') {
      return FinanceiroTab();
    }

    if (perfilTab === 'motoboy') {
      return (
        <>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
            <div className="page-title" style={{ marginBottom: 0 }}>Entregadores</div>
            <button
              onClick={() => setShowMotoboyInfo(v => !v)}
              style={{
                width: 22, height: 22, borderRadius: '50%', border: '1.5px solid #1976D2',
                background: showMotoboyInfo ? '#1976D2' : 'white',
                color: showMotoboyInfo ? 'white' : '#1976D2',
                fontSize: 12, fontWeight: 700, cursor: 'pointer',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                flexShrink: 0, lineHeight: 1
              }}
              title="Como funciona"
            >i</button>
          </div>
          {showMotoboyInfo && (
            <div className="card" style={{ background: '#E3F2FD', border: '1px solid #BBDEFB', marginBottom: 16 }}>
              <p className="text-xs text-muted" style={{ marginBottom: 4, fontWeight: 600 }}>Como funciona:</p>
              <p className="text-xs text-muted" style={{ marginBottom: 4 }}>
                <strong>Parceiro:</strong> você gera um link de convite, o entregador se cadastra e recebe pedidos automaticamente.
              </p>
              <p className="text-xs text-muted">
                <strong>Independente:</strong> entregadores se cadastram sozinhos e escolhem quais pedidos aceitar.
              </p>
            </div>
          )}

          <div className="card">
            <div className="form-group">
              <label className="label">Convidar Entregador Parceiro</label>
              <div className="flex-row" style={{ gap: 8 }}>
                <input className="input" type="text" value={motoboyPhone}
                  onChange={e => setMotoboyPhone(e.target.value)}
                  placeholder="WhatsApp do entregador"
                  style={{ flex: 1 }} />
                <button className="btn btn-primary btn-sm"
                  onClick={generateInvite}
                  style={{ width: 'auto', whiteSpace: 'nowrap' }}>
                  Gerar Convite
                </button>
              </div>
              <span className="text-xs text-muted">Se o entregador já tiver cadastro, será vinculado direto.</span>
            </div>

            {inviteLink && (
              <div style={{ background: '#E8F5E9', border: '1px solid #C8E6C9', padding: 12, borderRadius: 8, marginBottom: 12 }}>
                <div style={{ fontWeight: 600, color: '#2E7D32', marginBottom: 6, fontSize: 13 }}>Link de convite gerado:</div>
                <div style={{ background: 'white', padding: 8, borderRadius: 4, fontSize: 12, wordBreak: 'break-all', marginBottom: 8, border: '1px solid var(--border)' }}>
                  {inviteLink}
                </div>
                <button className="btn btn-primary btn-sm" onClick={copyInviteLink}>Copiar Link</button>
              </div>
            )}

            {motoboyMsg && (
              <div style={{ marginTop: 8, fontSize: 13, fontWeight: 600,
                color: motoboyMsg.includes('Erro') || motoboyMsg.includes('invalido') ? '#C62828' : '#2E7D32' }}>
                {motoboyMsg}
              </div>
            )}

            <hr style={{ margin: '20px 0', borderTop: '1px solid var(--border)' }} />

            {invites.filter(i => !i.used).length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label className="label">Convites Pendentes</label>
                {invites.filter(i => !i.used).map(inv => (
                  <div key={inv.id} style={{ padding: '8px 12px', background: '#FFF8E1', borderRadius: 8, border: '1px solid #FFE082', marginBottom: 6 }}>
                    <div className="flex-between" style={{ marginBottom: 4 }}>
                      <div className="text-sm font-bold">{inv.phone}</div>
                      <div style={{ display: 'flex', gap: 6 }}>
                        <button className="btn btn-sm"
                          style={{ fontSize: 11, padding: '4px 10px', background: '#E8F5E9', color: '#2E7D32', border: 'none' }}
                          onClick={() => copyInviteLinkToken(inv.token)}>Copiar Link</button>
                        <button className="btn btn-sm"
                          style={{ color: '#C62828', fontSize: 11, background: 'transparent', border: 'none' }}
                          onClick={() => revokeInvite(inv.id)}>Cancelar</button>
                      </div>
                    </div>
                    <div className="text-xs text-muted" style={{ wordBreak: 'break-all' }}>
                      {window.location.origin}/register?token={inv.token}
                    </div>
                  </div>
                ))}
              </div>
            )}

            <label className="label">Entregadores Vinculados</label>
            {motoboys.length === 0 && invites.filter(i => !i.used).length === 0 ? (
              <div className="text-center text-muted" style={{ padding: 20 }}>
                Nenhum entregador vinculado. Convide um entregador parceiro pelo telefone acima.
              </div>
            ) : motoboys.length === 0 ? (
              <div className="text-center text-muted" style={{ padding: 20 }}>
                Nenhum entregador vinculado ainda. Aguardando cadastro dos convidados.
              </div>
            ) : (
              motoboys.map(m => (
                <div key={m.id} className="flex-between card" style={{
                  padding: '12px 16px',
                  background: m.employee ? '#F3E5F5' : '#FAFAFA',
                  border: m.employee ? '1px solid #E1BEE7' : '1px solid var(--border)'
                }}>
                  <div>
                    <div className="font-bold text-sm">{m.name}</div>
                    <div className="text-xs text-muted">{m.phone}</div>
                    <div style={{ marginTop: 4 }}>
                      <span className="badge" style={{
                        background: m.employee ? '#E8F5E9' : '#FFF3E0',
                        color: m.employee ? '#2E7D32' : '#E65100', fontSize: 11
                      }}>
                        {m.employee ? 'Parceiro (auto-designado)' : 'Independente (aceita pedidos)'}
                      </span>
                    </div>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-end' }}>
                    <div className="toggle-switch" onClick={() => toggleEmployee(m.id, m.employee)}
                      title={m.employee ? 'Tornar independente' : 'Tornar parceiro da loja'}>
                      <input type="checkbox" checked={!!m.employee} readOnly />
                      <span className="toggle-slider" />
                    </div>
                    <span style={{ fontSize: 10, color: 'var(--text-muted)' }}>
                      {m.employee ? 'Parceiro' : 'Independente'}
                    </span>
                    <button className="btn btn-sm"
                      style={{ color: '#C62828', fontSize: 12, padding: '2px 8px', background: 'transparent' }}
                      onClick={() => removeMotoboy(m.id)}>Remover</button>
                  </div>
                </div>
              ))
            )}
          </div>
        </>
      );
    }

    if (perfilTab === 'assinatura') {
      const isPremium = (storeData?.plan || 'basico') === 'premium';
      const checkIcon = <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="#6A1B9A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>;

      return (
        <div>
          <div className="page-title" style={{ fontSize: 20, marginBottom: 20 }}>Assinatura</div>

          {/* Card único */}
          <div style={{ borderRadius: 16, border: `2px solid ${isPremium ? '#6A1B9A' : '#e0e0e0'}`, padding: 24, position: 'relative', background: isPremium ? '#fdf8ff' : 'white', boxShadow: '0 2px 16px rgba(106,27,154,0.07)' }}>
            <div style={{ position: 'absolute', top: -12, left: 20, background: isPremium ? '#6A1B9A' : '#1a1a1a', color: 'white', fontSize: 11, fontWeight: 700, padding: '3px 14px', borderRadius: 20 }}>
              {isPremium ? 'PLANO ATUAL' : '✦ 1 mês grátis'}
            </div>

            <div style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8, color: '#888', marginBottom: 10, marginTop: 4 }}>Plano Loja</div>
            <div style={{ display: 'flex', alignItems: 'baseline', gap: 3, marginBottom: 4 }}>
              <span style={{ fontSize: 16, color: '#888', fontWeight: 600 }}>R$</span>
              <span style={{ fontSize: 42, fontWeight: 800, color: '#1a1a1a', lineHeight: 1 }}>129</span>
              <span style={{ fontSize: 13, color: '#888' }}>/mês</span>
            </div>
            <div style={{ fontSize: 12, color: '#9C27B0', fontWeight: 600, marginBottom: 22 }}>sem comissão por pedido · cancele quando quiser</div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 24 }}>
              {[
                'App completo para clientes',
                'Painel com pedidos ao vivo',
                'Entregadores integrados',
                'Cardápio digital com fotos',
                'Rastreamento em tempo real',
                'Relatório financeiro',
                'Tela de TV (modo operação)',
                'Exportação de dados CSV',
                'Suporte via WhatsApp',
              ].map(f => (
                <div key={f} style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  {checkIcon}
                  <span style={{ fontSize: 13, color: '#444' }}>{f}</span>
                </div>
              ))}
            </div>

            {!isPremium && (
              <a href="https://wa.me/5591920655109?text=Olá,%20quero%20assinar%20o%20Pé%20de%20Açaí!" target="_blank" rel="noopener noreferrer"
                style={{ display: 'block', width: '100%', background: 'linear-gradient(135deg, #6A1B9A, #9C27B0)', color: 'white', border: 'none', borderRadius: 12, padding: '14px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer', textAlign: 'center', textDecoration: 'none', boxSizing: 'border-box' }}>
                Começar 1 mês grátis →
              </a>
            )}
          </div>

          <div style={{ marginTop: 16, padding: '14px 16px', background: 'white', borderRadius: 12, border: '1px solid #eee', fontSize: 13, color: '#555' }}>
            Dúvidas? Fale com a gente pelo WhatsApp:{' '}
            <a href="https://wa.me/5591920655109" target="_blank" rel="noopener noreferrer" style={{ color: '#6A1B9A', fontWeight: 700 }}>
              (91) 92065-5109
            </a>
          </div>
        </div>
      );
    }

    const perfilMenuItems = [
      {
        key: 'dados', label: 'Dados da Loja',
        icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6A1B9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>
      },
      {
        key: 'endereco', label: 'Endereço',
        icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6A1B9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>
      },
      {
        key: 'trocar-senha', label: 'Trocar Senha',
        icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6A1B9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>
      },
      {
        key: 'mensagens', label: 'Mensagens',
        icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6A1B9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
      },
      {
        key: 'vendas', label: 'Vendas',
        icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6A1B9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>
      },
      {
        key: 'motoboy', label: 'Entregadores',
        icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6A1B9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="17.5" r="2.5"/><circle cx="18.5" cy="17.5" r="2.5"/><path d="M15 6h2l3 5v4h-5"/><path d="M3 17h2V9h6l2 4H3"/></svg>
      },
      {
        key: 'assinatura', label: 'Assinatura',
        icon: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="#6A1B9A" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>
      },
    ];

    return (
      <>
        <div className="page-title" style={{ marginBottom: 16 }}>Perfil</div>

        {perfilMenuItems.map(item => (
          <div key={item.key} className="card" style={{ padding: '14px 16px', cursor: 'pointer', marginBottom: 8 }}
            onClick={() => setPerfilTab(item.key)}>
            <div className="flex-between">
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 36, height: 36, borderRadius: 10, background: '#F3E5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                  {item.icon}
                </div>
                <span style={{ fontWeight: 600, fontSize: 15 }}>{item.label}</span>
              </div>
              <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ccc" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="9 18 15 12 9 6"/></svg>
            </div>
          </div>
        ))}

        <button className="btn btn-outline" style={{ marginTop: 16, width: '100%', color: '#C62828', borderColor: '#FFCDD2' }}
          onClick={logout}>
          Sair da Conta
        </button>
      </>
    );
  }

  function PainelView() {
    const totalPedidosHoje = activeOrders.filter(o => new Date(o.created_at).toDateString() === new Date().toDateString()).length;
    const faturamentoHoje = activeOrders.filter(o => o.payment_status === 'paid' && new Date(o.created_at).toDateString() === new Date().toDateString()).reduce((s, o) => s + o.total, 0);
    const totalProdutos = products.filter(p => p.active).length;

    const statusColors = {
      confirmed:  { bg: '#FFF3E0', color: '#E65100', border: '#FFE0B2' },
      preparing:  { bg: '#E3F2FD', color: '#1565C0', border: '#BBDEFB' },
      ready:      { bg: '#E8F5E9', color: '#2E7D32', border: '#C8E6C9' },
      assigned:   { bg: '#F3E5F5', color: '#6A1B9A', border: '#E1BEE7' },
      picked_up:  { bg: '#F3E5F5', color: '#6A1B9A', border: '#E1BEE7' },
      in_transit: { bg: '#EDE7F6', color: '#4527A0', border: '#D1C4E9' },
      arriving:   { bg: '#FCE4EC', color: '#880E4F', border: '#F8BBD0' },
    };

    return (
      <div>
        {/* ─── KPI Row ─── */}
        {isDesktop ? (
          <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr 1fr 1fr', gap: 12, marginBottom: 20 }}>
            {/* Faturamento — único destaque colorido */}
            <div style={{
              background: 'linear-gradient(135deg, #6A1B9A 0%, #9C27B0 55%, #CE93D8 100%)',
              borderRadius: 14, padding: '18px 22px', color: 'white', position: 'relative', overflow: 'hidden'
            }}>
              <div style={{ position: 'absolute', top: -15, right: -15, width: 90, height: 90, borderRadius: '50%', background: 'rgba(255,255,255,0.08)' }} />
              <div style={{ fontSize: 10, opacity: 0.85, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6 }}>Faturamento Hoje</div>
              <div style={{ fontSize: 32, fontWeight: 800, marginTop: 6, lineHeight: 1.1 }}>R$ {fmt(faturamentoHoje)}</div>
              <div style={{ fontSize: 12, opacity: 0.75, marginTop: 6 }}>{totalPedidosHoje} pedido{totalPedidosHoje !== 1 ? 's' : ''} hoje</div>
            </div>
            {/* Ativos */}
            <div onClick={() => { setOrderFilter('ativos'); setView('pedidos'); }} style={{
              background: 'white', borderRadius: 14, padding: '18px 16px', cursor: 'pointer',
              border: '1px solid #eee', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
            }}>
              <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Ativos</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: '#6A1B9A', lineHeight: 1 }}>{pendingOrders.length}</div>
            </div>
            {/* Pendentes */}
            <div onClick={() => { setOrderFilter('pendentes'); setView('pedidos'); }} style={{
              background: 'white', borderRadius: 14, padding: '18px 16px', cursor: 'pointer',
              border: '1px solid #eee', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
            }}>
              <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Pendentes</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: '#E65100', lineHeight: 1 }}>{pedidosPendentes}</div>
            </div>
            {/* Concluídos */}
            <div onClick={() => { setOrderFilter('concluidos'); setView('pedidos'); }} style={{
              background: 'white', borderRadius: 14, padding: '18px 16px', cursor: 'pointer',
              border: '1px solid #eee', boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
              display: 'flex', flexDirection: 'column', justifyContent: 'space-between'
            }}>
              <div style={{ fontSize: 10, color: '#aaa', fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5 }}>Concluídos</div>
              <div style={{ fontSize: 34, fontWeight: 800, color: '#2E7D32', lineHeight: 1 }}>{concludedOrders.length}</div>
            </div>
          </div>
        ) : (
          /* Mobile: layout compacto */
          <>
            {/* Faturamento — card hero full-width */}
            <div style={{
              background: 'linear-gradient(135deg, #6A1B9A 0%, #9C27B0 55%, #CE93D8 100%)',
              borderRadius: 16, padding: '18px 20px', color: 'white', position: 'relative', overflow: 'hidden',
              marginBottom: 12
            }}>
              <div style={{ position: 'absolute', top: -20, right: -20, width: 110, height: 110, borderRadius: '50%', background: 'rgba(255,255,255,0.07)' }} />
              <div style={{ position: 'absolute', bottom: -30, right: 50, width: 70, height: 70, borderRadius: '50%', background: 'rgba(255,255,255,0.05)' }} />
              <div style={{ fontSize: 11, opacity: 0.8, fontWeight: 600, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 4 }}>Faturamento Hoje</div>
              <div style={{ fontSize: 34, fontWeight: 800, lineHeight: 1.1 }}>R$ {fmt(faturamentoHoje)}</div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, marginTop: 10, paddingTop: 10, borderTop: '1px solid rgba(255,255,255,0.2)' }}>
                <div>
                  <span style={{ fontSize: 13, fontWeight: 700 }}>{totalPedidosHoje}</span>
                  <span style={{ fontSize: 11, opacity: 0.75, marginLeft: 4 }}>pedido{totalPedidosHoje !== 1 ? 's' : ''} hoje</span>
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 5 }}>
                  <span style={{ width: 7, height: 7, borderRadius: '50%', background: open ? '#69F0AE' : '#FF5252', display: 'inline-block', flexShrink: 0 }} />
                  <span style={{ fontSize: 11, opacity: 0.85, fontWeight: 600 }}>{open ? 'Aberta' : 'Fechada'}</span>
                </div>
              </div>
            </div>

            {/* Status cards: 3 colunas */}
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
              <div onClick={() => { setOrderFilter('pendentes'); setView('pedidos'); }} style={{ background: 'white', borderRadius: 14, padding: '14px 10px', cursor: 'pointer', border: '1px solid #eee', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#E65100', lineHeight: 1 }}>{pedidosPendentes}</div>
                <div style={{ fontSize: 11, color: '#aaa', fontWeight: 500, marginTop: 4 }}>Pendentes</div>
              </div>
              <div onClick={() => { setOrderFilter('ativos'); setView('pedidos'); }} style={{ background: 'white', borderRadius: 14, padding: '14px 10px', cursor: 'pointer', border: '1px solid #eee', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#6A1B9A', lineHeight: 1 }}>{pendingOrders.length}</div>
                <div style={{ fontSize: 11, color: '#aaa', fontWeight: 500, marginTop: 4 }}>Ativos</div>
              </div>
              <div onClick={() => { setOrderFilter('concluidos'); setView('pedidos'); }} style={{ background: 'white', borderRadius: 14, padding: '14px 10px', cursor: 'pointer', border: '1px solid #eee', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', textAlign: 'center' }}>
                <div style={{ fontSize: 26, fontWeight: 800, color: '#2E7D32', lineHeight: 1 }}>{concludedOrders.length}</div>
                <div style={{ fontSize: 11, color: '#aaa', fontWeight: 500, marginTop: 4 }}>Concluídos</div>
              </div>
            </div>
          </>
        )}

        {/* ─── Alerta estoque baixo ─── */}
        {lowStockProducts.length > 0 && (
          <div style={{
            background: 'white', borderRadius: 14, padding: '12px 16px', marginBottom: 16,
            border: '1px solid #eee', borderLeft: '3px solid #E65100',
            boxShadow: '0 1px 4px rgba(0,0,0,0.04)',
            display: 'flex', alignItems: 'center', justifyContent: 'space-between'
          }}>
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#1a1a1a' }}>Estoque baixo</div>
              <div style={{ fontSize: 12, color: '#888', marginTop: 1 }}>
                {lowStockProducts.length} produto(s) precisam de reposição
              </div>
            </div>
            <button style={{ background: '#1a1a1a', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 600, cursor: 'pointer' }}
              onClick={() => setView('produtos')}>
              Ver
            </button>
          </div>
        )}

        {/* ─── Pedidos em andamento ─── */}
        <div>
          {/* Header com toggle de layout */}
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1a' }}>Pedidos em andamento</span>
              {pendingOrders.length > 0 && (
                <span style={{ background: '#6A1B9A', color: 'white', borderRadius: 10, padding: '2px 8px', fontSize: 11, fontWeight: 700 }}>
                  {pendingOrders.length}
                </span>
              )}
            </div>
            <span onClick={() => setView('pedidos')} style={{ fontSize: 12, color: '#6A1B9A', fontWeight: 600, cursor: 'pointer' }}>
              Ver todos →
            </span>
          </div>

          {pendingOrders.length === 0 ? (
            <div style={{ textAlign: 'center', padding: '40px 20px', color: '#bbb', fontSize: 14, background: 'white', borderRadius: 14, border: '1px solid #f0f0f0' }}>
              Nenhum pedido ativo no momento
            </div>

          ) : dashLayout === 'kanban' ? (() => {
            /* ── Kanban ── */
            const groups = [
              { label: 'Preparar',          dot: '#E65100', orders: pendingOrders.filter(o => o.status === 'confirmed') },
              { label: 'Preparando',        dot: '#6A1B9A', orders: pendingOrders.filter(o => o.status === 'preparing') },
              { label: 'Pronto',            dot: '#2E7D32', orders: pendingOrders.filter(o => o.status === 'ready') },
              { label: 'Motoboy na Loja',   dot: '#6A1B9A', orders: pendingOrders.filter(o => o.status === 'assigned') },
              { label: 'Saiu para Entrega', dot: '#555',    orders: pendingOrders.filter(o => ['picked_up', 'in_transit', 'arriving'].includes(o.status)) },
            ].filter(g => g.orders.length > 0);

            return (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
                {groups.map(group => (
                  <div key={group.label}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 7, marginBottom: 10 }}>
                      <span style={{ width: 7, height: 7, borderRadius: '50%', background: group.dot, display: 'inline-block', flexShrink: 0 }} />
                      <span style={{ fontSize: 11, fontWeight: 700, letterSpacing: 0.8, textTransform: 'uppercase', color: '#444' }}>{group.label}</span>
                      <span style={{ fontSize: 11, color: '#bbb' }}>· {group.orders.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? 'repeat(3, 1fr)' : '1fr', gap: 12 }}>
                      {group.orders.map(o => {
                        const action = getAction(o);
                        const allItems = o.items || o.order_items || [];
                        return (
                          <div key={o.id} style={{ background: 'white', borderRadius: 12, padding: '14px 16px', border: '1px solid #eee', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 8 }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                              <div style={{ fontWeight: 700, fontSize: 14, color: '#1a1a1a', flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{o.customer_name}</div>
                              <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#888', whiteSpace: 'nowrap', marginLeft: 8, flexShrink: 0 }}>
                                <span style={{ width: 6, height: 6, borderRadius: '50%', background: group.dot, display: 'inline-block' }} />
                                {group.label}
                              </span>
                            </div>
                            <div style={{ borderTop: '1px solid #f0f0f0', paddingTop: 8 }}>
                              {allItems.map((it, i) => (
                                <div key={i} style={{ fontSize: 12, color: '#555', lineHeight: 1.6 }}>
                                  {it.quantity}× {it.product_name || it.products?.name || 'Produto'}
                                </div>
                              ))}
                            </div>
                            {o.motoboy_name && (
                              <div style={{ fontSize: 12, color: '#888' }}>Entregador: <strong style={{ color: '#555' }}>{o.motoboy_name}</strong></div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 2, paddingTop: 8, borderTop: '1px solid #f0f0f0' }}>
                              <div>
                                <div style={{ fontSize: 11, color: '#aaa' }}>#{String(o.id).slice(-4)} · {new Date(o.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                                <div style={{ fontSize: 14, fontWeight: 800, color: '#1a1a1a', marginTop: 2 }}>R$ {fmt(o.total)}</div>
                              </div>
                              {action && (
                                <button onClick={() => updateStatus(o.id, action.next)}
                                  style={{ background: '#6A1B9A', color: 'white', border: 'none', borderRadius: 8, padding: '7px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer' }}>
                                  {action.label}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            );
          })()

          : dashLayout === 'fila' ? (() => {
            /* ── Fila (2 colunas: preparo | entrega) ── */
            const filaPrep    = pendingOrders.filter(o => ['confirmed', 'preparing', 'ready', 'assigned'].includes(o.status));
            const filaCaminho = pendingOrders.filter(o => ['picked_up', 'in_transit', 'arriving'].includes(o.status));
            const filaStatusLabel = { confirmed: 'Confirmado', preparing: 'Preparando', ready: 'Pronto', assigned: 'Entregador chegou' };
            const filaStatusDot   = { confirmed: '#E65100', preparing: '#6A1B9A', ready: '#2E7D32', assigned: '#6A1B9A' };

            const filaCard = (o, dot) => {
              const action = getAction(o);
              const dotColor = dot || filaStatusDot[o.status] || '#888';
              return (
                <div key={o.id} style={{ background: 'white', borderRadius: 12, padding: '14px 16px', border: '1px solid #eee', boxShadow: '0 1px 4px rgba(0,0,0,0.04)', display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                    <div style={{ fontWeight: 800, fontSize: 15, color: '#1a1a1a' }}>{o.customer_name}</div>
                    <span style={{ display: 'flex', alignItems: 'center', gap: 4, fontSize: 10, color: '#888', whiteSpace: 'nowrap', marginLeft: 8, flexShrink: 0 }}>
                      <span style={{ width: 6, height: 6, borderRadius: '50%', background: dotColor, display: 'inline-block' }} />
                      {filaStatusLabel[o.status] || statusLabels[o.status] || o.status}
                    </span>
                  </div>
                  <div style={{ borderTop: '1px solid #f5f5f5', paddingTop: 6 }}>
                    {(o.items || o.order_items || []).map((it, i) => (
                      <div key={i} style={{ fontSize: 12, color: '#555', lineHeight: 1.6 }}>
                        {it.quantity}× {it.product_name || it.products?.name || 'Produto'}
                      </div>
                    ))}
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                    <span style={{ fontSize: 11, color: '#aaa' }}>#{String(o.id).slice(-4)}</span>
                    {action && (
                      <button onClick={() => updateStatus(o.id, action.next)}
                        style={{ background: '#6A1B9A', color: 'white', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>
                        {action.label}
                      </button>
                    )}
                  </div>
                </div>
              );
            };

            return (
              <div style={{ display: 'grid', gridTemplateColumns: isDesktop ? '1fr 1fr' : '1fr', gap: 20, alignItems: 'start' }}>
                {/* Coluna esquerda — Em Preparo */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 14px', background: '#f9f9f9', borderRadius: 10, border: '1px solid #eee' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#6A1B9A', display: 'inline-block' }} />
                    <span style={{ color: '#333', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>Em Preparo</span>
                    <span style={{ background: '#1a1a1a', color: 'white', borderRadius: 8, padding: '1px 7px', fontSize: 11, fontWeight: 700, marginLeft: 'auto' }}>{filaPrep.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filaPrep.length === 0 ? (
                      <div style={{ color: '#bbb', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Nenhum pedido em preparo</div>
                    ) : filaPrep.map(o => filaCard(o))}
                  </div>
                </div>
                {/* Coluna direita — A caminho */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '8px 14px', background: '#f9f9f9', borderRadius: 10, border: '1px solid #eee' }}>
                    <span style={{ width: 7, height: 7, borderRadius: '50%', background: '#555', display: 'inline-block' }} />
                    <span style={{ color: '#333', fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.8 }}>Saiu para Entrega</span>
                    <span style={{ background: '#1a1a1a', color: 'white', borderRadius: 8, padding: '1px 7px', fontSize: 11, fontWeight: 700, marginLeft: 'auto' }}>{filaCaminho.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                    {filaCaminho.length === 0 ? (
                      <div style={{ color: '#bbb', fontSize: 13, textAlign: 'center', padding: '24px 0' }}>Nenhum pedido a caminho</div>
                    ) : filaCaminho.map(o => filaCard(o, '#555'))}
                  </div>
                </div>
              </div>
            );
          })()

          : (() => {
            /* ── Linha / Compacto (tabela) ── */
            const urgencyOrder = { arriving: 0, in_transit: 1, picked_up: 2, assigned: 3, ready: 4, preparing: 5, confirmed: 6 };
            const linhaOrders = [...pendingOrders].sort((a, b) => (urgencyOrder[a.status] ?? 99) - (urgencyOrder[b.status] ?? 99));
            const linhaStatusInfo = {
              confirmed:  { label: 'Novo',       dot: '#E65100' },
              preparing:  { label: 'Preparando', dot: '#6A1B9A' },
              ready:      { label: 'Pronto',     dot: '#2E7D32' },
              assigned:   { label: 'Entregador', dot: '#6A1B9A' },
              picked_up:  { label: 'Saiu',       dot: '#555' },
              in_transit: { label: 'A caminho',  dot: '#555' },
              arriving:   { label: 'Saiu pra entrega', dot: '#555' },
            };
            const thS = { color: '#999', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.6, padding: '10px 12px', borderBottom: '2px solid #f0f0f0', textAlign: 'left', whiteSpace: 'nowrap' };
            const tdS = { padding: '10px 12px', borderBottom: '1px solid #f5f5f5', verticalAlign: 'middle' };

            return (
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', background: 'white', borderRadius: 12, overflow: 'hidden', border: '1px solid #f0f0f0' }}>
                  <thead>
                    <tr style={{ background: '#fafafa' }}>
                      <th style={thS}>Hora</th>
                      <th style={thS}>#</th>
                      <th style={thS}>Cliente</th>
                      <th style={thS}>Itens</th>
                      <th style={{ ...thS, textAlign: 'center' }}>Status</th>
                      <th style={thS}>Entregador</th>
                      <th style={{ ...thS, textAlign: 'right' }}>Valor</th>
                      <th style={{ ...thS, textAlign: 'center', width: 120 }}>Ação</th>
                    </tr>
                  </thead>
                  <tbody>
                    {linhaOrders.map((o, idx) => {
                      const action = getAction(o);
                      const si = linhaStatusInfo[o.status] || { label: o.status, color: '#888', bg: '#f5f5f5' };
                      return (
                        <tr key={o.id} style={{ background: idx % 2 === 0 ? 'transparent' : 'rgba(0,0,0,0.012)' }}>
                          <td style={{ ...tdS, color: '#aaa', fontSize: 12, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            {new Date(o.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                          </td>
                          <td style={{ ...tdS, color: '#bbb', fontSize: 11, fontFamily: 'monospace' }}>
                            …{String(o.id).slice(-4)}
                          </td>
                          <td style={{ ...tdS, color: '#1a1a1a', fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap' }}>
                            {o.customer_name}
                          </td>
                          <td style={{ ...tdS, fontSize: 12, color: '#555', maxWidth: 200 }}>
                            {(o.items || o.order_items || []).map((it, i) => (
                              <span key={i} style={{ display: 'block', lineHeight: 1.5 }}>
                                {it.quantity}× {it.product_name || it.products?.name || 'Produto'}
                              </span>
                            ))}
                          </td>
                          <td style={{ ...tdS, textAlign: 'center' }}>
                            <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#555', fontWeight: 600, whiteSpace: 'nowrap' }}>
                              <span style={{ width: 6, height: 6, borderRadius: '50%', background: si.dot || '#aaa', display: 'inline-block', flexShrink: 0 }} />
                              {si.label}
                            </span>
                          </td>
                          <td style={{ ...tdS, fontSize: 12, color: '#555', whiteSpace: 'nowrap' }}>
                            {o.motoboy_name || <span style={{ color: '#ddd' }}>—</span>}
                          </td>
                          <td style={{ ...tdS, textAlign: 'right', fontWeight: 700, fontSize: 13, color: '#333', whiteSpace: 'nowrap', fontVariantNumeric: 'tabular-nums' }}>
                            R$ {fmt(o.total)}
                          </td>
                          <td style={{ ...tdS, textAlign: 'center' }}>
                            {action ? (
                              <button onClick={() => updateStatus(o.id, action.next)}
                                style={{ background: '#6A1B9A', color: 'white', border: 'none', borderRadius: 8, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                {action.label}
                              </button>
                            ) : <span style={{ color: '#ddd', fontSize: 12 }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      </div>
    );
  }

  return (
    <div style={{ paddingBottom: isDesktop ? 0 : 72 }}>

      {/* ─── SIDEBAR DESKTOP ─────────────────────── */}
      {isDesktop && (
        <div style={{
          position: 'fixed', left: 0, top: 0, bottom: 0, width: 240,
          background: 'white', borderRight: '1px solid var(--border)',
          display: 'flex', flexDirection: 'column', zIndex: 100
        }}>
          {/* Marca */}
          <div style={{ padding: '16px 16px 14px', borderBottom: '1px solid var(--border)' }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              {storeData?.logo ? (
                <img src={storeData.logo} alt="Logo"
                  style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                  onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <div style={{
                  width: 56, height: 56, borderRadius: '50%', flexShrink: 0,
                  background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 800, fontSize: 24
                }}>{(storeData?.name || 'L').charAt(0)}</div>
              )}
            </div>
          </div>

          {/* Navegação */}
          <nav style={{ flex: 1, overflowY: 'auto', padding: '10px 0' }}>
            <div style={{ padding: '4px 16px 6px', fontSize: 10, fontWeight: 700, color: '#bbb', letterSpacing: 1, textTransform: 'uppercase' }}>Operação</div>
            {[
              { key: 'painel',     svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg>, label: 'Painel', onClick: () => { setView('painel'); setPerfilTab(null); }, active: view === 'painel' && !perfilTab, badge: pendingOrders.length || null },
              { key: 'pedidos',   svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg>, label: 'Pedidos', onClick: () => { setView('pedidos'); setPerfilTab(null); }, active: view === 'pedidos' && !perfilTab, badge: pendingOrders.length || null },
              { key: 'produtos',  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg>, label: 'Produtos', onClick: () => { setView('produtos'); setPerfilTab(null); }, active: view === 'produtos' && !perfilTab },
              { key: 'financeiro',svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg>, label: 'Financeiro', isPremium: true, onClick: () => { if (storeData?.plan === 'premium') { setView('financeiro'); setPerfilTab(null); } else { setShowUpgradeModal(true); } }, active: view === 'financeiro' && !perfilTab },
            ].map(item => (
              <div key={item.key} onClick={item.onClick}
                style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', margin: '1px 8px', cursor: 'pointer', borderRadius: 8, background: item.active ? '#F3E5F5' : 'transparent', color: item.active ? 'var(--primary)' : (item.isPremium && storeData?.plan !== 'premium' ? '#bbb' : '#555'), fontWeight: item.active ? 700 : 500, fontSize: 13 }}>
                <span style={{ flexShrink: 0, display: 'flex' }}>{item.svg}</span>
                <span style={{ flex: 1 }}>{item.label}</span>
                {item.isPremium && storeData?.plan !== 'premium' && <span style={{ fontSize: 9, background: '#1a1a1a', color: 'white', borderRadius: 4, padding: '1px 5px', fontWeight: 700 }}>PRO</span>}
                {item.badge > 0 && <span style={{ background: 'var(--primary)', color: 'white', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 5px', minWidth: 18, textAlign: 'center' }}>{item.badge}</span>}
              </div>
            ))}

            <div style={{ padding: '10px 16px 6px', fontSize: 10, fontWeight: 700, color: '#bbb', letterSpacing: 1, textTransform: 'uppercase', marginTop: 4 }}>Configurações</div>
            {[
              { key: 'dados',       svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/><polyline points="9 22 9 12 15 12 15 22"/></svg>, label: 'Dados da Loja' },
              { key: 'endereco',    svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 10c0 7-9 13-9 13S3 17 3 10a9 9 0 0 1 18 0z"/><circle cx="12" cy="10" r="3"/></svg>, label: 'Endereço' },
              { key: 'motoboy',     svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="5.5" cy="17.5" r="3.5"/><circle cx="18.5" cy="17.5" r="3.5"/><path d="M15 6h-5l-3 8h11l-2-6"/><path d="M9 6l1-4h6"/></svg>, label: 'Entregadores' },
              { key: 'mensagens',   svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>, label: 'Mensagens', badge: unreadMessages || null },
              { key: 'assinatura',  svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"/></svg>, label: 'Assinatura' },
              { key: 'trocar-senha',svg: <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="11" width="18" height="11" rx="2" ry="2"/><path d="M7 11V7a5 5 0 0 1 10 0v4"/></svg>, label: 'Senha' },
            ].map(item => {
              const isActive = view === 'perfil' && perfilTab === item.key;
              return (
                <div key={item.key} onClick={() => { setView('perfil'); setPerfilTab(item.key); }}
                  style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px', margin: '1px 8px', cursor: 'pointer', borderRadius: 8, background: isActive ? '#F3E5F5' : 'transparent', color: isActive ? 'var(--primary)' : '#555', fontWeight: isActive ? 700 : 500, fontSize: 13 }}>
                  <span style={{ flexShrink: 0, display: 'flex' }}>{item.svg}</span>
                  <span style={{ flex: 1 }}>{item.label}</span>
                  {item.badge > 0 && <span style={{ background: '#C62828', color: 'white', borderRadius: 10, fontSize: 10, fontWeight: 700, padding: '1px 5px', minWidth: 18, textAlign: 'center' }}>{item.badge}</span>}
                </div>
              );
            })}
          </nav>

          {/* Rodapé sidebar */}
          <div style={{ padding: '12px 16px', borderTop: '1px solid var(--border)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            <button onClick={() => { if (storeData?.plan === 'premium') { setShowTV(true); } else { setShowUpgradeModal(true); } }}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '8px 12px', background: '#1a1a1a', color: 'white', border: 'none', borderRadius: 8, fontSize: 13, fontWeight: 600, cursor: 'pointer' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="2" y="7" width="20" height="15" rx="2"/><polyline points="17 2 12 7 7 2"/></svg>
              Ver na TV {storeData?.plan !== 'premium' && <span style={{ fontSize: 9, background: 'rgba(255,255,255,0.2)', borderRadius: 3, padding: '1px 4px', fontWeight: 700 }}>PRO</span>}
            </button>
            <button onClick={logout}
              style={{ width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, padding: '7px 12px', background: 'none', color: '#888', border: '1px solid #eee', borderRadius: 8, fontSize: 13, fontWeight: 500, cursor: 'pointer' }}>
              <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4"/><polyline points="16 17 21 12 16 7"/><line x1="21" y1="12" x2="9" y2="12"/></svg>
              Sair
            </button>
          </div>
        </div>
      )}

      {/* ─── ALERTA MOTOBOY CHEGANDO ─────────────── */}
      {motoboyAlert && (
        <div style={{
          position: 'fixed', top: 20, left: '50%', transform: 'translateX(-50%)',
          zIndex: 99999, background: motoboyAlert.type === 'approaching' ? '#1b2e1a' : '#1a1a2e',
          color: 'white', borderRadius: 16, padding: '14px 24px',
          boxShadow: '0 8px 32px rgba(0,0,0,0.4)',
          display: 'flex', alignItems: 'center', gap: 12,
          border: `2px solid ${motoboyAlert.type === 'approaching' ? '#43a047' : '#6A1B9A'}`,
          animation: 'pulse-border 0.6s infinite alternate',
          minWidth: 300, maxWidth: 420
        }}>
          <span style={{ fontSize: 30 }}>🛵</span>
          <div style={{ flex: 1 }}>
            {motoboyAlert.type === 'approaching' ? (
              <>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Entregador chegando na loja!</div>
                <div style={{ fontSize: 13, opacity: 0.85, marginTop: 2 }}>
                  {motoboyAlert.name} · <strong style={{ color: '#81c784' }}>{motoboyAlert.distanceMeters}m</strong> da loja
                </div>
              </>
            ) : (
              <>
                <div style={{ fontWeight: 800, fontSize: 15 }}>Entregador aceitou o pedido!</div>
                <div style={{ fontSize: 13, opacity: 0.8, marginTop: 2 }}>{motoboyAlert.name} está a caminho da loja</div>
              </>
            )}
          </div>
          <button onClick={() => setMotoboyAlert(null)} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.5)', fontSize: 18, cursor: 'pointer', padding: 4 }}>✕</button>
        </div>
      )}

      {/* ─── ÁREA PRINCIPAL ─────────────────────── */}
      <div style={{ marginLeft: isDesktop ? 240 : 0 }}>

        {/* Header */}
        <div className="header" style={{ padding: '8px 16px' }}>
          {isDesktop ? (
            <>
              <div className="header-left" style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <span style={{ fontWeight: 700, fontSize: 15, color: '#1a1a1a' }}>Olá, {storeData?.name || 'Loja'}</span>
                <div className="toggle-switch" onClick={toggleOpen} title={open ? 'Fechar loja' : 'Abrir loja'} style={{ transform: 'scale(0.85)', transformOrigin: 'left center' }}>
                  <input type="checkbox" checked={open} readOnly />
                  <span className="toggle-slider" />
                </div>
                <span style={{ fontSize: 11, fontWeight: 600, color: open ? 'var(--success)' : 'var(--danger)' }}>
                  {open ? 'Aberta' : 'Fechada'}
                </span>
              </div>
              <div className="header-right" style={{ gap: 8 }}>
                {view === 'painel' && (
                  <select value={dashLayout} onChange={e => setDashLayout(e.target.value)}
                    style={{ fontSize: 13, padding: '5px 10px', borderRadius: 8, border: '1px solid #ddd', background: 'white', cursor: 'pointer', color: '#555', fontWeight: 500 }}>
                    <option value="kanban">⊞  Kanban</option>
                    <option value="fila">📋  Fila</option>
                    <option value="linha">≡  Lista compacta</option>
                  </select>
                )}
                {/* Sino de notificações */}
                <div style={{ position: 'relative' }}>
                  <div style={{ cursor: 'pointer', position: 'relative' }} onClick={() => {
                    const opening = !notifOpen;
                    setNotifOpen(opening);
                    if (opening) {
                      const now = new Date().toISOString();
                      localStorage.setItem('notif_last_seen', now);
                      setNotifLastSeen(now);
                    }
                  }}>
                    {(() => {
                      const count = notifLastSeen
                        ? notifList.filter(n => new Date(n.created_at) > new Date(notifLastSeen)).length
                        : notifList.length;
                      return count > 0 ? (
                        <div style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: '#C62828', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                          {count > 9 ? '9+' : count}
                        </div>
                      ) : null;
                    })()}
                    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                      <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                    </svg>
                  </div>
                  {notifOpen && (
                    <>
                      <div style={{ position: 'fixed', inset: 0, zIndex: 998 }} onClick={() => setNotifOpen(false)} />
                      <div style={{ position: 'absolute', top: 34, right: 0, width: 320, maxHeight: 420, overflowY: 'auto', background: 'white', borderRadius: 14, boxShadow: '0 8px 32px rgba(0,0,0,0.15)', border: '1px solid #eee', zIndex: 999 }}>
                        <div style={{ padding: '12px 16px', fontWeight: 700, fontSize: 14, borderBottom: '1px solid #f0f0f0', color: '#1a1a1a' }}>
                          Notificações
                        </div>
                        {notifList.length === 0 ? (
                          <div style={{ padding: 32, textAlign: 'center', color: '#aaa', fontSize: 13 }}>Nenhuma notificação</div>
                        ) : notifList.map(n => {
                          const isNew = notifLastSeen ? new Date(n.created_at) > new Date(notifLastSeen) : false;
                          const icon = { order: '🛒', delivery: '📦', payment: '💰', message: '💬' }[n.type] || '🔔';
                          return (
                            <div key={n.id} onClick={() => {
                              if (n.type === 'message') { setView('perfil'); setPerfilTab('mensagens'); setNotifOpen(false); }
                            }} style={{ display: 'flex', gap: 10, padding: '11px 16px', borderBottom: '1px solid #f5f5f5', background: isNew ? '#fdf8ff' : 'white', cursor: n.type === 'message' ? 'pointer' : 'default' }}>
                              <span style={{ fontSize: 18, flexShrink: 0, marginTop: 1 }}>{icon}</span>
                              <div style={{ flex: 1, minWidth: 0 }}>
                                <div style={{ fontWeight: isNew ? 700 : 500, fontSize: 13, color: '#1a1a1a' }}>{n.title}</div>
                                <div style={{ fontSize: 12, color: '#888', marginTop: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{n.body}</div>
                                <div style={{ fontSize: 11, color: '#bbb', marginTop: 2 }}>
                                  {new Date(n.created_at).toLocaleString('pt-BR', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}
                                </div>
                              </div>
                              {isNew && <div style={{ width: 7, height: 7, borderRadius: '50%', background: '#6A1B9A', flexShrink: 0, marginTop: 5 }} />}
                            </div>
                          );
                        })}
                      </div>
                    </>
                  )}
                </div>
              </div>
            </>
          ) : (
            <>
              <div className="header-left">
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  {storeData?.logo ? (
                    <img src={storeData.logo} alt="Logo"
                      style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0, cursor: 'pointer' }}
                      onClick={() => { setView('perfil'); setPerfilTab(null); }}
                      onError={e => { e.target.style.display = 'none'; }} />
                  ) : (
                    <div style={{ width: 34, height: 34, borderRadius: '50%', background: 'linear-gradient(135deg, var(--primary), var(--primary-dark))', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 15, flexShrink: 0, cursor: 'pointer' }}
                      onClick={() => { setView('perfil'); setPerfilTab(null); }}>
                      {(storeData?.name || 'L').charAt(0)}
                    </div>
                  )}
                  <span style={{ fontSize: 15, fontWeight: 800, color: '#1a1a1a', maxWidth: 130, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {storeData?.name || 'Loja'}
                  </span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 5, cursor: 'pointer', padding: '3px 8px', borderRadius: 20, background: open ? '#E8F5E9' : '#F5F5F5', border: `1px solid ${open ? '#A8D5B5' : '#DDD'}` }} onClick={toggleOpen}>
                    <div style={{ width: 7, height: 7, borderRadius: '50%', background: open ? '#1B8A3A' : '#9E9E9E', boxShadow: open ? '0 0 0 2px rgba(27,138,58,0.25)' : 'none', flexShrink: 0 }} />
                    <span style={{ fontSize: 11, fontWeight: 700, color: open ? '#1B8A3A' : '#9E9E9E', letterSpacing: 0.2 }}>{open ? 'Aberta' : 'Fechada'}</span>
                  </div>
                </div>
              </div>
              <div className="header-right" style={{ gap: 8 }}>
                <div style={{ position: 'relative', cursor: 'pointer' }}
                  onClick={() => { setView('perfil'); setPerfilTab('mensagens'); }}>
                  {unreadMessages > 0 && (
                    <div style={{ position: 'absolute', top: -4, right: -4, width: 18, height: 18, borderRadius: '50%', background: '#C62828', color: 'white', fontSize: 10, fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>{unreadMessages > 9 ? '9+' : unreadMessages}</div>
                  )}
                  <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="var(--text-light)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Conteúdo */}
        <div className="container">
          {perfilTab && view === 'perfil' ? (
            <div>
              {!isDesktop && (
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
                  <div onClick={() => setPerfilTab(null)} style={{ width: 36, height: 36, borderRadius: '50%', background: '#F3E5F5', display: 'flex', alignItems: 'center', justifyContent: 'center', cursor: 'pointer', fontSize: 18, fontWeight: 700, color: '#6A1B9A', flexShrink: 0 }}>‹</div>
                  <span style={{ fontWeight: 700, fontSize: 16 }}>{perfilTab === 'dados' ? 'Dados' : perfilTab === 'endereco' ? 'Endereço' : perfilTab === 'trocar-senha' ? 'Trocar Senha' : perfilTab === 'mensagens' ? 'Mensagens' : perfilTab === 'vendas' ? 'Vendas' : perfilTab === 'motoboy' ? 'Entregadores' : perfilTab === 'assinatura' ? 'Assinatura' : ''}</span>
                </div>
              )}
              {perfilTab === 'dados' && PerfilView()}
              {perfilTab === 'endereco' && <StoreAddressForm settings={settings} setSettings={setSettings} saveSettings={saveSettings} uploading={uploading} saveMsg={saveMsg} setSaveMsg={setSaveMsg} />}
              {perfilTab === 'trocar-senha' && PerfilView()}
              {perfilTab === 'mensagens' && <StoreMessages messages={storeMessages} storeId={storeData?.id} apiFetch={apiFetch} onReload={loadMessages} />}
              {perfilTab === 'vendas' && FinanceiroTab()}
              {perfilTab === 'motoboy' && PerfilView()}
              {perfilTab === 'assinatura' && PerfilView()}
            </div>
          ) : view === 'painel' ? (
            PainelView()
          ) : view === 'pedidos' ? (
            PedidosView()
          ) : view === 'produtos' ? (
            ProdutosView()
          ) : view === 'financeiro' ? (
            FinanceiroTab()
          ) : view === 'perfil' ? (
            PerfilView()
          ) : null}
        </div>

        {/* Nav mobile (bottom) */}
        {!isDesktop && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: 'white', borderTop: '1px solid #eee',
            display: 'flex', zIndex: 1000,
            paddingBottom: 'env(safe-area-inset-bottom, 0px)'
          }}>
            {[
              { key: 'painel', label: 'Painel', svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7" rx="1"/><rect x="14" y="3" width="7" height="7" rx="1"/><rect x="3" y="14" width="7" height="7" rx="1"/><rect x="14" y="14" width="7" height="7" rx="1"/></svg> },
              { key: 'pedidos', label: 'Pedidos', svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="9" y1="6" x2="20" y2="6"/><line x1="9" y1="12" x2="20" y2="12"/><line x1="9" y1="18" x2="20" y2="18"/><circle cx="4" cy="6" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="12" r="1.2" fill="currentColor" stroke="none"/><circle cx="4" cy="18" r="1.2" fill="currentColor" stroke="none"/></svg> },
              { key: 'produtos', label: 'Cardápio', alignRight: true, svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z"/><polyline points="3.27 6.96 12 12.01 20.73 6.96"/><line x1="12" y1="22.08" x2="12" y2="12"/></svg> },
              { key: 'financeiro', label: 'Financeiro', isPremium: true, alignRight: true, svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="20" x2="18" y2="10"/><line x1="12" y1="20" x2="12" y2="4"/><line x1="6" y1="20" x2="6" y2="14"/></svg> },
              { key: 'perfil', label: 'Perfil', svg: <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2"/><circle cx="12" cy="7" r="4"/></svg> },
            ].map(item => {
              const isActive = view === item.key || (item.key === 'perfil' && !!perfilTab);
              return (
                <div key={item.key} style={{
                  flex: 1, textAlign: item.alignRight ? 'right' : 'center', padding: '8px 4px', cursor: 'pointer',
                  borderTop: isActive ? '2px solid #6A1B9A' : '2px solid transparent',
                }} onClick={() => {
                  if (item.isPremium && storeData?.plan !== 'premium') { setShowUpgradeModal(true); return; }
                  setView(item.key); if (item.key !== 'perfil') setPerfilTab(null);
                }}>
                  <div style={{ color: isActive ? '#6A1B9A' : '#bbb', display: 'flex', justifyContent: item.alignRight ? 'flex-end' : 'center' }}>
                    {item.svg}
                  </div>
                  <div style={{ fontSize: 10, fontWeight: isActive ? 700 : 400, color: isActive ? '#6A1B9A' : '#bbb', marginTop: 2 }}>
                    {item.label}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ─── MODAL UPGRADE PREMIUM ────────────── */}
      {showUpgradeModal && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.55)', zIndex: 99998, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}
          onClick={() => setShowUpgradeModal(false)}>
          <div style={{ background: 'white', borderRadius: 20, padding: 28, maxWidth: 380, width: '100%', boxShadow: '0 20px 60px rgba(0,0,0,0.2)' }}
            onClick={e => e.stopPropagation()}>
            <div style={{ textAlign: 'center', marginBottom: 20 }}>
              <div style={{ fontSize: 20, fontWeight: 800, color: '#1a1a1a' }}>Plano Loja</div>
              <div style={{ fontSize: 14, color: '#888', marginTop: 6, lineHeight: 1.5 }}>Este recurso faz parte do plano pago.</div>
            </div>
            <div style={{ background: '#fafafa', borderRadius: 12, padding: '14px 16px', marginBottom: 20, border: '1px solid #eee' }}>
              {[
                'Relatório financeiro completo',
                'Tela de TV (modo operação)',
                'Entregadores ilimitados',
                'Dashboard de desempenho',
                'Exportação de dados CSV',
                'Suporte prioritário WhatsApp',
              ].map((f, i) => (
                <div key={i} style={{ fontSize: 13, color: '#555', marginBottom: 6, display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="#6A1B9A" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><polyline points="20 6 9 17 4 12"/></svg>
                  {f}
                </div>
              ))}
            </div>
            <div style={{ textAlign: 'center', marginBottom: 16 }}>
              <div style={{ fontSize: 11, color: '#aaa', marginBottom: 4 }}>1 mês grátis · sem comissão por pedido</div>
              <div style={{ fontSize: 28, fontWeight: 800, color: '#1a1a1a' }}>R$ 129<span style={{ fontSize: 14, fontWeight: 400, color: '#888' }}>/mês</span></div>
            </div>
            <button
              onClick={() => { setShowUpgradeModal(false); setView('perfil'); setPerfilTab('assinatura'); }}
              style={{ width: '100%', background: 'linear-gradient(135deg, #6A1B9A, #9C27B0)', color: 'white', border: 'none', borderRadius: 12, padding: '14px 0', fontSize: 15, fontWeight: 700, cursor: 'pointer', marginBottom: 10 }}>
              Ver planos →
            </button>
            <button onClick={() => setShowUpgradeModal(false)}
              style={{ width: '100%', background: 'none', border: 'none', color: '#aaa', fontSize: 13, cursor: 'pointer', padding: 8 }}>
              Agora não
            </button>
          </div>
        </div>
      )}

      {/* ─── TV OVERLAY ─────────────────────── */}
      {showTV && (() => {
        const tvBg = tvLight ? '#f0f2f5' : '#0d0d1a';
        const tvCard = tvLight ? 'white' : 'rgba(255,255,255,0.05)';
        const tvText = tvLight ? '#1a1a1a' : 'white';
        const tvSub = tvLight ? '#666' : 'rgba(255,255,255,0.45)';
        const tvDivider = tvLight ? '#e8e8e8' : 'rgba(255,255,255,0.07)';
        const tvHdrBg = tvLight ? 'white' : 'rgba(10,10,30,0.95)';
        const tvHdrBorder = tvLight ? '#e0e0e0' : 'rgba(255,255,255,0.07)';
        const tvStatBg = tvLight ? '#f8f8f8' : 'rgba(255,255,255,0.06)';
        const tvStatBorder = tvLight ? '#e0e0e0' : 'rgba(255,255,255,0.1)';

        const tvActive = pendingOrders;
        const cntPronto = tvActive.filter(o => o.status === 'ready').length;
        const cntPrep = tvActive.filter(o => ['confirmed', 'preparing'].includes(o.status)).length;
        const cntCaminho = tvActive.filter(o => ['assigned', 'picked_up', 'in_transit', 'arriving'].includes(o.status)).length;

        // Groups for kanban view
        const tvGroups = [
          { label: 'PREPARAR',        emoji: '🔥', color: '#E65100', bg: 'rgba(230,81,0,0.1)',    border: 'rgba(230,81,0,0.28)',    orders: tvActive.filter(o => o.status === 'confirmed') },
          { label: 'PREPARANDO',      emoji: '⏳', color: '#1e88e5', bg: 'rgba(30,136,229,0.08)', border: 'rgba(30,136,229,0.25)', orders: tvActive.filter(o => o.status === 'preparing') },
          { label: 'PRONTO',          emoji: '✅', color: '#00a844', bg: 'rgba(0,168,68,0.1)',    border: 'rgba(0,168,68,0.28)',    orders: tvActive.filter(o => o.status === 'ready') },
          { label: 'MOTOBOY NA LOJA', emoji: '🛵', color: '#8e24aa', bg: 'rgba(142,36,170,0.08)', border: 'rgba(142,36,170,0.25)', orders: tvActive.filter(o => o.status === 'assigned') },
          { label: 'SAIU',            emoji: '🚀', color: '#00695C', bg: 'rgba(0,105,92,0.08)',  border: 'rgba(0,105,92,0.25)',   orders: tvActive.filter(o => ['picked_up', 'in_transit', 'arriving'].includes(o.status)) },
        ].filter(g => g.orders.length > 0);

        const btnBase = { width: 44, height: 44, borderRadius: 10, fontSize: 20, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', border: tvLight ? '1px solid #ddd' : '1px solid rgba(255,255,255,0.12)' };

        // QR code — canto inferior direito da TV
        const qrBg = tvLight ? 'f0f2f5' : '0d0d1a';
        const qrFg = tvLight ? '1a1a1a' : 'ffffff';
        const qrUrl = `https://api.qrserver.com/v1/create-qr-code/?size=160x160&data=${encodeURIComponent(window.location.origin)}&bgcolor=${qrBg}&color=${qrFg}&qzone=1`;

        // ── View 1: KANBAN ────────────────────────────────────────────────────
        const renderKanban = () => (
          <div ref={tvScrollRef} style={{ flex: 1, overflow: 'auto', padding: '20px 28px', paddingBottom: 140 }}>
            {tvActive.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: tvSub, fontSize: 22, fontWeight: 600 }}>
                Nenhum pedido ativo no momento
              </div>
            ) : (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 24 }}>
                {tvGroups.map(group => (
                  <div key={group.label}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 12, padding: '6px 14px', background: group.bg, borderRadius: 8, border: `1px solid ${group.border}`, width: 'fit-content' }}>
                      <span style={{ fontSize: 15 }}>{group.emoji}</span>
                      <span style={{ color: group.color, fontSize: 13, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase' }}>{group.label}</span>
                      <span style={{ color: group.color, fontSize: 13, fontWeight: 700, opacity: 0.75 }}>· {group.orders.length}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: `repeat(${window.innerWidth >= 2560 ? 5 : window.innerWidth >= 1920 ? 4 : 3}, 1fr)`, gap: 14 }}>
                      {group.orders.map(o => {
                        const action = getAction(o);
                        return (
                          <div key={o.id} data-tv-card="1" style={{ background: tvCard, borderRadius: 14, padding: '18px 20px', border: `1px solid ${group.border}` }}>
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 10 }}>
                              <div style={{ color: tvText, fontWeight: 800, fontSize: 18, lineHeight: 1.3 }}>{o.customer_name}</div>
                              <span style={{ color: group.color, fontSize: 12, fontWeight: 700, background: group.bg, padding: '3px 10px', borderRadius: 6, border: `1px solid ${group.border}`, whiteSpace: 'nowrap', marginLeft: 10, flexShrink: 0 }}>
                                {group.emoji} {group.label}
                              </span>
                            </div>
                            <div style={{ borderTop: `1px solid ${tvDivider}`, paddingTop: 10, marginBottom: 8 }}>
                              <div style={{ color: tvSub, fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 6 }}>Detalhes do Pedido</div>
                              {(o.items || o.order_items || []).map((it, i) => (
                                <div key={i} style={{ color: tvText, fontSize: 15, marginBottom: 3, fontWeight: 500 }}>
                                  {it.quantity}x {it.product_name || it.products?.name || 'Produto'}
                                </div>
                              ))}
                            </div>
                            {o.motoboy_name && (
                              <div style={{ color: tvSub, fontSize: 14, marginBottom: 8 }}>
                                🛵 <span style={{ color: tvText, fontWeight: 800, fontSize: 17 }}>{o.motoboy_name}</span>
                              </div>
                            )}
                            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginTop: 10, paddingTop: 10, borderTop: `1px solid ${tvDivider}` }}>
                              <div>
                                <div style={{ color: tvSub, fontSize: 12 }}>#{String(o.id).slice(-4)} · {new Date(o.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}</div>
                                {tvShowPrices && <div style={{ color: group.color, fontWeight: 800, fontSize: 18, marginTop: 2 }}>R$ {fmt(o.total)}</div>}
                              </div>
                              {action && (
                                <button onClick={() => updateStatus(o.id, action.next)}
                                  style={{ background: group.color, color: 'white', border: 'none', borderRadius: 10, padding: '10px 16px', fontSize: 14, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                                  {action.label}
                                </button>
                              )}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        );

        // ── View 2: FILA (virado para o cliente) ─────────────────────────────
        const filaPrep = tvActive.filter(o => ['confirmed', 'preparing', 'ready', 'assigned'].includes(o.status));
        const filaCaminho = tvActive.filter(o => ['picked_up', 'in_transit', 'arriving'].includes(o.status));
        const filaStatusLabel = { confirmed: 'Confirmado', preparing: 'Preparando...', ready: 'Pronto! ✅', assigned: 'Entregador chegou 🛵' };
        const filaStatusColor = { confirmed: '#E65100', preparing: '#1e88e5', ready: '#00a844', assigned: '#8e24aa' };

        const renderFila = () => (
          <div ref={tvScrollRef} style={{ flex: 1, overflow: 'auto', padding: '16px 28px', paddingBottom: 140 }}>
            {tvActive.length === 0 ? (
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', color: tvSub, gap: 12 }}>
                <span style={{ fontSize: 56 }}>🍇</span>
                <span style={{ fontSize: 24, fontWeight: 600 }}>Nenhum pedido ativo no momento</span>
              </div>
            ) : (
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 24, alignItems: 'start' }}>
                {/* Coluna esquerda — Em Preparo */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 18px', background: 'rgba(30,136,229,0.1)', borderRadius: 10, border: '1px solid rgba(30,136,229,0.3)' }}>
                    <span style={{ fontSize: 22 }}>🍳</span>
                    <span style={{ color: '#1e88e5', fontSize: 15, fontWeight: 900, letterSpacing: 1.5, textTransform: 'uppercase' }}>Em Preparo</span>
                    <span style={{ color: '#1e88e5', fontSize: 22, fontWeight: 800, marginLeft: 'auto' }}>{filaPrep.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {filaPrep.length === 0 ? (
                      <div style={{ color: tvSub, fontSize: 16, textAlign: 'center', padding: '40px 0', fontStyle: 'italic' }}>Nenhum pedido em preparo</div>
                    ) : filaPrep.map(o => (
                      <div key={o.id} data-tv-card="1" style={{ background: tvCard, borderRadius: 14, padding: '16px 20px', border: `1px solid ${tvDivider}`, borderLeft: `5px solid ${filaStatusColor[o.status] || '#1e88e5'}` }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div style={{ color: tvText, fontWeight: 900, fontSize: 26, lineHeight: 1.2 }}>{o.customer_name}</div>
                          <span style={{ color: filaStatusColor[o.status] || '#1e88e5', fontSize: 12, fontWeight: 800, background: `${filaStatusColor[o.status]}22`, padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap', marginLeft: 10, flexShrink: 0 }}>
                            {filaStatusLabel[o.status] || o.status}
                          </span>
                        </div>
                        {/* Itens do pedido */}
                        <div style={{ borderTop: `1px solid ${tvDivider}`, paddingTop: 8, marginBottom: 6 }}>
                          {(o.items || o.order_items || []).map((it, i) => (
                            <div key={i} style={{ color: tvText, fontSize: 15, fontWeight: 600, lineHeight: 1.6 }}>
                              {it.quantity}× {it.product_name || it.products?.name || 'Produto'}
                            </div>
                          ))}
                        </div>
                        <div style={{ color: tvSub, fontSize: 12 }}>#{String(o.id).slice(-4)}</div>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Coluna direita — Saiu para Entrega */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14, padding: '10px 18px', background: 'rgba(0,105,92,0.1)', borderRadius: 10, border: '1px solid rgba(0,105,92,0.3)' }}>
                    <span style={{ fontSize: 22 }}>🛵</span>
                    <span style={{ color: '#00695C', fontSize: 15, fontWeight: 900, letterSpacing: 1.5, textTransform: 'uppercase' }}>Saiu para Entrega</span>
                    <span style={{ color: '#00695C', fontSize: 22, fontWeight: 800, marginLeft: 'auto' }}>{filaCaminho.length}</span>
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
                    {filaCaminho.length === 0 ? (
                      <div style={{ color: tvSub, fontSize: 16, textAlign: 'center', padding: '40px 0', fontStyle: 'italic' }}>Nenhum pedido a caminho</div>
                    ) : filaCaminho.map(o => (
                      <div key={o.id} data-tv-card="1" style={{ background: tvCard, borderRadius: 14, padding: '16px 20px', border: `1px solid ${tvDivider}`, borderLeft: '5px solid #00695C' }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 8 }}>
                          <div style={{ color: tvText, fontWeight: 900, fontSize: 26, lineHeight: 1.2 }}>{o.customer_name}</div>
                          <span style={{ color: '#00695C', fontSize: 12, fontWeight: 800, background: 'rgba(0,105,92,0.12)', padding: '4px 10px', borderRadius: 20, whiteSpace: 'nowrap', marginLeft: 10, flexShrink: 0 }}>
                            A caminho 🚀
                          </span>
                        </div>
                        {/* Itens do pedido */}
                        <div style={{ borderTop: `1px solid ${tvDivider}`, paddingTop: 8, marginBottom: 6 }}>
                          {(o.items || o.order_items || []).map((it, i) => (
                            <div key={i} style={{ color: tvText, fontSize: 15, fontWeight: 600, lineHeight: 1.6 }}>
                              {it.quantity}× {it.product_name || it.products?.name || 'Produto'}
                            </div>
                          ))}
                        </div>
                        <div style={{ color: tvSub, fontSize: 13 }}>
                          {o.motoboy_name ? `🛵 ${o.motoboy_name}` : `#${String(o.id).slice(-4)}`}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            )}
          </div>
        );

        // ── View 3: LINHA — lista compacta KDS ───────────────────────────────
        const urgencyOrder = { arriving: 0, in_transit: 1, picked_up: 2, assigned: 3, ready: 4, preparing: 5, confirmed: 6 };
        const linhaOrders = [...tvActive].sort((a, b) => (urgencyOrder[a.status] ?? 99) - (urgencyOrder[b.status] ?? 99));
        const linhaStatusInfo = {
          confirmed:  { label: 'Novo',        color: '#E65100', bg: 'rgba(230,81,0,0.12)' },
          preparing:  { label: 'Preparando',  color: '#1e88e5', bg: 'rgba(30,136,229,0.12)' },
          ready:      { label: 'Pronto ✅',   color: '#00a844', bg: 'rgba(0,168,68,0.12)' },
          assigned:   { label: 'Entregador 🛵',  color: '#8e24aa', bg: 'rgba(142,36,170,0.12)' },
          picked_up:  { label: 'Saiu 🚀',     color: '#00695C', bg: 'rgba(0,105,92,0.12)' },
          in_transit: { label: 'A caminho',   color: '#00695C', bg: 'rgba(0,105,92,0.12)' },
          arriving:   { label: 'Saiu pra entrega', color: '#00695C', bg: 'rgba(0,105,92,0.12)' },
        };
        const thS = { color: tvSub, fontSize: 11, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.8, padding: '10px 14px', borderBottom: `2px solid ${tvDivider}`, whiteSpace: 'nowrap', textAlign: 'left' };
        const tdS = { padding: '11px 14px', borderBottom: `1px solid ${tvDivider}`, verticalAlign: 'middle' };

        const renderLinha = () => (
          <div ref={tvScrollRef} style={{ flex: 1, overflow: 'auto', padding: '16px 24px', paddingBottom: 140 }}>
            {tvActive.length === 0 ? (
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100%', color: tvSub, fontSize: 22, fontWeight: 600 }}>
                Nenhum pedido ativo no momento
              </div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', background: tvCard, borderRadius: 14, overflow: 'hidden', border: `1px solid ${tvDivider}` }}>
                <thead>
                  <tr style={{ background: tvLight ? '#f8f8f8' : 'rgba(255,255,255,0.04)' }}>
                    <th style={thS}>Hora</th>
                    <th style={thS}>#</th>
                    <th style={thS}>Cliente</th>
                    <th style={thS}>Itens</th>
                    <th style={{ ...thS, textAlign: 'center' }}>Status</th>
                    <th style={thS}>Entregador</th>
                    {tvShowPrices && <th style={{ ...thS, textAlign: 'right' }}>Valor</th>}
                    <th style={{ ...thS, textAlign: 'center', width: 160 }}>Ação</th>
                  </tr>
                </thead>
                <tbody>
                  {linhaOrders.map((o, idx) => {
                    const action = getAction(o);
                    const si = linhaStatusInfo[o.status] || { label: o.status, color: tvSub, bg: tvStatBg };
                    return (
                      <tr key={o.id} data-tv-card="1" style={{ background: idx % 2 === 0 ? 'transparent' : tvLight ? 'rgba(0,0,0,0.02)' : 'rgba(255,255,255,0.02)' }}>
                        <td style={{ ...tdS, color: tvSub, fontSize: 14, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                          {new Date(o.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                        </td>
                        <td style={{ ...tdS, color: tvSub, fontSize: 13, fontFamily: 'monospace' }}>
                          …{String(o.id).slice(-4)}
                        </td>
                        <td style={{ ...tdS, color: tvText, fontWeight: 800, fontSize: 18, whiteSpace: 'nowrap' }}>
                          {o.customer_name}
                        </td>
                        <td style={{ ...tdS, color: tvText, fontSize: 14, maxWidth: 280 }}>
                          {(o.items || o.order_items || []).map((it, i) => (
                            <span key={i} style={{ display: 'block', lineHeight: 1.5 }}>
                              {it.quantity}× {it.product_name || it.products?.name || 'Produto'}
                            </span>
                          ))}
                        </td>
                        <td style={{ ...tdS, textAlign: 'center' }}>
                          <span style={{ color: si.color, fontWeight: 800, fontSize: 12, background: si.bg, padding: '4px 12px', borderRadius: 20, whiteSpace: 'nowrap' }}>
                            {si.label}
                          </span>
                        </td>
                        <td style={{ ...tdS, color: tvText, fontSize: 15, fontWeight: o.motoboy_name ? 700 : 400, whiteSpace: 'nowrap' }}>
                          {o.motoboy_name || <span style={{ color: tvSub, fontStyle: 'italic', fontSize: 13 }}>—</span>}
                        </td>
                        {tvShowPrices && (
                          <td style={{ ...tdS, textAlign: 'right', color: tvText, fontWeight: 800, fontSize: 16, fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>
                            R$ {fmt(o.total)}
                          </td>
                        )}
                        <td style={{ ...tdS, textAlign: 'center' }}>
                          {action ? (
                            <button onClick={() => updateStatus(o.id, action.next)}
                              style={{ background: si.color, color: 'white', border: 'none', borderRadius: 8, padding: '8px 14px', fontSize: 13, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}>
                              {action.label}
                            </button>
                          ) : <span style={{ color: tvSub, fontSize: 12 }}>—</span>}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            )}
          </div>
        );

        return (
          <div ref={tvOverlayRef} style={{ position: 'fixed', inset: 0, background: tvBg, zIndex: 9999, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

            {/* Barra superior */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 28px', borderBottom: `1px solid ${tvHdrBorder}`, flexShrink: 0, background: tvHdrBg }}>
              {storeData?.logo && (
                <img src={storeData.logo} alt="Logo" style={{ width: 42, height: 42, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
              )}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ color: tvText, fontWeight: 800, fontSize: 19, lineHeight: 1.2 }}>{storeData?.name || 'Loja'}</div>
                <div style={{ fontSize: 12, fontWeight: 600, marginTop: 2, color: open ? '#00a844' : '#e53935' }}>{open ? '● Loja Aberta' : '● Loja Fechada'}</div>
              </div>
              <div style={{ color: tvText, fontWeight: 800, fontSize: 38, fontVariantNumeric: 'tabular-nums', letterSpacing: 2 }}>{tvTime}</div>

              <div style={{ display: 'flex', gap: 7, alignItems: 'center', flexShrink: 0 }}>

                {/* Dropdown de visualização */}
                <select value={tvLayout} onChange={e => setTvLayout(e.target.value)}
                  style={{
                    height: 38, padding: '0 10px', borderRadius: 8, fontSize: 13, fontWeight: 700, cursor: 'pointer',
                    background: tvLight ? '#f0f0f0' : '#1e1e2e',
                    color: tvLight ? '#333' : 'rgba(255,255,255,0.9)',
                    border: tvLight ? '1px solid #ddd' : '1px solid rgba(255,255,255,0.18)',
                    outline: 'none', appearance: 'auto',
                    colorScheme: tvLight ? 'light' : 'dark'
                  }}>
                  <option value="kanban">⊞  Kanban</option>
                  <option value="fila">📋  Fila</option>
                  <option value="linha">≡  Lista compacta</option>
                </select>

                {/* Separador */}
                <div style={{ width: 1, height: 28, background: tvHdrBorder, margin: '0 3px' }} />

                {/* Toggle preço R$ */}
                <button onClick={() => setTvShowPrices(v => !v)} title={tvShowPrices ? 'Ocultar preços' : 'Mostrar preços'}
                  style={{ ...btnBase, fontSize: 13, fontWeight: 800,
                    background: tvShowPrices ? 'rgba(0,168,68,0.15)' : tvLight ? '#f0f0f0' : 'rgba(255,255,255,0.07)',
                    border: tvShowPrices ? '1px solid rgba(0,168,68,0.45)' : btnBase.border,
                    color: tvShowPrices ? '#00a844' : tvLight ? '#777' : 'rgba(255,255,255,0.45)' }}>
                  R$
                </button>

                {/* Separador */}
                <div style={{ width: 1, height: 28, background: tvHdrBorder, margin: '0 3px' }} />

                {/* Tema claro/escuro */}
                <button onClick={() => setTvLight(v => !v)} title={tvLight ? 'Mudar para tema escuro' : 'Mudar para tema claro'}
                  style={{ ...btnBase, background: tvLight ? '#f0f0f0' : 'rgba(255,255,255,0.07)', color: tvLight ? '#e65100' : 'rgba(255,255,255,0.6)' }}>
                  {tvLight ? (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/>
                      <line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/>
                      <line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/>
                      <line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/>
                    </svg>
                  ) : (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                      <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/>
                    </svg>
                  )}
                </button>

                {/* Cadeado */}
                <button onClick={() => setTvLocked(v => !v)} title={tvLocked ? 'Desbloquear — permite fechar' : 'Bloquear — impede fechar acidentalmente'}
                  style={{ ...btnBase, background: tvLocked ? 'rgba(255,180,0,0.15)' : tvLight ? '#f0f0f0' : 'rgba(255,255,255,0.07)', border: tvLocked ? '1px solid rgba(255,180,0,0.45)' : btnBase.border, color: tvLocked ? '#ffb400' : tvLight ? '#555' : 'rgba(255,255,255,0.5)' }}>
                  {tvLocked ? '🔒' : '🔓'}
                </button>

                {/* Fechar */}
                <button onClick={() => { if (!tvLocked) setShowTV(false); }} title={tvLocked ? 'Desbloqueie o cadeado primeiro' : 'Fechar TV'}
                  style={{ ...btnBase, background: tvLight ? '#f0f0f0' : 'rgba(255,255,255,0.05)', color: tvLocked ? (tvLight ? '#ccc' : 'rgba(255,255,255,0.15)') : tvLight ? '#333' : 'rgba(255,255,255,0.65)', cursor: tvLocked ? 'not-allowed' : 'pointer', fontWeight: 700, fontSize: 22 }}>
                  ✕
                </button>
              </div>
            </div>

            {/* Barra de stats */}
            <div style={{ display: 'flex', gap: 10, padding: '10px 28px', borderBottom: `1px solid ${tvHdrBorder}`, flexShrink: 0, background: tvHdrBg }}>
              {[
                { label: 'Ativos',     value: tvActive.length, color: tvText, bg: tvStatBg, border: tvStatBorder },
                { label: 'Prontos',    value: cntPronto, color: '#00a844', bg: 'rgba(0,168,68,0.08)', border: 'rgba(0,168,68,0.25)' },
                { label: 'Preparando', value: cntPrep, color: '#1e88e5', bg: 'rgba(30,136,229,0.08)', border: 'rgba(30,136,229,0.22)' },
                { label: 'A Caminho',  value: cntCaminho, color: '#8e24aa', bg: 'rgba(142,36,170,0.08)', border: 'rgba(142,36,170,0.22)' },
              ].map(s => (
                <div key={s.label} style={{ flex: 1, textAlign: 'center', padding: '8px 12px', background: s.bg, borderRadius: 8, border: `1px solid ${s.border}` }}>
                  <div style={{ color: tvSub, fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 1 }}>{s.label}</div>
                  <div style={{ color: s.color, fontSize: 26, fontWeight: 800, lineHeight: 1.2 }}>{s.value}</div>
                </div>
              ))}
            </div>

            {/* Conteúdo da view selecionada */}
            {tvLayout === 'kanban' && renderKanban()}
            {tvLayout === 'fila'   && renderFila()}
            {tvLayout === 'linha'  && renderLinha()}

            {/* QR fixo no canto inferior direito — aparece só quando o canto está livre */}
            <div style={{
              position: 'absolute', bottom: 24, right: 28, zIndex: 10,
              display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
              pointerEvents: 'none',
              opacity: tvQrVisible ? 0.6 : 0,
              transition: 'opacity 0.5s ease'
            }}>
              <div style={{ color: tvText, fontSize: 15, fontWeight: 800, letterSpacing: 0.5, textAlign: 'center', lineHeight: 1.2 }}>
                Vai de Açaí?
              </div>
              <img src={qrUrl} alt="QR" style={{ width: 90, height: 90, borderRadius: 8, display: 'block' }} />
              <div style={{ color: tvSub, fontSize: 9, fontWeight: 700, textTransform: 'uppercase', letterSpacing: 0.5, textAlign: 'center', lineHeight: 1.4 }}>
                Baixe o app
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
