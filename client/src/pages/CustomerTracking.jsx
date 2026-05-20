import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CustomerHeader from '../components/CustomerHeader';
import CustomerBottomNav from '../components/CustomerBottomNav';
import { useSocket } from '../contexts/SocketContext';
import { MapContainer, TileLayer, Marker } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';
import RoutePolyline from '../components/RouteMap';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
  iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
  shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
});

const statusSteps = ['pending', 'preparing', 'picked_up', 'delivered'];
const statusLabels = {
  pending: 'Pedido feito', confirmed: 'Pedido feito', preparing: 'Preparando',
  ready: 'Preparando', assigned: 'Preparando',
  picked_up: 'Saiu pra entrega', in_transit: 'Saiu pra entrega',
  arriving: 'Saiu pra entrega', delivered: 'Entregue'
};

function CustomerAvatar({ photo }) {
  const [showFallback, setShowFallback] = useState(!photo);
  if (showFallback) {
    return (
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#1565C0',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <svg width="18" height="18" viewBox="0 0 24 24" fill="white">
          <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
        </svg>
      </div>
    );
  }
  return (
    <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#1565C0' }}>
      <img src={photo} alt="Você" style={{ width: 36, height: 36, objectFit: 'cover' }}
        onError={() => setShowFallback(true)} />
    </div>
  );
}

function StoreLogo({ logo }) {
  const [showFallback, setShowFallback] = useState(!logo);
  if (showFallback) {
    return (
      <div style={{ width: 36, height: 36, borderRadius: '50%', background: '#2E7D32',
        display: 'inline-flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ color: 'white', fontSize: 16, fontWeight: 700 }}>L</span>
      </div>
    );
  }
  return (
    <div style={{ width: 36, height: 36, borderRadius: '50%', overflow: 'hidden',
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center', background: '#2E7D32' }}>
      <img src={logo} alt="Loja" style={{ width: 36, height: 36, objectFit: 'cover' }}
        onError={() => setShowFallback(true)} />
    </div>
  );
}

const GIRIAS_QUESTIONS = [
  { q: 'O que significa "Muito palha"?', ops: ['Algo feito de palha', 'Algo ruim, chato, sem graça', 'Pessoa trabalhadora', 'Uma vassoura artesanal'], a: 1 },
  { q: '"Pitiú" significa:', ops: ['Tipo de peixe pequeno', 'Cheiro ruim, fedorento', 'Bairro de Belém', 'Instrumento musical'], a: 1 },
  { q: '"Muruçoca" é o mesmo que:', ops: ['Formiga de fogo', 'Mosquito / pernilongo', 'Barata d\'água', 'Grilo da mata'], a: 1 },
  { q: '"Carapanã" é:', ops: ['Caranguejo pequeno', 'Tipo de canoa', 'Mosquito', 'Peixe de rio'], a: 2 },
  { q: '"Bicho" no Pará é usado para:', ops: ['Xingar alguém', 'Chamar animais selvagens', 'Chamar alguém carinhosamente', 'Desafiar para uma briga'], a: 2 },
  { q: '"Massa" no Pará significa:', ops: ['Ingrediente de cozinha', 'Legal, bom, excelente', 'Pessoa corpulenta', 'Muito dinheiro'], a: 1 },
  { q: '"Banzeiro" é:', ops: ['Vendedor ambulante', 'Pessoa preguiçosa', 'Agitação/ondas nas águas do rio', 'Dono de barco'], a: 2 },
  { q: '"Arregaçar" no Pará significa:', ops: ['Trabalhar muito', 'Arrumar a casa', 'Bater, surrar alguém', 'Preparar o almoço'], a: 2 },
  { q: '"Mana" no linguajar paraense é:', ops: ['Uma comida típica', 'Um rio do interior', 'Amiga, mulher', 'Uma dança tradicional'], a: 2 },
  { q: '"Boa praça" descreve:', ops: ['Um mercado público famoso', 'Pessoa simpática, gente boa', 'Uma praça bem cuidada', 'Um bom negócio comercial'], a: 1 },
  { q: '"Caçar" no linguajar paraense pode significar:', ops: ['Somente caçar animais', 'Procurar, buscar algo', 'Brigar com alguém', 'Cozinhar no fogo'], a: 1 },
  { q: '"Bora" significa:', ops: ['Um tipo de embarcação', 'Espera um pouco', 'Vamos, vamos embora', 'Um tipo de fruta'], a: 2 },
  { q: '"Marvada" é apelido de:', ops: ['Mulher bonita', 'Uma música animada', 'Cachaça (aguardente)', 'Uma fruta ácida'], a: 2 },
  { q: '"Piranha" no linguajar informal pode ser:', ops: ['Somente o peixe carnívoro', 'Um carro velho', 'Pessoa fofoqueira e maledicente', 'Um barco pequeno'], a: 2 },
  { q: '"Botar pra quebrar" significa:', ops: ['Quebrar objetos', 'Começar a dançar e se divertir muito', 'Brigar fisicamente', 'Trabalhar com dedicação'], a: 1 },
  { q: '"Tá bão" significa:', ops: ['Estou com fome', 'Que saudade!', 'Está bom, está bem', 'Vamos embora logo'], a: 2 },
  { q: '"É memo" significa:', ops: ['Mesmo assim...', 'É mesmo, é verdade', 'Não sei ao certo', 'Talvez sim'], a: 1 },
  { q: '"Aranha" no linguajar informal pode ser:', ops: ['Somente o aracnídeo', 'Pessoa esperta e malandra', 'Forma de chamar a mãe', 'Um prato típico'], a: 1 },
  { q: '"Tcho" no linguajar paraense significa:', ops: ['Obrigado', 'Tchau, até logo', 'Com licença', 'Desculpe'], a: 1 },
  { q: '"Égua!" é usado no Pará para expressar:', ops: ['Apenas raiva', 'Surpresa, admiração ou espanto', 'Tristeza', 'Cumprimento formal'], a: 1 },
  { q: '"Abestado" no Pará significa:', ops: ['Muito cansado', 'Tolo, distraído, bobo', 'Muito feliz', 'Com fome'], a: 1 },
  { q: '"Pitiço" é:', ops: ['Peixe pequeno', 'Cigarro de palha', 'Dança regional', 'Gato jovem'], a: 1 },
  { q: '"Breu" no linguajar informal é:', ops: ['Tipo de peixe', 'Escuridão total', 'Bebida regional', 'Instrumento'], a: 1 },
  { q: '"Apanhar" no Pará pode significar:', ops: ['Somente levar surra', 'Pegar ou buscar algo', 'Perder competição', 'Ficar doente'], a: 1 },
  { q: '"Bagulho" no linguajar jovem significa:', ops: ['Saco de lixo', 'Coisa, objeto', 'Pessoa engraçada', 'Tipo de peixe'], a: 1 },
  { q: '"Vixe!" é uma interjeição de:', ops: ['Alegria extrema', 'Susto ou lamento', 'Raiva intensa', 'Cumprimento'], a: 1 },
  { q: 'No Pará, "que saudade de ti!" usa "ti" como herança do:', ops: ['Inglês colonial', 'Português arcaico/europeu', 'Tupi', 'Espanhol'], a: 1 },
  { q: '"O quê que tem?" significa:', ops: ['Tem algo errado?', 'O que há de novidade?', 'Tenho algo a dizer', 'Que problema há?'], a: 1 },
  { q: '"Mana, é muita pressão!" quer dizer:', ops: ['Está com pressa', 'Está difícil/exigente demais', 'Muito barulho', 'Está com raiva'], a: 1 },
  { q: '"Aí sim!" no Pará é usado para:', ops: ['Discordar de algo', 'Aprovar ou elogiar algo', 'Pedir silêncio', 'Chamar alguém'], a: 1 },
  { q: '"Maninho" / "Maninha" é:', ops: ['Apelido de criança doente', 'Forma carinhosa de chamar alguém (mano/mana)', 'Bairro de Belém', 'Tipo de embarcação'], a: 1 },
  { q: '"Logo mais" no Pará pode significar:', ops: ['Agora mesmo', 'Em algum momento indefinido (não necessariamente logo)', 'Nunca', 'Em exatos 5 minutos'], a: 1 },
  { q: '"Oxente!" é interjeição típica de:', ops: ['Pará', 'Nordeste brasileiro', 'São Paulo', 'Minas Gerais'], a: 1 },
  { q: '"Égua do bichão!" é usado para expressar:', ops: ['Raiva extrema', 'Grande surpresa ou admiração', 'Pedido de ajuda', 'Despedida'], a: 1 },
  { q: '"Preguiça" no linguajar paraense pode chamar alguém de:', ops: ['Trabalhador demais', 'Lento, sem vontade de fazer nada', 'Pessoa rápida', 'Alguém esperto'], a: 1 },
  { q: '"Tô fora" em gíria paraense quer dizer:', ops: ['Saí de casa', 'Não quero participar / me recuso', 'Estou disponível', 'Fui ao mercado'], a: 1 },
  { q: '"Pegar no tranco" significa:', ops: ['Ser preso pela polícia', 'Trabalhar duro, se esforçar muito', 'Pegar carona', 'Dormir tarde'], a: 1 },
  { q: '"Num tô nem aí" quer dizer:', ops: ['Estou muito interessado', 'Não me importo nada com isso', 'Estou perto', 'Concordo plenamente'], a: 1 },
  { q: '"Rachar" no linguajar informal paraense pode ser:', ops: ['Somente quebrar algo', 'Dividir o custo ou a conta', 'Correr muito rápido', 'Brigar feio'], a: 1 },
  { q: '"Deixa de ser palha!" significa:', ops: ['Pare de trabalhar com palha', 'Para de ser chato/sem graça', 'Joga fora a palha', 'Seja mais trabalhador'], a: 1 },
];

function GiriasParaenses() {
  const [qs, setQs] = useState([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState(null);
  const [done, setDone] = useState(false);

  function init() {
    setQs([...GIRIAS_QUESTIONS].sort(() => Math.random() - 0.5).slice(0, 10));
    setIdx(0); setScore(0); setSelected(null); setDone(false);
  }

  useEffect(() => { init(); }, []);

  if (!qs.length) return null;

  const q = qs[idx];

  function pick(i) {
    if (selected !== null) return;
    setSelected(i);
    if (i === q.a) setScore(s => s + 1);
    setTimeout(() => {
      if (idx + 1 >= qs.length) setDone(true);
      else { setIdx(c => c + 1); setSelected(null); }
    }, 1300);
  }

  return (
    <div className="card" style={{ marginBottom: 12 }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <img src="/bandeira.png" alt="Bandeira do Pará" style={{ width: 32, height: 22, borderRadius: 3, flexShrink: 0, border: '0.5px solid #CCC', objectFit: 'cover' }} />
          <span style={{ fontWeight: 800, fontSize: 16, color: 'var(--primary)' }}>Gírias Paraenses</span>
        </div>
        <span style={{ fontSize: 12, color: 'var(--text-light)', fontWeight: 600 }}>
          {done ? `${score}/${qs.length} pts` : `${idx + 1}/${qs.length} • ${score} pts`}
        </span>
      </div>

      {done ? (
        <div style={{ textAlign: 'center', padding: '16px 0' }}>
          <div style={{ fontSize: 40, marginBottom: 8 }}>
            {score >= 8 ? '🏆' : score >= 5 ? '👏' : '📚'}
          </div>
          <div style={{ fontSize: 18, fontWeight: 800, color: 'var(--primary)', marginBottom: 4 }}>
            {score >= 8 ? 'Mandou bem, bicho!' : score >= 5 ? 'Não foi palha!' : 'Boa praça, mas estuda mais!'}
          </div>
          <div style={{ fontSize: 14, color: 'var(--text-light)', marginBottom: 16 }}>
            Você acertou {score} de {qs.length} perguntas
          </div>
          <button className="btn btn-primary" onClick={init}>Jogar de novo</button>
        </div>
      ) : (
        <>
          <div style={{ marginBottom: 14, background: '#F8F0FF', borderRadius: 10, padding: '12px 14px' }}>
            <p style={{ fontSize: 15, fontWeight: 700, color: '#333', margin: 0, lineHeight: 1.4 }}>{q.q}</p>
          </div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
            {q.ops.map((op, i) => {
              let bg = 'white', border = '1.5px solid var(--border)', color = 'var(--text)';
              if (selected !== null) {
                if (i === q.a) { bg = '#E8F5E9'; border = '2px solid #4CAF50'; color = '#2E7D32'; }
                else if (i === selected) { bg = '#FFEBEE'; border = '2px solid #EF5350'; color = '#C62828'; }
                else { color = 'var(--text-light)'; }
              }
              return (
                <button key={i} onClick={() => pick(i)} style={{
                  background: bg, border, color, borderRadius: 10, padding: '10px 14px',
                  textAlign: 'left', fontSize: 14, fontWeight: 600,
                  cursor: selected !== null ? 'default' : 'pointer', transition: 'all 0.2s'
                }}>
                  {String.fromCharCode(65 + i)}) {op}
                </button>
              );
            })}
          </div>
          <div style={{ marginTop: 12, background: 'var(--border)', borderRadius: 4, height: 4 }}>
            <div style={{ width: `${(idx / qs.length) * 100}%`, background: 'var(--primary)', borderRadius: 4, height: '100%', transition: 'width 0.4s' }} />
          </div>
        </>
      )}
    </div>
  );
}

export default function CustomerTracking() {
  const { id } = useParams();
  const { user, apiFetch } = useAuth();
  const { socket, joinOrder } = useSocket();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [motoboyPos, setMotoboyPos] = useState(null);
  const [eta, setEta] = useState(null);

  useEffect(() => {
    joinOrder(id);
    loadOrder();

    const interval = setInterval(loadOrder, 5000);
    return () => { clearInterval(interval); };
  }, [id]);

  useEffect(() => {
    if (!socket) return;
    socket.on('order_status', (data) => {
      if (data.orderId === id) {
        setOrder(prev => prev ? { ...prev, status: data.status } : prev);
      }
    });
    socket.on('motoboy_location', (data) => {
      if (data.orderId === id) {
        setMotoboyPos({ lat: data.lat, lng: data.lng, name: data.motoboyName });
        if (data.lat && data.lng && order) {
          const dist = Math.sqrt(
            Math.pow(data.lat - (order.customer_lat || -23.55), 2) +
            Math.pow(data.lng - (order.customer_lng || -46.63), 2)
          ) * 111;
          setEta(Math.round(dist * 3));
        }
      }
    });
    return () => {
      socket.off('order_status');
      socket.off('motoboy_location');
    };
  }, [socket, id, order]);

  async function loadOrder() {
    const data = await apiFetch(`/orders/${id}`);
    if (data.id) {
      setOrder(data);
      if (data.motoboy_id) {
        const locData = await apiFetch(`/motoboy/location/${data.motoboy_id}`);
        if (locData.lat) {
          setMotoboyPos({ lat: locData.lat, lng: locData.lng });
        }
      }
    }
  }

  if (!order) return (
    <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: '100vh' }}>
      <img className="spin" src="/saco_acai.png" />
    </div>
  );

  const stepMap = { pending:0, confirmed:0, preparing:1, ready:1, assigned:1, picked_up:2, in_transit:2, arriving:2, delivered:3 };
  const arrivingText = order.status === 'arriving' ? 'O motoboy está chegando! Fique atento!' : '';
  const currentStep = stepMap[order.status] ?? 0;

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 72 }}>
      <CustomerHeader title="Acompanhar Pedido" />

      <div className="container" style={{ paddingTop: 12 }}>
        <div className="card">
          <div style={{ marginBottom: 8, display: 'flex', justifyContent: 'flex-end' }}>
            <span className={`badge ${order.payment_status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
              {order.payment_status === 'paid' ? 'Pago' : 'Pendente'}
            </span>
          </div>

          <div className="order-status-bar">
            {/* Saco_acai de início (antes do primeiro passo) */}
            <div className="order-status-step">
              <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src="/saco_acai.png" style={{ width: 24, height: 24, objectFit: 'contain', opacity: 0.55 }} />
              </div>
              <span className="text-xs" style={{ color: 'var(--text-light)', textAlign: 'center' }}> </span>
            </div>

            {statusSteps.map((step, i) => {
              const done = i <= currentStep;
              const isCurrent = i === currentStep;
              return (
                <div key={step} className="order-status-step">
                  <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isCurrent ? (
                      <img src="/saco_acai.png" style={{ width: 32, height: 32, objectFit: 'contain', animation: 'blink-saco 0.85s ease-in-out infinite' }} />
                    ) : done ? (
                      <div style={{ width: 16, height: 16, borderRadius: '50%', background: 'var(--secondary)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                        <svg width="10" height="10" viewBox="0 0 24 24" fill="white"><path d="M9 16.17L4.83 12l-1.42 1.41L9 19 21 7l-1.41-1.41z"/></svg>
                      </div>
                    ) : (
                      <div style={{ width: 12, height: 12, borderRadius: '50%', background: 'var(--border)' }} />
                    )}
                  </div>
                  <span className="text-xs" style={{
                    color: done ? (isCurrent ? 'var(--primary)' : 'var(--secondary)') : 'var(--text-light)',
                    fontWeight: done ? 700 : 400,
                    textAlign: 'center'
                  }}>
                    {statusLabels[step]}
                  </span>
                </div>
              );
            })}

            {/* Cuia ao final (após Entregue) */}
            <div className="order-status-step">
              <div style={{ height: 36, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src="/cuia.png" style={{ width: 28, height: 28, objectFit: 'contain', opacity: order.status === 'delivered' ? 1 : 0.22 }} />
              </div>
              <span className="text-xs" style={{ color: order.status === 'delivered' ? 'var(--secondary)' : 'var(--text-light)', textAlign: 'center', fontWeight: order.status === 'delivered' ? 700 : 400 }}>
                {order.status === 'delivered' ? 'Bom aprov!' : ' '}
              </span>
            </div>
          </div>
        </div>

        <GiriasParaenses />

        {(motoboyPos || order.status === 'picked_up' || order.status === 'arriving') && order.status !== 'delivered' && (
          <div className="card">
            <div className="flex-between" style={{ marginBottom: 8 }}>
              <h3 style={{ color: 'var(--primary)', fontSize: 16 }}>
                {motoboyPos?.name || 'Motoboy'}
              </h3>
              {eta !== null && (
                <span style={{ background: '#E3F2FD', padding: '4px 10px', borderRadius: 8, fontWeight: 700, color: '#1565C0', fontSize: 13 }}>
                  ~{eta} min
                </span>
              )}
            </div>

            {order.store_lat && order.customer_lat && (
              <div style={{ height: 220, borderRadius: 12, overflow: 'hidden', border: '1px solid var(--border)', marginBottom: 8 }}>
                <MapContainer
                  center={[(order.store_lat + order.customer_lat) / 2, ((order.store_lng || 0) + (order.customer_lng || 0)) / 2]}
                  zoom={14} style={{ height: '100%', width: '100%' }} scrollWheelZoom={false}>
                  <TileLayer attribution='&copy; OSM' url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
                  <Marker position={[order.store_lat, order.store_lng]} icon={L.divIcon({ html: '<img src="/logo_placa.png" style="width:44px;height:44px;object-fit:contain;filter:drop-shadow(0 2px 6px rgba(0,0,0,0.5))"/>', className: '', iconSize: [44, 44], iconAnchor: [22, 22] })} />
                  <Marker position={[order.customer_lat, order.customer_lng]} />
                  {motoboyPos && (
                    <Marker position={[motoboyPos.lat, motoboyPos.lng]} icon={L.divIcon({ html: '<img src="/saco_acai.png" style="width:52px;height:52px;object-fit:contain;filter:drop-shadow(0 2px 8px rgba(0,0,0,0.6))"/>', className: '', iconSize: [52, 52], iconAnchor: [26, 26] })} />
                  )}
                  <RoutePolyline from={{ lat: order.store_lat, lng: order.store_lng }} to={{ lat: order.customer_lat, lng: order.customer_lng }} />
                </MapContainer>
              </div>
            )}

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <StoreLogo logo={order.store_logo} />
                <span className="text-xs" style={{ color: '#888' }}>Loja</span>
              </div>
              <span className="text-xs" style={{ color: '#888' }}>↓ {order.customer_address}</span>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <CustomerAvatar photo={user?.photo_url} />
                <span className="text-xs" style={{ color: '#888' }}>Você</span>
              </div>
            </div>

            <div style={{ marginTop: 8, fontSize: 13, color: '#888' }}>
              {order.status === 'picked_up' && 'Motoboy saiu da loja com seu açaí!'}
              {order.status === 'arriving' && 'O motoboy está chegando! Fique atento!'}
              {order.status === 'picked_up' || order.status === 'arriving' ? '' : 'Aguardando...'}
            </div>
          </div>
        )}

        <div className="card">
          <h3 className="text-sm font-bold text-muted mb-2">Detalhes</h3>
          <div className="text-sm" style={{ marginTop: 4 }}>
            <span style={{ color: '#888' }}>Loja: </span><span className="font-bold">{order.store_name}</span>
          </div>
          <div className="text-sm" style={{ marginTop: 4 }}>
            <span style={{ color: '#888' }}>Endereço: </span><span>{order.customer_address}</span>
          </div>
          <div className="text-sm" style={{ marginTop: 4 }}>
            <span style={{ color: '#888' }}>Total: </span><span className="font-bold" style={{ color: 'var(--primary)' }}>R$ {order.total.toFixed(2)}</span>
          </div>
          <div className="text-sm" style={{ marginTop: 4 }}>
            <span style={{ color: '#888' }}>Pedido em: </span><span>{new Date(order.created_at).toLocaleString('pt-BR')}</span>
          </div>
          {order.items && (
            <div style={{ marginTop: 8, borderTop: '1px solid var(--border)', paddingTop: 8 }}>
              {order.items.map((item, i) => (
                <div key={i} className="text-sm" style={{ marginTop: 2 }}>
                  <span>{item.quantity}x {item.product_name} ({item.size_ml}ml) — </span>
                  <span style={{ fontWeight: 700 }}>R$ {(item.unit_price * item.quantity).toFixed(2)}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
      <CustomerBottomNav />
    </div>
  );
}
