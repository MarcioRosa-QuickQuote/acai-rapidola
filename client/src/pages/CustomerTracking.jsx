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
  // --- Gírias e expressões ---
  { q: 'O que significa "Muito palha"?', ops: ['Algo feito de palha', 'Algo ruim, chato, sem graça', 'Pessoa trabalhadora', 'Uma vassoura artesanal'], a: 1 },
  { q: '"Pitiú" significa:', ops: ['Tipo de peixe pequeno', 'Cheiro ruim, fedorento', 'Bairro de Belém', 'Instrumento musical'], a: 1 },
  { q: '"Muruçoca" é o mesmo que:', ops: ['Formiga de fogo', 'Mosquito / pernilongo', 'Barata d\'água', 'Grilo da mata'], a: 1 },
  { q: '"Carapanã" é:', ops: ['Caranguejo pequeno', 'Tipo de canoa', 'Mosquito', 'Peixe de rio'], a: 2 },
  { q: '"Bicho" no Pará é usado para:', ops: ['Xingar alguém', 'Chamar animais selvagens', 'Chamar alguém carinhosamente', 'Desafiar para uma briga'], a: 2 },
  { q: '"Massa" no Pará significa:', ops: ['Ingrediente de cozinha', 'Legal, bom, excelente', 'Pessoa corpulenta', 'Muito dinheiro'], a: 1 },
  { q: '"Banzeiro" é:', ops: ['Vendedor ambulante', 'Pessoa preguiçosa', 'Ondas e agitação nas águas do rio', 'Dono de barco'], a: 2 },
  { q: '"Filhote" no Pará se refere a:', ops: ['Filhote de qualquer animal', 'Tipo de peixe de água doce muito apreciado', 'Criança pequena', 'Pão pequeno'], a: 1 },
  { q: '"Arregaçar" no Pará significa:', ops: ['Trabalhar muito', 'Arrumar a casa', 'Bater, surrar alguém', 'Preparar o almoço'], a: 2 },
  { q: '"Mana" no linguajar paraense é:', ops: ['Uma comida típica', 'Um rio do interior', 'Amiga, mulher', 'Uma dança tradicional'], a: 2 },
  { q: '"Boa praça" descreve:', ops: ['Um mercado público famoso', 'Pessoa simpática, gente boa', 'Uma praça bem cuidada', 'Um bom negócio comercial'], a: 1 },
  { q: 'O tacacá é servido em:', ops: ['Prato fundo de barro', 'Tigela de cerâmica', 'Cuia', 'Folha de bananeira'], a: 2 },
  { q: 'O que é o "Jambu"?', ops: ['Tipo de peixe', 'Erva que causa dormência na boca', 'Instrumento de percussão', 'Bairro de Belém'], a: 1 },
  { q: '"Tucupi" é:', ops: ['Um tipo de peixe', 'Caldo amarelo extraído da mandioca brava', 'Uma dança indígena', 'Um instrumento musical'], a: 1 },
  { q: '"Bacuri" é:', ops: ['Tipo de madeira nobre', 'Dança folclórica', 'Fruta amazônica de sabor agridoce', 'Peixe de rio'], a: 2 },
  { q: 'O pirarucu é:', ops: ['Um tipo de artesanato', 'O maior peixe de água doce do mundo, nativo da Amazônia', 'Uma fruta amazônica', 'Uma dança indígena'], a: 1 },
  { q: '"Cupuaçu" é usado principalmente para:', ops: ['Fabricar perfumes', 'Construção civil', 'Sucos, doces e chocolates', 'Remédios tradicionais'], a: 2 },
  { q: '"Maniçoba" é feita com:', ops: ['Peixe e tucupi', 'Folhas de mandioca cozidas com carnes', 'Açaí e leite', 'Camarão e jambu'], a: 1 },
  { q: 'No folclore paraense, o Boto cor-de-rosa é famoso por:', ops: ['Trazer chuva para a Amazônia', 'Guiar barcos perdidos', 'Transformar-se em homem sedutor nas festas', 'Proteger os pescadores'], a: 2 },
  { q: '"Pupunha" é:', ops: ['Instrumento musical indígena', 'Fruto da palmeira muito consumido cozido', 'Tipo de canoa regional', 'Dança folclórica'], a: 1 },
  { q: '"Taperebá" (cajá-mirim) é muito usado para:', ops: ['Construção de casas', 'Alimentação de pássaros', 'Sucos e sorvetes', 'Fazer carvão'], a: 2 },
  { q: '"Murici" é uma:', ops: ['Espécie de peixe', 'Instrumento de percussão', 'Fruta amarela, pequena e cheirosa', 'Localidade do Pará'], a: 2 },
  { q: '"Caçar" no linguajar paraense pode significar:', ops: ['Somente caçar animais', 'Procurar, buscar algo', 'Brigar com alguém', 'Cozinhar no fogo'], a: 1 },
  { q: '"Bora" significa:', ops: ['Um tipo de embarcação', 'Espera um pouco', 'Vamos, vamos embora', 'Um tipo de fruta'], a: 2 },
  { q: '"Marvada" é apelido de:', ops: ['Mulher bonita', 'Uma música animada', 'Cachaça (aguardente)', 'Uma fruta ácida'], a: 2 },
  { q: '"Piranha" no linguajar informal pode ser:', ops: ['Somente o peixe carnívoro', 'Um carro velho', 'Pessoa fofoqueira e maledicente', 'Um barco pequeno'], a: 2 },
  { q: '"Tucunaré" é:', ops: ['Tipo de macaco', 'Ave amazônica', 'Peixe muito apreciado na culinária paraense', 'Fruta do cerrado'], a: 2 },
  { q: '"Botar pra quebrar" significa:', ops: ['Quebrar objetos', 'Começar a dançar e se divertir muito', 'Brigar fisicamente', 'Trabalhar com dedicação'], a: 1 },
  { q: '"Tá bão" significa:', ops: ['Estou com fome', 'Que saudade!', 'Está bom, está bem', 'Vamos embora logo'], a: 2 },
  { q: '"Pajé" é:', ops: ['Tipo de peixe amazônico', 'Líder espiritual e curandeiro indígena', 'Uma dança típica', 'Fruto da floresta'], a: 1 },
  { q: 'O "Círio de Nazaré" em Belém é:', ops: ['Uma feira de artesanato', 'Festival gastronômico anual', 'Uma das maiores procissões católicas do mundo', 'Campeonato de futebol regional'], a: 2 },
  { q: 'O açaí no Pará é consumido principalmente como:', ops: ['Sobremesa doce com granola', 'Bebida energética gelada', 'Alimento principal com peixe ou carne', 'Suco com leite condensado'], a: 2 },
  { q: '"Boi-bumbá" é:', ops: ['Um tipo de peixe gigante', 'Festival folclórico famoso no Norte do Brasil', 'Uma bebida típica', 'Um instrumento musical'], a: 1 },
  { q: 'A farinha d\'água tem sabor:', ops: ['Muito doce', 'Azedo / fermentado, típico da culinária paraense', 'Completamente neutro', 'Muito picante'], a: 1 },
  { q: 'O camarão do tacacá é geralmente:', ops: ['Sempre camarão fresco vivo', 'Camarão seco e temperado', 'Camarão de água doce', 'Lagostim amazônico'], a: 1 },
  { q: '"É memo" significa:', ops: ['Mesmo assim...', 'É mesmo, é verdade', 'Não sei ao certo', 'Talvez sim'], a: 1 },
  { q: '"Aranha" no linguajar informal pode ser:', ops: ['Somente o aracnídeo', 'Pessoa esperta e malandra', 'Forma de chamar a mãe', 'Um prato típico'], a: 1 },
  { q: '"Pato no tucupi" é:', ops: ['Pato selvagem criado solto', 'Prato paraense com pato cozido em tucupi e jambu', 'Pato assado com farinha', 'Nome de uma dança folclórica'], a: 1 },
  { q: 'O "Ver-o-Peso" em Belém é famoso por ser:', ops: ['Um parque de diversões', 'Um estádio de futebol', 'Um dos maiores mercados a céu aberto da América Latina', 'Uma praia fluvial'], a: 2 },
  { q: '"Tcho" no linguajar paraense significa:', ops: ['Obrigado', 'Tchau, até logo', 'Com licença', 'Desculpe'], a: 1 },
  // --- Mais gírias ---
  { q: '"Égua!" é usado no Pará para expressar:', ops: ['Apenas raiva', 'Surpresa, admiração ou espanto', 'Tristeza', 'Cumprimento formal'], a: 1 },
  { q: '"Abestado" no Pará significa:', ops: ['Muito cansado', 'Tolo, distraído, bobo', 'Muito feliz', 'Com fome'], a: 1 },
  { q: '"Pitiço" é:', ops: ['Peixe pequeno', 'Cigarro de palha', 'Dança regional', 'Gato jovem'], a: 1 },
  { q: '"Breu" no linguajar informal é:', ops: ['Tipo de peixe', 'Escuridão total', 'Bebida regional', 'Instrumento'], a: 1 },
  { q: '"Apanhar" no Pará pode significar:', ops: ['Somente levar surra', 'Pegar ou buscar algo', 'Perder competição', 'Ficar doente'], a: 1 },
  { q: '"Bagulho" no linguajar jovem significa:', ops: ['Saco de lixo', 'Coisa, objeto', 'Pessoa engraçada', 'Tipo de peixe'], a: 1 },
  { q: '"Vixe!" é uma interjeição de:', ops: ['Alegria extrema', 'Susto ou lamento', 'Raiva intensa', 'Cumprimento'], a: 1 },
  { q: '"Que saudade de ti!" usa "ti" como herança do:', ops: ['Inglês colonial', 'Português arcaico/europeu', 'Tupi', 'Espanhol'], a: 1 },
  { q: '"O quê que tem?" significa:', ops: ['Tem algo errado?', 'O que há de novidade?', 'Tenho algo a dizer', 'Que problema há?'], a: 1 },
  { q: '"É memo" significa:', ops: ['Mesmo assim...', 'É mesmo, é verdade', 'Não sei', 'Talvez'], a: 1 },
  { q: '"Mana, é muita pressão!" quer dizer:', ops: ['Está com pressa', 'Está difícil/exigente demais', 'Muito barulho', 'Está com raiva'], a: 1 },
  { q: '"Bora" significa:', ops: ['Embarcação pequena', 'Espera um pouco', 'Vamos, vamos embora', 'Tipo de fruta'], a: 2 },
  { q: '"Tá bão" significa:', ops: ['Estou com fome', 'Que saudade!', 'Está bom, está bem', 'Vamos embora'], a: 2 },
  { q: '"Bicho" no Pará é usado para:', ops: ['Xingar alguém', 'Só animais selvagens', 'Chamar alguém carinhosamente', 'Desafiar briga'], a: 2 },
  { q: '"Botar pra quebrar" significa:', ops: ['Quebrar objetos', 'Dançar muito e se divertir', 'Brigar fisicamente', 'Trabalhar muito'], a: 1 },
  { q: '"Arregaçar" no Pará significa:', ops: ['Trabalhar muito', 'Arrumar casa', 'Bater em alguém', 'Preparar almoço'], a: 2 },
  { q: '"Boa praça" descreve:', ops: ['Mercado famoso', 'Pessoa simpática e gente boa', 'Praça bem cuidada', 'Bom negócio'], a: 1 },
  { q: '"Marvada" é apelido de:', ops: ['Mulher bonita', 'Música animada', 'Cachaça', 'Fruta ácida'], a: 2 },
  { q: '"Caçar" no linguajar paraense pode significar:', ops: ['Só caçar animais', 'Procurar/buscar algo', 'Brigar', 'Cozinhar'], a: 1 },
  { q: '"Carapanã" é:', ops: ['Caranguejo pequeno', 'Tipo de canoa', 'Mosquito', 'Peixe de rio'], a: 2 },
  { q: '"Muruçoca" é o mesmo que:', ops: ['Formiga de fogo', 'Mosquito/pernilongo', 'Barata d\'água', 'Grilo'], a: 1 },
  // --- Culinária paraense (mais) ---
  { q: 'O "beiju" é feito de:', ops: ['Farinha de trigo', 'Goma/fécula de mandioca', 'Fubá de milho', 'Farinha de arroz'], a: 1 },
  { q: '"Chibé" é mistura de:', ops: ['Açaí com tapioca', 'Farinha d\'água com água', 'Tucupi com pimenta', 'Mandioca com leite'], a: 1 },
  { q: '"Pimenta murupi" é famosa por:', ops: ['Cor verde permanente', 'Ser das mais ardidas do Brasil', 'Sabor adocicado', 'Ser só seca'], a: 1 },
  { q: '"Pimenta-de-cheiro" é conhecida por:', ops: ['Ser a mais ardida', 'Aroma marcante e ardência moderada', 'Não ter aroma', 'Ser preta'], a: 1 },
  { q: '"Mujica paraense" (moqueca) leva:', ops: ['Tomate e leite de coco', 'Peixe, tucupi e jambu', 'Frango e amendoim', 'Carne e pimenta'], a: 1 },
  { q: '"Farinada" é preparo de farinha:', ops: ['Crua com açúcar', 'Torrada com temperos e às vezes ovo', 'Cozida no leite', 'Frita em gordura'], a: 1 },
  { q: '"Caldeirada" paraense é:', ops: ['Frango com batata', 'Peixe com legumes e tucupi', 'Feijoada com linguiça', 'Cozido de carne seca'], a: 1 },
  { q: '"Fritura de peixe" no Pará acompanha:', ops: ['Só arroz branco', 'Farinha d\'água, pirão e açaí', 'Macarrão e salada', 'Purê de batata'], a: 1 },
  { q: '"X-Burguer com açaí" é criação de qual cidade?', ops: ['Belém', 'São Paulo', 'Recife', 'Fortaleza'], a: 0 },
  { q: '"Tacacazeiro" em Belém trabalha em:', ops: ['Restaurantes formais', 'Tendas nas ruas', 'Supermercados', 'Barcos'], a: 1 },
  { q: 'No tacacá, a "goma" é:', ops: ['Farinha de tapioca', 'Tucupi engrossado com amido', 'Caldo de peixe', 'Extrato de ervas'], a: 1 },
  { q: '"Arroz com açaí" é prato típico de qual refeição?', ops: ['Café da manhã', 'Almoço', 'Café da tarde', 'Jantar'], a: 1 },
  { q: 'O "açaí na tigela" do Sul difere do paraense porque:', ops: ['É a mesma coisa', 'No Pará é caldo salgado com peixe/carne', 'Com vitamina de banana', 'Com granola'], a: 1 },
  { q: '"Camarão na moranga" é prato popularmente atribuído ao:', ops: ['Norte do Brasil', 'Nordeste', 'Sul', 'Centro-Oeste'], a: 0 },
  { q: 'A "pupunha" é geralmente consumida:', ops: ['Crua', 'Cozida na água com sal', 'Assada na brasa', 'Frita'], a: 1 },
  { q: '"Castanha-do-Pará" é outro nome para:', ops: ['Caju amazônico', 'Castanha-do-Brasil', 'Nozes do cerrado', 'Macadâmia'], a: 1 },
  { q: '"Mingau de açaí" é consumido principalmente na:', ops: ['Capital Belém', 'Região do Marajó e interior', 'Capitais do Sul', 'Europa'], a: 1 },
  { q: '"Banho de cheiro" no Pará usa:', ops: ['Água do mar', 'Ervas aromáticas para atrair sorte', 'Lama medicinal', 'Sumo de frutas'], a: 1 },
  // --- Folclore e lendas ---
  { q: '"Curupira" na Amazônia é:', ops: ['Tipo de macaco', 'Entidade protetora com pés virados', 'Peixe carnívoro', 'Espírito das águas'], a: 1 },
  { q: '"Matinta Perera" é:', ops: ['Fruta amazônica', 'Figura que assobia na noite', 'Prato do interior', 'Bairro de Belém'], a: 1 },
  { q: '"Boitatá" é:', ops: ['Peixe elétrico', 'Cobra de fogo que protege os campos', 'Dança indígena', 'Fruto de palmeira'], a: 1 },
  { q: '"Mapinguari" é lendariamente uma:', ops: ['Piranha gigante', 'Criatura humanóide com cheiro forte', 'Espírito de cachoeiras', 'Jaguar sobrenatural'], a: 1 },
  { q: '"Iara" é lenda de:', ops: ['Guerreiro indígena', 'Mulher sereia das águas amazônicas', 'Monstro da floresta', 'Ancestral dos boto'], a: 1 },
  { q: '"Cobra Grande" protege:', ops: ['As florestas', 'Os rios e lagoas', 'As plantações', 'Os animais'], a: 1 },
  { q: '"Encantado" na crença amazônica é:', ops: ['Lugar místico subaquático com seres mágicos', 'Nome de cidade', 'Prato típico', 'Festa religiosa'], a: 0 },
  { q: '"Pajelança" é prática de:', ops: ['Culinária indígena', 'Cura e rituais espirituais com o pajé', 'Artesanato', 'Caça e pesca'], a: 1 },
  { q: '"Uirapuru" é famoso por:', ops: ['Plumagem azul brilhante', 'Canto melodioso e lendas de amor', 'Ser o maior pássaro', 'Rituais indígenas'], a: 1 },
  // --- História do Pará ---
  { q: 'Belém do Pará foi fundada em:', ops: ['1615', '1616', '1620', '1600'], a: 1 },
  { q: 'Quem fundou Belém?', ops: ['Pedro Álvares Cabral', 'Francisco Caldeira Castelo Branco', 'Duque de Caxias', 'Tomé de Sousa'], a: 1 },
  { q: 'A "cabanagem" foi revolta paraense em:', ops: ['1500-1510', '1835-1840', '1889-1895', '1930-1935'], a: 1 },
  { q: 'A cabanagem matou cerca de:', ops: ['10% da população do Pará', '30-40% da população do Pará', '2% da população', 'Só soldados'], a: 1 },
  { q: 'O ciclo da borracha no Pará foi em:', ops: ['1700-1750', '1850-1912', '1920-1950', '1960-1990'], a: 1 },
  { q: 'O Teatro da Paz foi construído graças à riqueza da:', ops: ['Ouro', 'Borracha', 'Cana-de-açúcar', 'Cacau'], a: 1 },
  { q: '"Aviamento" no ciclo da borracha era:', ops: ['Aviões que levavam látex', 'Seringueiros recebiam mercadorias e ficavam endividados', 'Governo taxava exportação', 'Barcos distribuíam produto'], a: 1 },
  { q: '"Fordlândia" foi projeto de Ford para produzir:', ops: ['Automóveis na Amazônia', 'Borracha para pneus', 'Minério de ferro', 'Soja para exportação'], a: 1 },
  { q: '"Redenção" no Sul do Pará foi 1° município a:', ops: ['Abolir a escravidão no Brasil (1883)', 'Ter luz elétrica no Norte', 'Ter internet no Pará', 'Ter TV no Norte'], a: 0 },
  { q: '"Serra Pelada" ficou famosa pelo garimpo de:', ops: ['Diamantes', 'Ouro', 'Esmeraldas', 'Nióbio'], a: 1 },
  { q: 'As fotos de Serra Pelada foram tiradas por:', ops: ['Sebastião Salgado', 'Cartier-Bresson', 'Steve McCurry', 'Marc Riboud'], a: 0 },
  // --- Geografia do Pará ---
  { q: 'O Pará é o maior produtor mundial de:', ops: ['Café', 'Soja', 'Açaí', 'Borracha'], a: 2 },
  { q: 'O Estado do Pará tem quantos municípios?', ops: ['100', '144', '200', '256'], a: 1 },
  { q: 'Santarém fica na confluência dos rios:', ops: ['Xingu e Tocantins', 'Tapajós e Amazonas', 'Guamá e Acará', 'Negro e Solimões'], a: 1 },
  { q: 'A usina de Tucuruí está no rio:', ops: ['Xingu', 'Tapajós', 'Tocantins', 'Araguaia'], a: 2 },
  { q: 'A Usina de Belo Monte está no rio:', ops: ['Tocantins', 'Tapajós', 'Xingu', 'Madeira'], a: 2 },
  { q: 'O Pará tem fronteira com quantos países?', ops: ['1 (Suriname)', '2 (Suriname e Guiana)', '3 (Suriname, Guiana e Venezuela)', '4 países'], a: 1 },
  { q: '"Altamira" é o município com maior área territorial do:', ops: ['Pará', 'Brasil e do mundo', 'Norte do Brasil', 'América Latina'], a: 1 },
  { q: '"Parauapebas" cresceu por causa da:', ops: ['Pesca', 'Mineração (Carajás)', 'Pecuária', 'Turismo'], a: 1 },
  { q: '"Marabá" fica na confluência dos rios:', ops: ['Xingu e Tapajós', 'Itacaiúnas e Tocantins', 'Guamá e Capim', 'Araguaia e Xingu'], a: 1 },
  { q: '"Oriximiná" no Pará tem mineração de:', ops: ['Ouro', 'Bauxita (alumínio)', 'Ferro', 'Manganês'], a: 1 },
  { q: '"Juruti" no Pará tem mineração de:', ops: ['Nióbio', 'Bauxita', 'Ouro', 'Diamante'], a: 1 },
  { q: 'A Ilha de Marajó tem área maior que:', ops: ['Estado do RJ', 'Portugal e Suíça juntos', 'Somente Luxemburgo', 'Um estado de SP'], a: 1 },
  { q: 'Os búfalos de Marajó chegaram via:', ops: ['Importação europeia', 'Naufrágio no século XIX', 'Imigração asiática', 'Criação indígena'], a: 1 },
  { q: 'O rio que banha Belém é o:', ops: ['Amazonas', 'Baía do Guajará/Rio Guamá', 'Tocantins', 'Xingu'], a: 1 },
  { q: '"Salinópolis" é conhecida por:', ops: ['Mineração de sal', 'Praia e veraneio', 'Pesca industrial', 'Açaí'], a: 1 },
  { q: 'O "Salgado Paraense" é região do:', ops: ['Interior', 'Litoral nordeste do Pará', 'Sul do Pará', 'Oeste do Pará'], a: 1 },
  { q: 'A FLONA do Tapajós fica próxima de:', ops: ['Belém', 'Santarém/Belterra', 'Altamira', 'Marabá'], a: 1 },
  { q: 'O Parque Nacional da Amazônia fica em:', ops: ['Santarém', 'Itaituba', 'Altamira', 'Marabá'], a: 1 },
  // --- Fauna amazônica ---
  { q: '"Sucuri" (anaconda) é a maior serpente do mundo em:', ops: ['Comprimento', 'Peso/volume', 'Velocidade', 'Veneno'], a: 1 },
  { q: '"Poraquê" é o nome popular do:', ops: ['Pirarucu jovem', 'Peixe-elétrico', 'Tambaqui pequeno', 'Boto-bebê'], a: 1 },
  { q: '"Ariranha" é o maior membro da família das:', ops: ['Castores', 'Lontras', 'Texugos', 'Ratazanas'], a: 1 },
  { q: '"Peixe-boi-da-Amazônia" está ameaçado pela:', ops: ['Poluição industrial', 'Caça histórica para carne e gordura', 'Falta de alimento', 'Predação de onças'], a: 1 },
  { q: '"Jacaré-açu" pode medir até:', ops: ['1,5 m', '3 m', '6 m', '10 m'], a: 2 },
  { q: '"Capivara" é o maior roedor do:', ops: ['Mundo', 'Brasil', 'América do Sul', 'Amazônia'], a: 0 },
  { q: '"Harpia" (gavião-real) é a águia mais poderosa das:', ops: ['Savanas africanas', 'Florestas tropicais das Américas', 'Cordilheiras andinas', 'Pradarias'], a: 1 },
  { q: '"Guariba" (bugio) é famoso por:', ops: ['Acrobacias', 'Uivos que ecoam na floresta', 'Cor azul', 'Comer peixe'], a: 1 },
  { q: '"Paca" pesa até:', ops: ['500g', '5 kg', '14 kg', '30 kg'], a: 2 },
  { q: '"Cotia" (cutia) ajuda a floresta porque:', ops: ['É presa fácil', 'Enterra sementes e regenera a floresta', 'Limpa rios', 'Alimenta onças'], a: 1 },
  { q: '"Boto-cor-de-rosa" é na verdade um:', ops: ['Golfinho fluvial', 'Peixe de couro', 'Cetáceo marinho', 'Tartaruga grande'], a: 0 },
  { q: '"Tucuxi" é um golfinho:', ops: ['Rosa', 'Cinza, menor que o boto, fluvial', 'Branco, marinho', 'Azul, do Pacífico'], a: 1 },
  { q: '"Arraia-de-fogo" é perigosa por:', ops: ['Dentes afiados', 'Ferrão venenoso na cauda', 'Descarga elétrica', 'Veneno na pele'], a: 1 },
  { q: '"Aruanã" destaca-se por:', ops: ['Ser minúsculo', 'Pular fora d\'água para caçar', 'Carne tóxica', 'Luz bioluminescente'], a: 1 },
  { q: '"Piraíba" (filhote gigante) pode pesar até:', ops: ['20 kg', '60 kg', '200 kg', '500 kg'], a: 2 },
  { q: '"Arapaima" é outro nome para o:', ops: ['Tambaqui', 'Pirarucu', 'Filhote', 'Surubim'], a: 1 },
  { q: '"Tarantula do Pará" (aranha-caranguejeira) — sua picada:', ops: ['É fatal', 'Causa dor mas raramente é fatal', 'Não causa reação', 'Causa paralisia'], a: 1 },
  { q: '"Arara-azul-grande" está ameaçada por:', ops: ['Predadores naturais', 'Tráfico de animais e perda de habitat', 'Doença aviária', 'Competição'], a: 1 },
  { q: '"Onça-pintada" em tupi é chamada de:', ops: ['Sucuri', 'Jaguaretê', 'Tapira', 'Capivara'], a: 1 },
  { q: '"Tatu-canastra" (gigante) pode pesar até:', ops: ['5 kg', '30 kg', '60 kg', '100 kg'], a: 1 },
  { q: '"Mucura" (gambá) para escapar predadores:', ops: ['Ataca', 'Finge-se de morto', 'Voa', 'Mergulha'], a: 1 },
  // --- Flora amazônica ---
  { q: '"Açaí" em tupi significa:', ops: ['Fruto do mar', 'Fruto que chora/fruto escuro', 'Árvore sagrada', 'Coração verde'], a: 1 },
  { q: '"Cupuaçu" pertence à família do:', ops: ['Manga', 'Cacau (Theobroma)', 'Mamão', 'Jaca'], a: 1 },
  { q: '"Guaraná" é originário da:', ops: ['África tropical', 'Amazônia brasileira', 'Índia', 'América Central'], a: 1 },
  { q: '"Ingá" come-se apenas:', ops: ['A casca', 'A semente torrada', 'A polpa branca que envolve a semente', 'O caroço'], a: 2 },
  { q: '"Bacaba" é parecida com açaí, porém:', ops: ['De cor amarela', 'Mais gordurosa e cor escura avermelhada', 'Mais doce e vermelha', 'Não tem semelhança'], a: 1 },
  { q: '"Andiroba" é usada como:', ops: ['Alimento cotidiano', 'Óleo medicinal e repelente natural', 'Corante de tecidos', 'Instrumento'], a: 1 },
  { q: '"Copaíba" é óleo amazônico para:', ops: ['Cozinhar', 'Cicatrização e uso medicinal', 'Fazer farinha', 'Tingir madeira'], a: 1 },
  { q: '"Miriti" é palmeira usada em:', ops: ['Culinária', 'Artesanato (bonecos de miriti de Abaetetuba)', 'Medicina', 'Construção naval'], a: 1 },
  { q: '"Seringueira" (Hevea brasiliensis) é nativa da:', ops: ['Amazônia brasileira', 'Borneo asiática', 'África central', 'América Central'], a: 0 },
  { q: '"Patauá" é palmeira que produz:', ops: ['Óleo e polpa parecida com açaí', 'Palha para artesanato', 'Madeira de construção', 'Resina medicinal'], a: 0 },
  { q: '"Murumuru" é palmeira usada para:', ops: ['Alimentação direta', 'Extração de óleo para cosméticos', 'Instrumentos', 'Construção'], a: 1 },
  { q: '"Taperebá" (cajá-mirim) é muito usado para:', ops: ['Construção', 'Alimentar pássaros', 'Sucos e sorvetes', 'Fazer carvão'], a: 2 },
  { q: '"Murici" é uma:', ops: ['Espécie de peixe', 'Instrumento', 'Fruta amarela, pequena e cheirosa', 'Localidade'], a: 2 },
  { q: '"Bacuri" é:', ops: ['Madeira nobre', 'Dança folclórica', 'Fruta amazônica agridoce', 'Peixe de rio'], a: 2 },
  // --- Cultura e eventos ---
  { q: 'O carimbó foi reconhecido pela UNESCO em:', ops: ['2010', '2014', '2019', '2022'], a: 1 },
  { q: 'O instrumento principal do carimbó é:', ops: ['Viola caipira', 'Tambor de madeira escavado (curimbó)', 'Sanfona', 'Pandeiro'], a: 1 },
  { q: '"Lambada" surgiu no Pará?', ops: ['Não, na Bahia', 'Sim, especialmente em Belém', 'No Rio de Janeiro', 'Em Portugal'], a: 1 },
  { q: '"Tecnobrega" surgiu em:', ops: ['São Paulo', 'Belém do Pará', 'Fortaleza', 'Manaus'], a: 1 },
  { q: '"Aparelhagem" no tecnobrega é:', ops: ['Instrumento musical', 'Sistema de som itinerante com DJs', 'Equipamento de pesca', 'Barco'], a: 1 },
  { q: '"Gaby Amarantos" ficou famosa por:', ops: ['Carimbó clássico', 'Tecnobrega e pop amazônico', 'Sertanejo', 'Funk carioca'], a: 1 },
  { q: '"Pinduca" é o "rei" de qual ritmo?', ops: ['Tecnobrega', 'Carimbó', 'Lambada', 'Brega'], a: 1 },
  { q: 'O Teatro da Paz foi inaugurado em:', ops: ['1878', '1860', '1900', '1920'], a: 0 },
  { q: '"Estação das Docas" em Belém é:', ops: ['Estaleiros ativos', 'Armazéns históricos revitalizados à beira do rio', 'Museus de arte contemporânea', 'Hotéis de luxo'], a: 1 },
  { q: 'Belém é conhecida como "Cidade das":', ops: ['Praias', 'Mangueiras', 'Flores', 'Pedras'], a: 1 },
  { q: 'O Museu Goeldi em Belém é de:', ops: ['Zoologia e botânica amazônica', 'Arte moderna', 'História colonial', 'Tecnologia'], a: 0 },
  { q: '"Pássaro junino" paraense envolve:', ops: ['Soltar pássaros', 'Teatro musicado sobre caça e cura de pássaro', 'Canto de pássaros', 'Dança em fogueira'], a: 1 },
  { q: 'O "Círio de Nazaré" acontece em que mês?', ops: ['Julho', 'Agosto', 'Outubro', 'Dezembro'], a: 2 },
  { q: 'A imagem de Nossa Senhora de Nazaré foi encontrada por:', ops: ['Padre jesuíta', 'Caboclo chamado Plácido', 'Pescador', 'Navegador português'], a: 1 },
  { q: '"Arraial do Pavulagem" celebra:', ops: ['Colheita do açaí', 'Festas com ritmos amazônicos', 'Chegada de navios', 'O Círio'], a: 1 },
  { q: '"Candomblé de caboclo" ou "Tambor de Mina" tem matriz:', ops: ['Europeia', 'Africana com influência indígena', 'Asiática', 'Ameríndia pura'], a: 1 },
  { q: '"Festival de Miriti" acontece em:', ops: ['Belém', 'Abaetetuba', 'Santarém', 'Castanhal'], a: 1 },
  { q: '"Rec\'n\'Play" festival acontece em:', ops: ['Belém', 'Santarém', 'Manaus', 'Macapá'], a: 0 },
  // --- Esportes ---
  { q: '"Remo" e "Paysandu" são times de futebol de:', ops: ['Manaus', 'Belém do Pará', 'Santarém', 'São Luís'], a: 1 },
  { q: '"Papão" é apelido do:', ops: ['Remo', 'Paysandu', 'Tuna Luso', 'Castanhal'], a: 1 },
  { q: '"Baenão" é apelido do:', ops: ['Paysandu', 'Remo', 'Bragantino', 'Castanhal'], a: 1 },
  { q: '"Re-Pa" é clássico entre:', ops: ['Remo e Paysandu', 'Remo e Paragominas', 'Remo e Pará Clube', 'Paysandu e Papão'], a: 0 },
  { q: 'O "Mangueirão" é estádio de:', ops: ['Santarém', 'Marabá', 'Belém', 'Castanhal'], a: 2 },
  // --- Educação e meio ambiente ---
  { q: 'A UFPA foi fundada em:', ops: ['1957', '1945', '1970', '1988'], a: 0 },
  { q: 'Belém sediará a COP em que ano?', ops: ['2024', '2025', '2026', '2027'], a: 1 },
  { q: '"Bioeconomia" na Amazônia refere-se a:', ops: ['Agronegócio convencional', 'Uso sustentável dos recursos biológicos', 'Mineração responsável', 'Turismo de massas'], a: 1 },
  { q: '"Ribeirinho" é o morador das:', ops: ['Periferias de Belém', 'Margens de rios e várzeas', 'Zonas industriais', 'Bairros ricos'], a: 1 },
  { q: '"Quilombola" é descendente de escravizados que:', ops: ['Não tem identidade cultural', 'Preserva comunidade e cultura', 'Vive em cidades grandes', 'Perdeu seus costumes'], a: 1 },
  { q: '"Igarapé" em tupi significa:', ops: ['Rio grande', 'Caminho de canoa', 'Floresta densa', 'Margem pantanosa'], a: 1 },
  { q: '"Igapó" é floresta:', ops: ['Em terra seca', 'Permanentemente alagada', 'Em cerrado', 'Em montanhas'], a: 1 },
  { q: '"Várzea" é área:', ops: ['Terra seca perto do rio', 'Inundada sazonalmente pelas cheias', 'Montanha ribeirinha', 'Praia permanente'], a: 1 },
  { q: '"Quem come jaraqui não sai mais do Pará" é:', ops: ['Receita culinária', 'Maldição indígena', 'Ditado popular sobre apego ao Pará', 'Crença religiosa'], a: 2 },
  { q: 'A "cerâmica marajoara" é famosa por seus:', ops: ['Tons azuis e brancos', 'Motivos geométricos e zoomórficos complexos', 'Figuras de santos', 'Cor vermelha uniforme'], a: 1 },
  { q: 'Cacique Raoni pertence à etnia:', ops: ['Yanomami', 'Mẽbêngôkre (Kayapó)', 'Munduruku', 'Gavião'], a: 1 },
  { q: '"Munduruku" vive principalmente no rio:', ops: ['Xingu', 'Tapajós', 'Tocantins', 'Araguaia'], a: 1 },
  { q: 'A "caçar" no Pará pode significar:', ops: ['Só caçar animais', 'Buscar/procurar algo', 'Brigar com alguém', 'Cozinhar'], a: 1 },
  { q: '"Dendezeiro" (palma de óleo) no Pará serve para:', ops: ['Madeira', 'Óleo de palma para biodiesel e alimentação', 'Sombra urbana', 'Artesanato'], a: 1 },
  { q: '"Tucumã com queijo" é lanche típico de:', ops: ['Belém', 'Manaus (AM)', 'Macapá', 'Santarém'], a: 1 },
  { q: '"Açaizal" é:', ops: ['Prato de açaí', 'Local com muitos açaizeiros', 'Barco típico', 'Festa junina'], a: 1 },
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
