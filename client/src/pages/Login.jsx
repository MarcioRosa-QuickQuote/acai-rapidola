import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const berries = Array.from({ length: 18 }, (_, i) => ({
  id: i,
  left: `${5 + Math.random() * 90}%`,
  top: `${5 + Math.random() * 90}%`,
  size: 12 + Math.random() * 22,
  duration: 6 + Math.random() * 10,
  delay: Math.random() * 5,
  parallax: 0.02 + Math.random() * 0.04
}));

export default function Login() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('admin');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showTest, setShowTest] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });
  const bgRef = useRef(null);

  useEffect(() => {
    const handleMove = (e) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setMousePos({
        x: (e.clientX - w / 2) / (w / 2),
        y: (e.clientY - h / 2) / (h / 2)
      });
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(phone, password);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  function fillTest(role) {
    const accounts = { store: 'admin', motoboy: 'motoboy', customer: 'cliente' };
    setPhone(accounts[role] || '');
    setPassword('123456');
    setShowTest(false);
  }

  return (
    <div ref={bgRef} style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #1a0533 0%, #2d0a4e 30%, #4A148C 60%, #7B1FA2 100%)',
      padding: 20, position: 'relative', overflow: 'hidden'
    }}>
      {/* Floating acai berries */}
      {berries.map(b => (
        <div key={b.id} style={{
          position: 'absolute',
          left: b.left, top: b.top,
          width: b.size, height: b.size,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, #7B1FA2, #1a0533)`,
          opacity: 0.25 + b.parallax * 2,
          filter: 'blur(0.5px)',
          transform: `translate(${mousePos.x * b.size * b.parallax * -1}px, ${mousePos.y * b.size * b.parallax * -1}px)`,
          transition: 'transform 0.6s ease-out',
          animation: `floatBerry ${b.duration}s ease-in-out ${b.delay}s infinite`,
          boxShadow: '0 0 8px rgba(155, 81, 224, 0.2)'
        }} />
      ))}

      {/* Glow orbs */}
      <div style={{
        position: 'absolute', width: 350, height: 350, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(156,39,176,0.15), transparent)',
        top: '10%', left: '-10%',
        transform: `translate(${mousePos.x * 20}px, ${mousePos.y * 20}px)`,
        transition: 'transform 0.8s ease-out'
      }} />
      <div style={{
        position: 'absolute', width: 280, height: 280, borderRadius: '50%',
        background: 'radial-gradient(circle, rgba(106,27,154,0.12), transparent)',
        bottom: '5%', right: '-8%',
        transform: `translate(${mousePos.x * -15}px, ${mousePos.y * -15}px)`,
        transition: 'transform 0.8s ease-out'
      }} />

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 440,
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(20px)',
        borderRadius: 24,
        boxShadow: '0 20px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05)',
        overflow: 'hidden',
        position: 'relative', zIndex: 1,
        transform: `translate(${mousePos.x * -3}px, ${mousePos.y * -3}px)`,
        transition: 'transform 0.5s ease-out'
      }}>
        {/* Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #4A148C 0%, #6A1B9A 50%, #9C27B0 100%)',
          padding: '16px 30px 14px',
          textAlign: 'center', color: 'white',
          position: 'relative', overflow: 'hidden'
        }}>
          <div style={{
            position: 'absolute', width: 200, height: 200, borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(255,255,255,0.1), transparent)',
            top: -60, left: '50%',
            transform: `translate(-50%, ${mousePos.y * 10}px)`,
            transition: 'transform 0.8s ease-out'
          }} />

          <img
            src="/logo.png"
            alt="Pé de Açaí"
            style={{
              width: 200, height: 200, borderRadius: 28,
              objectFit: 'contain',
              position: 'relative', zIndex: 1,
              marginBottom: 4,
              filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.25))'
            }}
          />
          <p style={{
            opacity: 0.75, fontSize: 13, fontWeight: 400,
            position: 'relative', zIndex: 1, margin: 0
          }}>
            O jeito mais rápido de pedir seu açaí
          </p>
        </div>

        {/* Form */}
        <div style={{ padding: '20px 30px 24px' }}>
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: '#FFF0F0', color: '#C62828', padding: '12px 16px',
                borderRadius: 12, marginBottom: 20, fontSize: 13,
                border: '1px solid #FFCDD2', display: 'flex', alignItems: 'center', gap: 8
              }}>
                <svg width="18" height="18" viewBox="0 0 24 24" fill="#C62828"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6, display: 'block' }}>
                Telefone
              </label>
              <input
                type="text" value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(11) 99999-9999" required
                style={{
                  width: '100%', padding: '14px 16px', fontSize: 16,
                  border: '2px solid #E8E0F0', borderRadius: 12, outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={e => { e.target.style.borderColor = '#9C27B0'; e.target.style.boxShadow = '0 0 0 3px rgba(156,39,176,0.1)'; }}
                onBlur={e => { e.target.style.borderColor = '#E8E0F0'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6, display: 'block' }}>
                Senha
              </label>
              <input
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Sua senha" required
                style={{
                  width: '100%', padding: '14px 16px', fontSize: 16,
                  border: '2px solid #E8E0F0', borderRadius: 12, outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={e => { e.target.style.borderColor = '#9C27B0'; e.target.style.boxShadow = '0 0 0 3px rgba(156,39,176,0.1)'; }}
                onBlur={e => { e.target.style.borderColor = '#E8E0F0'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '15px',
              background: 'linear-gradient(135deg, #6A1B9A, #9C27B0)',
              color: 'white', border: 'none', borderRadius: 12,
              fontSize: 16, fontWeight: 700,
              cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.7 : 1,
              transition: 'box-shadow 0.2s, transform 0.15s',
              boxShadow: '0 4px 14px rgba(106,27,154,0.4)'
            }}
              onMouseOver={e => !loading && (e.target.style.boxShadow = '0 6px 22px rgba(106,27,154,0.55)')}
              onMouseOut={e => !loading && (e.target.style.boxShadow = '0 4px 14px rgba(106,27,154,0.4)')}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>

            <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: '#888' }}>
              Não tem conta?{' '}
              <Link to="/register" style={{ color: '#6A1B9A', fontWeight: 700, textDecoration: 'none' }}>
                Cadastre-se
              </Link>
            </p>
          </form>

          <div style={{ marginTop: 24, borderTop: '1px solid #F3E5F5', paddingTop: 16, textAlign: 'center' }}>
            <button onClick={() => setShowTest(!showTest)} style={{
              background: 'none', border: 'none', color: '#CCC', fontSize: 11, cursor: 'pointer'
            }}>
              {showTest ? 'Ocultar' : 'Contas de teste'}
            </button>
            {showTest && (
              <div style={{ marginTop: 8, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                {[
                  { role: 'store', label: 'Loja', bg: '#F3E5F5', color: '#6A1B9A' },
                  { role: 'motoboy', label: 'Motoboy', bg: '#E8F5E9', color: '#2E7D32' },
                  { role: 'customer', label: 'Cliente', bg: '#E3F2FD', color: '#1565C0' }
                ].map(({ role, label, bg, color }) => (
                  <button key={role} onClick={() => fillTest(role)} style={{
                    background: bg, color, border: 'none',
                    padding: '6px 14px', borderRadius: 20, fontSize: 12, fontWeight: 600, cursor: 'pointer'
                  }}>{label}</button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      <style>{`
        @keyframes floatBerry {
          0%, 100% { transform: translateY(0px) scale(1); opacity: 0.25; }
          50% { transform: translateY(-12px) scale(1.08); opacity: 0.35; }
        }
      `}</style>

      <p style={{ marginTop: 24, fontSize: 11, color: 'rgba(255,255,255,0.35)', zIndex: 1 }}>
        Pé de Açaí © 2026 — v303
      </p>
    </div>
  );
}
