import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerBottomNav from '../components/CustomerBottomNav';

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
];

function shuffleArray(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

export default function CustomerQuiz() {
  const navigate = useNavigate();
  const [qs, setQs] = useState([]);
  const [idx, setIdx] = useState(0);
  const [score, setScore] = useState(0);
  const [selected, setSelected] = useState(null);
  const [done, setDone] = useState(false);

  function init() {
    setQs(shuffleArray(GIRIAS_QUESTIONS).slice(0, 10));
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
    <div style={{ minHeight: '100vh', paddingBottom: 80 }}>
      <div className="header" style={{ padding: '8px 16px' }}>
        <div className="header-left">
          <button className="btn btn-sm"
            style={{ background: 'var(--border)', color: 'var(--primary-dark)', fontSize: 22, width: 36, height: 36, borderRadius: '50%', padding: 0, fontWeight: 700, lineHeight: 1, display: 'flex', alignItems: 'center', justifyContent: 'center', border: 'none', cursor: 'pointer' }}
            onClick={() => navigate(-1)}>‹</button>
        </div>
        <div className="header-right">
          <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--primary)' }}>Quiz Paraense</span>
        </div>
      </div>

      <div className="container">
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
      </div>
      <CustomerBottomNav />
    </div>
  );
}
