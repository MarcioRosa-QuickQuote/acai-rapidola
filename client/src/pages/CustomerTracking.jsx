import { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
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
  { q: '"Mocorongo" no Pará significa:', ops: ['Pessoa do interior, caipira', 'Muito inteligente', 'Rico, abastado', 'Turista'], a: 0 },
  { q: '"Poraquê" é um:', ops: ['Peixe elétrico da Amazônia', 'Tipo de dança', 'Pássaro noturno', 'Instrumento musical'], a: 0 },
  { q: '"Tucupi" é:', ops: ['Dança típica', 'Caldo amarelo extraído da mandioca', 'Fruta amazônica', 'Tipo de artesanato'], a: 1 },
  { q: '"Jambu" é:', ops: ['Uma fruta doce', 'Erva que causa dormência na boca', 'Peixe de água doce', 'Cidade do Pará'], a: 1 },
  { q: '"Maniva" é o mesmo que:', ops: ['Fruta madura', 'Folha da mandioca moída', 'Tipo de peixe', 'Bairro de Belém'], a: 1 },
  { q: '"Vatapá" é:', ops: ['Bebida fermentada', 'Prato típico paraense', 'Tipo de rede de dormir', 'Cobra amazônica'], a: 1 },
  { q: '"Carimbó" é:', ops: ['Peixe de escama', 'Ritmo musical e dança típica', 'Bairro de Belém', 'Tipo de canoa'], a: 1 },
  { q: '"Tapioca" no Pará é feita com:', ops: ['Farinha de trigo', 'Goma extraída da mandioca', 'Milho moído', 'Arroz triturado'], a: 1 },
  { q: '"Açaí" no Pará é tradicionalmente consumido com:', ops: ['Leite condensado e granola', 'Farinha d\'água e peixe', 'Açúcar e frutas', 'Leite em pó'], a: 1 },
  { q: '"Pupunha" é:', ops: ['Uma fruta/legume típico da região', 'Uma dança indígena', 'Tipo de barco', 'Peixe ornamental'], a: 0 },
  { q: '"Cupuaçu" é:', ops: ['Fruta amazônica de casca marrom', 'Tipo de mandioca', 'Peixe de rio', 'Ave regional'], a: 0 },
  { q: '"Bacuri" é:', ops: ['Fruta amazônica de casca dura', 'Tipo de rede', 'Dança típica', 'Rio do Pará'], a: 0 },
  { q: '"Tucumã" é:', ops: ['Fruta de palmeira amazônica', 'Peixe elétrico', 'Cidade do Pará', 'Tipo de artesanato'], a: 0 },
  { q: '"Muruci" é:', ops: ['Fruta amarela usada em sucos', 'Peixe pequeno', 'Bairro de Belém', 'Ferramenta agrícola'], a: 0 },
  { q: '"Graviola" no Pará é usada para:', ops: ['Fazer remédio caseiro', 'Fazer suco e sorvete', 'Temperar peixe', ' tingir roupas'], a: 1 },
  { q: '"Farinha d\'água" é:', ops: ['Farinha de trigo industrializada', 'Farinha de mandioca molhada', 'Farinha de milho', 'Farinha de arroz'], a: 1 },
  { q: '"Pirarucu" é:', ops: ['Um dos maiores peixes de água doce', 'Dança típica', 'Cidade paraense', 'Planta medicinal'], a: 0 },
  { q: '"Tambaqui" é:', ops: ['Peixe amazônico muito apreciado', 'Fruta típica', 'Tipo de canoa', 'Ave regional'], a: 0 },
  { q: '"Filhote" no Pará é um:', ops: ['Filho mais novo', 'Peixe da família do pirarucu', 'Filhote de cachorro', 'Aprendiz de pescador'], a: 1 },
  { q: '"Mapará" é:', ops: ['Peixe escalado típico do Pará', 'Tipo de árvore', 'Dança folclórica', 'Utensílio de cozinha'], a: 0 },
  { q: '"Acari" é:', ops: ['Peixe de couro da Amazônia', 'Fruta silvestre', 'Inseto voador', 'Tipo de cerâmica'], a: 0 },
  { q: '"Surubim" é:', ops: ['Peixe de couro de rio', 'Árvore frutífera', 'Dança regional', 'Tipo de remo'], a: 0 },
  { q: '"Dourada" no Pará é:', ops: ['Peixe de escama dourada', 'Mulher muito bonita', 'Moeda antiga', 'Planta ornamental'], a: 0 },
  { q: '"Pescada" é um peixe:', ops: ['De água salgada apenas', 'De escama muito comum no Pará', 'Peixe elétrico', 'Peixe ornamental'], a: 1 },
  { q: '"Tucunaré" é:', ops: ['Peixe esportivo da Amazônia', 'Fruta amazônica', 'Dança típica', 'Cobra d\'água'], a: 0 },
  { q: '"Baiacu" no Pará é:', ops: ['Peixe que infla', 'Pessoa irritada', 'Tipo de balão', 'Brinquedo infantil'], a: 0 },
  { q: '"Matrinxã" é:', ops: ['Peixe de escama do Amazonas', 'Fruta típica', 'Árvore frutífera', 'Tipo de abano'], a: 0 },
  { q: '"Aruanã" é:', ops: ['Peixe amazônico de aquário', 'Ave de rapina', 'Cobra aquática', 'Planta flutuante'], a: 0 },
  { q: '"Boto" no imaginário paraense é:', ops: ['Apenas um golfinho de rio', 'Ser que vira gente e engravida as moças', 'Peixe perigoso', 'Divindade indígena'], a: 1 },
  { q: '"Uirapuru" é:', ops: ['Pássaro lendário da Amazônia', 'Peixe pequeno', 'Árvore frutífera', 'Tipo de artesanato'], a: 0 },
  { q: '"Curupira" é:', ops: ['Protetor das florestas com pés virados', 'Peixe elétrico', 'Assombração de rio', 'Fantasma de igreja'], a: 0 },
  { q: '"Iara" ou "Mãe d\'água" é:', ops: ['Sereia dos rios amazônicos', 'Cobra grande', 'Fada da floresta', 'Ondina do mar'], a: 0 },
  { q: '"Matinta Perera" é:', ops: ['Assombração que assobia', 'Peixe boi', 'Árvore gigante', 'Dança indígena'], a: 0 },
  { q: '"Cobra-grande" ou "Boiuna" é:', ops: ['Cobra gigante lendária dos rios', 'Cascavel', 'Jiboia comum', 'Sucuri comum'], a: 0 },
  { q: '"Mãe-do-ouro" é:', ops: ['Entidade que protege tesouros enterrados', 'Planta que produz ouro', 'Mineradora famosa', 'Rocha preciosa'], a: 0 },
  { q: '"Tapera" no Pará significa:', ops: ['Cidade grande', 'Sítio abandonado, casa velha', 'Templo religioso', 'Mercado público'], a: 1 },
  { q: '"Igarapé" é:', ops: ['Canal estreito de rio, braço d\'água', 'Grande lago', 'Cachoeira alta', 'Montanha verde'], a: 0 },
  { q: '"Furo" na Amazônia significa:', ops: ['Buraco no chão', 'Canal estreito que liga dois rios', 'Furo de bala', 'Defeito em embarcação'], a: 1 },
  { q: '"Várzea" na região é:', ops: ['Terreno seco e alto', 'Área alagada às margens dos rios', 'Planalto rochoso', 'Deserto amazônico'], a: 1 },
  { q: '"Terra firme" na Amazônia é:', ops: ['Área que nunca alaga', 'Propriedade rural', 'Cimento queimado', 'Chão batido'], a: 0 },
  { q: '"Barranco" no Pará é:', ops: ['Margem alta de rio', 'Buraco no chão', 'Depósito de mercadorias', 'Tipo de madeira'], a: 0 },
  { q: '"Ressaca" no linguajar paraense é:', ops: ['Efeito do álcool', 'Área alagada, pantanosa', 'Vento forte', 'Onda do mar'], a: 1 },
  { q: '"Enseada" no Pará é:', ops: ['Praia de rio', 'Entrada do mar', 'Grande lago', 'Cachoeira'], a: 0 },
  { q: '"Boca do rio" significa:', ops: ['Foz, lugar onde o rio deságua', 'Nascente do rio', 'Margem rasa', 'Cachoeira'], a: 0 },
  { q: '"Montaria" no Pará é:', ops: ['Carro antigo', 'Canoa pequena feita de um tronco só', 'Cavalo de monta', 'Moto usada'], a: 1 },
  { q: '"Rabeta" é:', ops: ['Canoa com motor de popa', 'Barco grande', 'Tipo de peixe', 'Rabo de animal'], a: 0 },
  { q: '"Bajara" é:', ops: ['Jangada paraense', 'Rede de pesca', 'Fruta silvestre', 'Tipo de dança'], a: 0 },
  { q: '"Vigia" no vocabulário paraense é:', ops: ['Sentinelas', 'Cidade do Pará', 'Observatório', 'Farol'], a: 1 },
  { q: '"Bragança" é:', ops: ['Cidade do nordeste paraense', 'Tipo de barco', 'Peixe de couro', 'Planta medicinal'], a: 0 },
  { q: '"Santarém" é:', ops: ['Cidade do oeste do Pará', 'Bairro de Belém', 'Rio afluente', 'Tipo de artesanato'], a: 0 },
  { q: '"Marajó" é conhecido por:', ops: ['Suas praias oceânicas', 'Suas ilhas e búfalos', 'Suas montanhas', 'Seu deserto'], a: 1 },
  { q: '"Ilha do Combu" é famosa por:', ops: ['Suas praias de areia branca', 'Seu chocolate e cacau', 'Suas montanhas', 'Seu cassino'], a: 1 },
  { q: '"Ver-o-Peso" é:', ops: ['Mercado histórico de Belém', 'Feira de artesanato', 'Praia fluvial', 'Porto de navios'], a: 0 },
  { q: '"Estação das Docas" é:', ops: ['Complexo turístico e gastronômico', 'Estação de trem', 'Porto industrial', 'Museu naval'], a: 0 },
  { q: '"Mangal das Garças" é:', ops: ['Parque ecológico em Belém', 'Feira livre', 'Criadouro de garças', 'Restaurante'], a: 0 },
  { q: '"Basílica de Nazaré" é:', ops: ['Principal igreja de Belém', 'Mercado municipal', 'Teatro famoso', 'Praça central'], a: 0 },
  { q: '"Círio de Nazaré" é:', ops: ['Dança típica paraense', 'Maior procissão religiosa do Brasil', 'Festa junina', 'Torneio de pesca'], a: 1 },
  { q: '"Arraial do Pavulagem" é:', ops: ['Bloco de carnaval', 'Arrastão musical que toca em Belém', 'Feira agropecuária', 'Festa religiosa'], a: 1 },
  { q: '"Guitarrada" é:', ops: ['Estilo musical paraense com guitarra', 'Loja de instrumentos', 'Técnica de violão', 'Banda de rock'], a: 0 },
  { q: '"Brega" no Pará é:', ops: ['Música popular romântica e dançante', 'Estilo musical brega', 'Programa de TV', 'Tipo de festa'], a: 0 },
  { q: '"Tecnobrega" é:', ops: ['Fusão de brega com música eletrônica', 'Aparelho de som', 'Técnica de gravação', 'Estilo de dança'], a: 0 },
  { q: '"Calypso" é:', ops: ['Banda musical paraense famosa', 'Música caribenha', 'Dança havaiana', 'Tipo de ritmo'], a: 0 },
  { q: '"Banho de cheiro" no Pará é:', ops: ['Perfume tradicional com ervas cheirosas', 'Banho no rio', ['Produto de limpeza'], 'Tipo de sabonete'], a: 0 },
  { q: '"Cheiro-do-pará" é:', ops: ['Perfume típico com alfazema e cumaru', 'Prato típico', 'Planta ornamental', 'Dança folclórica'], a: 0 },
  { q: '"Pajé" no Pará significa:', ops: ['Xamã, curandeiro indígena', 'Tipo de dança', ['Pássaro preto'], 'Chefe militar'], a: 0 },
  { q: '"Puxirum" no Pará é:', ops: ['Mutirão, trabalho coletivo', 'Festa particular', 'Tipo de dança', 'Sistema de pesca'], a: 0 },
  { q: '"Paneiro" no Pará é:', ops: ['Cesto trançado de palha', 'Tipo de fogão', 'Panela de barro', 'Utensílio de pesca'], a: 0 },
  { q: '"Tipiti" é:', ops: ['Esmagador de mandioca', 'Tipo de cesto', 'Rede de pesca', 'Armadilha de caça'], a: 0 },
  { q: '"Cuia" no Pará é usada para:', ops: ['Tomar açaí', 'Guardar dinheiro', 'Enfeitar a casa', 'Cozinhar alimentos'], a: 0 },
  { q: '"Rede" na cultura paraense é:', ops: ['Objeto para dormir descansar', 'Rede de pesca', 'Internet', 'Teia de aranha'], a: 0 },
  { q: '"Abano" no Pará é:', ops: ['Ventilador manual de palha', ['Toldo de janela'], 'Telhado de casa', 'Tipo de saia'], a: 0 },
  { q: '"Urucubaca" no Pará quer dizer:', ops: ['Dança típica', 'Azar, má sorte', 'Fartura, abundância', 'Bairro famoso'], a: 1 },
  { q: '"Arredar" no Pará significa:', ops: ['Chegar mais para lá, sair do lugar', ['Aproximar'], 'Empurrar', 'Puxar'], a: 0 },
  { q: '"Arriar" no Pará quer dizer:', ops: ['Descer, abaixar', 'Cansar muito', 'Reclamar', 'Chorar'], a: 0 },
  { q: '"Botar" no sentido paraense:', ops: ['Colocar, pôr', 'Expulsar', 'Vestir', 'Fabricar'], a: 0 },
  { q: '"Catar" no Pará significa:', ops: ['Juntar, recolher', 'Procurar piolho', 'Limpar', 'Varrer'], a: 0 },
  { q: '"Cochilar" no Pará é:', ops: ['Dormir leve, tirar um sono', 'Conversar', 'Comer', 'Trabalhar'], a: 0 },
  { q: '"Destombar" no Pará significa:', ops: ['Desanimar, desistir', 'Cair no chão', 'Quebrar objeto', 'Perder documento'], a: 0 },
  { q: '"Embarafustar" é:', ops: ['Entrar em lugar apertado', 'Sair correndo', 'Discutir bravo', 'Navegar contra a corrente'], a: 0 },
  { q: '"Ensebar" no Pará significa:', ops: ['Atrapalhar, dificultar', 'Ensaboar', 'Lavar roupa', 'Escorregar'], a: 0 },
  { q: '"Esculhambar" significa:', ops: ['Criticar severamente, xingar', 'Quebrar pedaços', 'Espalhar coisas', 'Desorganizar'], a: 0 },
  { q: '"Espia" no Pará quer dizer:', ops: ['Olha, veja', 'Agente secreto', 'Vigilante', 'Criança arteira'], a: 0 },
  { q: '"Jegue" no Pará é:', ops: ['Pessoa lerda, burro', 'Animal de carga', 'Carro velho', 'Moto fraca'], a: 0 },
  { q: '"Mamar" no sentido paraense:', ops: ['Tirar vantagem', 'Amamentar', 'Beber muito', 'Dormir'], a: 0 },
  { q: '"Mangar" no Pará significa:', ops: ['Zombar, caçoar de alguém', 'Comer manga', 'Colher fruta', 'Admirar'], a: 0 },
  { q: '"Pitar" no Pará é:', ops: ['Fumar cachimbo ou cigarro', 'Comer pitanga', 'Cantar baixo', 'Andar devagar'], a: 0 },
  { q: '"Puxa" no vocabulário paraense:', ops: ['Puxar, arrastar', 'Atrair namorado', 'Tirar sorteio', 'Chupar canudo'], a: 0 },
  { q: '"Relar" no Pará significa:', ops: ['Ralar, raspar de leve', 'Contar fofoca', 'Falar demais', 'Reclamar'], a: 0 },
  { q: '"Rengar" no Pará quer dizer:', ops: ['Teimar, insistir', 'Rezar muito', 'Cantar mal', 'Andar em fila'], a: 0 },
  { q: '"Ribanceira" é:', ops: ['Barranco íngreme', 'Ribeirão', 'Cachoeira pequena', 'Margem de rio'], a: 0 },
  { q: '"Sambir" no Pará significa:', ops: ['Andar sem destino, vagar', 'Dançar samba', 'Baloiçar', 'Navegar'], a: 0 },
  { q: '"Tombar" no Pará pode ser:', ops: ['Virar, cair', 'Pagar imposto', 'Registrar documento', 'Comemorar'], a: 0 },
  { q: '"Tupiniquim" é:', ops: ['Indígena brasileiro', 'Peixe ornamental', 'Planta rasteira', 'Doce regional'], a: 0 },
  { q: '"Uruá" é o nome de:', ops: ['Caramujo comestível da Amazônia', 'Pássaro preto', 'Peixe de couro', 'Fruta do mato'], a: 0 },
  { q: '"Mingau" no Pará é feito de:', ops: ['Farinha d\'água ou tapioca', 'Aveia', 'Trigo', 'Milho'], a: 0 },
  { q: '"Pato no tucupi" é:', ops: ['Prato típico paraense famoso', 'Dança folclórica', 'Lenda amazônica', 'Peixe preparado'], a: 0 },
  { q: '"Tacacá" é servido em:', ops: ['Cuia', 'Prato fundo', 'Copo de vidro', 'Panela de barro'], a: 0 },
  { q: '"Maniçoba" é feita com:', ops: ['Folhas de maniva moída', 'Farinha de trigo', 'Arroz', 'Milho verde'], a: 0 },
  { q: '"Mugunzá" no Pará é:', ops: ['Mingau de milho com leite de coco', 'Bolo de mandioca', 'Doce de cupuaçu', 'Suco de fruta'], a: 0 },
  { q: '"Beiju" é feito de:', ops: ['Goma de tapioca', 'Farinha de trigo', 'Milho', 'Arroz'], a: 0 },
  { q: '"Bolo de macaxeira" é feito com:', ops: ['Mandioca (macaxeira)', 'Milho', 'Trigo', 'Batata'], a: 0 },
  { q: '"Cuscuz" no Pará é de:', ops: ['Milho ou tapioca', 'Arroz', 'Trigo', 'Mandioca'], a: 0 },
  { q: '"Caranguejo" no Pará é comido com:', ops: ['Arroz e feijão', 'Farinha d\'água', 'Pão', 'Macarrão'], a: 1 },
  { q: '"Caldeirada" é:', ops: ['Ensopado de peixe', ['Sopa de legumes'], 'Assado de carne', 'Fritura mista'], a: 0 },
  { q: '"Pesada" no Pará é:', ops: ['Marca de farinha típica', 'Balança antiga', 'Rede de dormir grossa', 'Cestão pesado'], a: 0 },
  { q: '"Amazônia" tem qual sentido no Pará:', ops: ['Região e identidade cultural', 'Apenas floresta', 'Nome de loja', ['Marca de produto']], a: 0 },
  { q: '"Cabano" no Pará é:', ops: ['Natural do Pará, paraense', 'Rebelde histórico', 'Pescador', 'Agricultor'], a: 0 },
  { q: '"Caboclo" na região é:', ops: ['Mestiço de índio com branco', 'Índio puro', 'Branco europeu', 'Negro'], a: 0 },
  { q: '"Tapioqueiro" é:', ops: ['Vendedor de tapioca', 'Fabricante de farinha', 'Pescador artesanal', 'Artesão de cerâmica'], a: 0 },
  { q: '"Padeiro" no Pará é:', ops: ['Pescador de camarão', 'Fabricante de pão', 'Vendedor ambulante', 'Dono de padaria'], a: 0 },
  { q: '"Açaizeiro" é:', ops: ['Pé de açaí, a palmeira', 'Vendedor de açaí', 'Batedor de açaí', 'Frequentador de batedeiras'], a: 0 },
  { q: '"Batedeira de açaí" é:', ops: ['Máquina que bate o açaí', 'Loja que vende açaí', 'Festa do açaí', ['Dança do açaí']], a: 0 },
  { q: '"Farol" em Belém se refere ao:', ops: ['Bairro do Farol (Cidade Velha)', 'Farol da Barra', ['Luz de navio'], 'Torre de igreja'], a: 0 },
  { q: '"Reduto" em Belém é:', ops: ['Bairro histórico (Reduto)', 'Fortificação militar', 'Esconderijo', 'Área restrita'], a: 0 },
  { q: '"Nazaré" é:', ops: ['Bairro de Belém onde fica a Basílica', 'Cidade do Pará', 'Rio do Pará', 'Ilha'], a: 0 },
  { q: '"Guamá" é:', ops: ['Rio e bairro de Belém', 'Cidade do interior', 'Tipo de peixe', 'Planta medicinal'], a: 0 },
  { q: '"Pedreira" é:', ops: ['Bairro de Belém', 'Profissão', 'Ferramenta', ['Tipo de pedra']], a: 0 },
  { q: '"Jurunas" é:', ops: ['Bairro tradicional de Belém', 'Tribo indígena extinta', 'Peixe ornamental', 'Tipo de artesanato'], a: 0 },
  { q: '"Cremação" em Belém é:', ops: ['Bairro (antigo matadouro)', 'Processo funerário', 'Queimada', 'Incinerador'], a: 0 },
  { q: '"Cidade Velha" é:', ops: ['Bairro mais antigo de Belém', 'Centro histórico', 'Bairro antigo', 'Zona rural'], a: 0 },
  { q: '"Umarizal" é:', ops: ['Bairro nobre de Belém', 'Tipo de árvore', 'Fruta exótica', 'Rio do Pará'], a: 0 },
  { q: '"Batista Campos" é:', ops: ['Bairro residencial de Belém', 'Herói da pátria', 'Médico famoso', ['Político paraense']], a: 0 },
  { q: '"Nossa Senhora do Ó" é:', ops: ['Bairro de Belém', 'Igreja famosa', 'Santo padroeiro', ['Festa religiosa']], a: 0 },
  { q: '"Tapanã" é:', ops: ['Bairro de Belém', 'Tipo de índio', 'Peixe de rio', 'Planta típica'], a: 0 },
  { q: '"Águas Lindas" é:', ops: ['Bairro de Belém', 'Cidade do Pará', 'Praia fluvial', 'Reserva ecológica'], a: 0 },
  { q: '"Coqueiro" em Belém é:', ops: ['Bairro e praia fluvial', 'Tipo de palmeira', 'Fruta tropical', ['Vendedor de coco']], a: 0 },
  { q: '"Outeiro" é:', ops: ['Ilha/distrito de Belém', 'Colina', 'Mirante', 'Forte militar'], a: 0 },
  { q: '"Mosqueiro" é:', ops: ['Ilha turística de Belém', 'Templo islâmico', 'Tipo de barco', 'Cemitério'], a: 0 },
  { q: '"Cotijuba" é:', ops: ['Ilha de Belém com praias fluviais', 'Fruta típica', 'Dança regional', 'Pássaro preto'], a: 0 },
  { q: '"Caratateua" é outro nome para:', ops: ['Ilha de Outeiro', 'Praia do Pará', 'Cidade paraense', 'Reserva indígena'], a: 0 },
  { q: '"Tatu" no Pará pode ser:', ops: ['Animal e também comida típica', 'Apenas animal silvestre', 'Tatuagem', 'Bicho de estimação'], a: 0 },
  { q: '"Cutia" na culinária paraense:', ops: ['Animal de caça consumido como alimento', 'Fruta silvestre', 'Planta medicinal', 'Peixe de rio'], a: 0 },
  { q: '"Paca" é:', ops: ['Animal roedor muito caçado para comida', 'Fruta exótica', 'Planta aquática', 'Peixe ornamental'], a: 0 },
  { q: '"Porco do mato" ou "queixada" é:', ops: ['Porco selvagem da Amazônia', 'Animal doméstico', 'Raça de porco', 'Mito amazônico'], a: 0 },
  { q: '"Veado" no Pará se refere a:', ops: ['Animal e xingamento (dependendo do tom)', 'Apenas animal', 'Apenas xingamento', 'Bairro'], a: 0 },
  { q: '"Arraia" no Pará é:', ops: ['Peixe de rio (raia) e também pipa', 'Apenas um peixe', 'Símbolo de festa', 'Tipo de rede'], a: 0 },
  { q: '"Jacaré" na Amazônia é:', ops: ['Réptil abundante nos rios', 'Animal extinto', 'Raro na região', 'Apenas em cativeiro'], a: 0 },
  { q: '"Tartaruga da Amazônia" é:', ops: ['Quelônio muito apreciado como alimento', 'Animal protegido', ['Espécie invasora'], 'Animal de estimação'], a: 0 },
  { q: '"Pato-mergulhão" é:', ops: ['Tipo de pato que mergulha', 'Pato de borracha', 'Brinquedo infantil', ['Ave migratória']], a: 0 },
  { q: '"Gavião-real" ou "harpia" é:', ops: ['Maior ave de rapina do Brasil', 'Gavião comum', 'Águia pescadora', 'Urubu-rei'], a: 0 },
  { q: '"Arara" na Amazônia é:', ops: ['Ave colorida de grande porte', 'Peixe colorido', ['Flor silvestre'], 'Tipo de dança'], a: 0 },
  { q: '"Papagaio" no Pará é:', ops: ['Ave falante e também pipa', 'Apenas ave', 'Apenas brinquedo', 'Apelido carinhoso'], a: 0 },
  { q: '"Tucano" é:', ops: ['Ave de bico grande e colorido', 'Peixe de bico longo', 'Planta epífita', 'Inseto voador'], a: 0 },
  { q: '"Beija-flor" no Pará é chamado de:', ops: ['Beija-flor ou colibri', 'Pica-flor', 'Chupa-mel', 'Flor-do-sol'], a: 0 },
  { q: '"Sabiá" no Pará é:', ops: ['Ave canora presente na região', 'Peixe cantador', 'Inseto barulhento', 'Sapo'], a: 0 },
  { q: '"Inseto" mais temido no Pará:', ops: ['Carapanã (mosquito)', 'Barata', 'Formiga', 'Abelha'], a: 0 },
  { q: '"Muriçoca" é:', ops: ['Pequeno mosquito que irrita', 'Mosquito grande', 'Tipo de mosca', 'Mariposa'], a: 0 },
  { q: '"Pium" é:', ops: ['Mosquito muito pequeno e agressivo', 'Peixe pequeno', 'Inseto luminoso', 'Fruta miúda'], a: 0 },
  { q: '"Vitória-régia" é:', ops: ['Planta aquática gigante da Amazônia', 'Flor nacional', 'Árvore frutífera', 'Lírio d\'água'], a: 0 },
  { q: '"Andiroba" é:', ops: ['Árvore medicinal amazônica', 'Fruta comestível', 'Peixe de couro', 'Tipo de artesanato'], a: 0 },
  { q: '"Copaíba" é conhecida por:', ops: ['Seu óleo medicinal', 'Sua madeira nobre', 'Sua fruta doce', 'Suas flores ornamentais'], a: 0 },
  { q: '"Muiraquitã" é:', ops: ['Amuleto de pedra em forma de sapo', 'Planta alucinógena', 'Instrumento musical', 'Dança indígena'], a: 0 },
  { q: '"Cumaru" é:', ops: ['Árvore que produz cheiro de baunilha', 'Fruta ácida', 'Peixe ornamental', 'Cerâmica indígena'], a: 0 },
  { q: '"Pau-rosa" é:', ops: ['Árvore amazônica de perfume', 'Tipo de madeira', 'Flor vermelha', 'Fruta nativa'], a: 0 },
  { q: '"Seringueira" é a árvore que produz:', ops: ['Látex (borracha natural)', 'Leite vegetal', 'Resina medicinal', 'Fruta comestível'], a: 0 },
  { q: '"Castanheira" produz:', ops: ['Castanha-do-pará', 'Fruta doce', 'Óleo essencial', 'Madeira nobre'], a: 0 },
  { q: '"Açaizeiro" produz:', ops: ['Açaí (fruto roxo)', 'Palmito', 'Coco', 'Óleo de palma'], a: 0 },
  { q: '"Dendê" no Pará produz:', ops: ['Óleo de palma (azeite de dendê)', 'Fruta doce', 'Madeira nobre', 'Carvão vegetal'], a: 0 },
  { q: '"Babaçu" é:', ops: ['Palmeira que produz coco e óleo', 'Fruta pequena', 'Planta rasteira', 'Árvore frutífera'], a: 0 },
  { q: '"Buriti" é:', ops: ['Palmeira de fruto alaranjado', 'Tipo de peixe', 'Rede de dormir', 'Instrumento musical'], a: 0 },
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
          <img src="/bandeira.png" alt="Bandeira do Pará" style={{ width: 32, height: 22, borderRadius: 3, flexShrink: 0, border: '0.5px solid #CCC', objectFit: 'cover' }} onError={(e) => { e.target.style.display = 'none'; }} />
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
  const { apiFetch } = useAuth();
  const { socket, joinOrder } = useSocket();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [motoboyPos, setMotoboyPos] = useState(null);
  const [eta, setEta] = useState(null);
  const [showMsgModal, setShowMsgModal] = useState(false);
  const [msgText, setMsgText] = useState('');
  const [msgSending, setMsgSending] = useState(false);
  const [msgSent, setMsgSent] = useState(false);

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
    <div style={{ minHeight: '100vh', paddingBottom: 80 }}>
      <div className="header">
        <div className="header-left">
          <button className="btn btn-sm"
            style={{ background: 'var(--border)', color: 'var(--primary-dark)', fontSize: 22, width: 36, height: 36, borderRadius: '50%', padding: 0, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center' }}
            onClick={() => navigate(-1)}>
            ‹
          </button>
        </div>
        <div className="header-right">
          <span className={`badge ${order.payment_status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
            {order.payment_status === 'paid' ? 'Pago' : 'Pendente'}
          </span>
          <button onClick={() => navigate('/customer/notificacoes')}
            style={{ background: 'rgba(106,27,154,0.08)', border: 'none', borderRadius: 20, padding: 7, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="20" height="20" viewBox="0 0 24 24" fill="var(--primary)">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>
          </button>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 4 }}>
        <div className="card">
          <div className="order-status-bar">
            {/* Logo da loja no início */}
            <div className="order-status-step">
              <div style={{ height: 56, width: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src="/logo_placa.png" style={{ width: '100%', height: '100%', objectFit: 'contain', opacity: currentStep >= 0 ? 1 : 0.6 }} />
              </div>
              <span className="text-xs" style={{ color: 'var(--text-light)', textAlign: 'center' }}> </span>
            </div>

            {statusSteps.map((step, i) => {
              const done = i <= currentStep;
              const isCurrent = i === currentStep;
              return (
                <div key={step} className="order-status-step">
                  <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                    {isCurrent ? (
                      <img src="/saco_acai.png" style={{ width: 40, height: 40, objectFit: 'contain', animation: 'glow-saco 2s ease-in-out infinite' }} />
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

            {/* Tigela de açaí no fim */}
            <div className="order-status-step">
              <div style={{ height: 56, display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
                <img src={order.status === 'delivered' ? '/tigela_cheia.png' : '/tigela.png'} style={{ width: 44, height: 44, objectFit: 'contain', opacity: order.status === 'delivered' ? 1 : 0.5 }} />
              </div>
              <span className="text-xs" style={{ color: order.status === 'delivered' ? 'var(--secondary)' : 'var(--text-light)', textAlign: 'center', fontWeight: order.status === 'delivered' ? 700 : 400 }}>
                {order.status === 'delivered' ? 'Só o filé' : ' '}
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
          <div style={{ marginTop: 8 }}>
            <button onClick={(e) => { e.stopPropagation(); setShowMsgModal(true); setMsgSent(false); setMsgText(''); }}
              style={{ fontSize: 13, color: 'var(--primary)', fontWeight: 600, background: 'none', border: 'none', cursor: 'pointer', padding: 0, textDecoration: 'underline' }}>
              💬 Falar com a loja
            </button>
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
      <div style={{ height: 80 }} />
      <CustomerBottomNav />

      {showMsgModal && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 2000, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setShowMsgModal(false)}>
          <div style={{ position: 'absolute', inset: 0, background: 'rgba(0,0,0,0.4)' }} />
          <div onClick={e => e.stopPropagation()} style={{
            position: 'relative', background: 'white', width: '100%', maxWidth: 500,
            borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: '24px 20px',
            paddingBottom: 'calc(20px + env(safe-area-inset-bottom, 0px))',
            boxShadow: '0 -4px 24px rgba(0,0,0,0.15)'
          }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
              <span style={{ fontWeight: 700, fontSize: 18 }}>Falar com a loja</span>
              <div onClick={() => setShowMsgModal(false)} style={{ cursor: 'pointer', fontSize: 22, color: '#999', lineHeight: 1 }}>✕</div>
            </div>
            {msgSent ? (
              <div style={{ textAlign: 'center', padding: 20 }}>
                <div style={{ fontSize: 40, marginBottom: 12 }}>✅</div>
                <div style={{ fontWeight: 600, fontSize: 16, marginBottom: 8 }}>Mensagem enviada!</div>
                <div className="text-muted" style={{ fontSize: 13 }}>A loja responderá em breve.</div>
                <button className="btn btn-primary" style={{ marginTop: 20, width: '100%' }} onClick={() => setShowMsgModal(false)}>
                  OK
                </button>
              </div>
            ) : (
              <>
                <div className="form-group">
                  <textarea className="input" value={msgText} onChange={e => setMsgText(e.target.value)}
                    placeholder="Digite sua mensagem para a loja (dúvidas, reclamações, etc.)"
                    style={{ minHeight: 120, resize: 'vertical', fontSize: 15 }} />
                </div>
                <button className="btn btn-primary" style={{ width: '100%' }} disabled={!msgText.trim() || msgSending}
                  onClick={async () => {
                    if (!msgText.trim() || !order) return;
                    setMsgSending(true);
                    const data = await apiFetch('/messages', {
                      method: 'POST',
                      body: JSON.stringify({ store_id: order.store_id, message: msgText.trim() })
                    });
                    setMsgSending(false);
                    if (data.ok) { setMsgSent(true); } else { alert('Erro ao enviar mensagem'); }
                  }}>
                  {msgSending ? 'Enviando...' : 'Enviar Mensagem'}
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
