import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

const berries = Array.from({ length: 15 }, (_, i) => ({
  id: i,
  left: `${5 + Math.random() * 90}%`,
  top: `${10 + Math.random() * 80}%`,
  size: 10 + Math.random() * 20,
  duration: 7 + Math.random() * 8,
  delay: Math.random() * 5,
  parallax: 0.02 + Math.random() * 0.04
}));

export default function Register() {
  const { register, apiFetch, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token');
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('customer');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  useEffect(() => {
    if (inviteToken) {
      logout();
      setRole('motoboy');
      fetch(`/api/auth/register/check-invite?token=${inviteToken}`)
        .then(r => r.json())
        .then(d => {
          if (d.valid) {
            setPhone(d.phone);
          } else {
            setError('Convite invalido ou ja utilizado.');
          }
        });
    }
  }, [inviteToken]);

  useEffect(() => {
    const handleMove = (e) => {
      const w = window.innerWidth;
      const h = window.innerHeight;
      setMousePos({ x: (e.clientX - w / 2) / (w / 2), y: (e.clientY - h / 2) / (h / 2) });
    };
    window.addEventListener('mousemove', handleMove);
    return () => window.removeEventListener('mousemove', handleMove);
  }, []);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(name, phone, password, role, inviteToken);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #1a0533 0%, #2d0a4e 30%, #4A148C 60%, #7B1FA2 100%)',
      padding: 20, position: 'relative', overflow: 'hidden'
    }}>
      {berries.map(b => (
        <div key={b.id} style={{
          position: 'absolute',
          left: b.left, top: b.top,
          width: b.size, height: b.size,
          borderRadius: '50%',
          background: `radial-gradient(circle at 35% 35%, #7B1FA2, #1a0533)`,
          opacity: 0.2 + b.parallax * 1.5,
          filter: 'blur(0.5px)',
          transform: `translate(${mousePos.x * b.size * b.parallax * -1}px, ${mousePos.y * b.size * b.parallax * -1}px)`,
          transition: 'transform 0.6s ease-out',
          animation: `floatBerry ${b.duration}s ease-in-out ${b.delay}s infinite`,
          boxShadow: '0 0 6px rgba(155, 81, 224, 0.15)'
        }} />
      ))}

      <div style={{
        width: '100%', maxWidth: 440,
        background: 'rgba(255,255,255,0.97)',
        borderRadius: 24,
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        overflow: 'hidden', position: 'relative', zIndex: 1,
        transform: `translate(${mousePos.x * -2}px, ${mousePos.y * -2}px)`,
        transition: 'transform 0.5s ease-out'
      }}>
        <div style={{
          background: 'linear-gradient(135deg, #4A148C 0%, #6A1B9A 50%, #9C27B0 100%)',
          padding: '35px 30px 32px', textAlign: 'center', color: 'white'
        }}>
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4 }}>Pé de Açaí</h1>
          <p style={{ opacity: 0.8, fontSize: 14 }}>Crie sua conta</p>
          {inviteToken && (
            <div style={{
              background: 'rgba(255,255,255,0.15)', padding: '6px 14px',
              borderRadius: 20, marginTop: 10, fontSize: 12,
              display: 'inline-block'
            }}>
              Convite de loja parceira — vinculação automática
            </div>
          )}
        </div>

        <div style={{ padding: '28px 30px' }}>
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

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6, display: 'block' }}>Nome completo</label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Seu nome" required
                style={inputStyle}
                onFocus={onFocus} onBlur={onBlur}
              />
            </div>

            <div style={{ marginBottom: 16 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6, display: 'block' }}>Telefone</label>
              <input
                type="text" value={phone} onChange={e => setPhone(e.target.value)}
                placeholder="(11) 99999-9999" required
                readOnly={!!(inviteToken && phone)}
                style={{
                  ...inputStyle,
                  ...(inviteToken && phone ? { background: '#F5F0FA', color: '#6A1B9A', fontWeight: 600 } : {})
                }}
                onFocus={onFocus} onBlur={onBlur}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 6, display: 'block' }}>Senha</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres" required minLength={6}
                style={inputStyle}
                onFocus={onFocus} onBlur={onBlur}
              />
            </div>

            <div style={{ marginBottom: 20 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 8, display: 'block' }}>Tipo de conta</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { value: 'customer', label: 'Cliente', desc: 'Fazer pedidos' },
                  { value: 'store', label: 'Loja', desc: 'Vender açaí' },
                  { value: 'motoboy', label: 'Motoboy', desc: 'Entregar' }
                ].map(({ value, label, desc }) => (
                  <div key={value}
                    onClick={() => setRole(value)}
                    style={{
                      flex: 1, padding: '12px 8px', borderRadius: 12, textAlign: 'center',
                      border: `2px solid ${role === value ? '#9C27B0' : '#E8E0F0'}`,
                      background: role === value ? '#F3E5F5' : 'white',
                      transition: 'all 0.2s',
                      opacity: inviteToken && value !== 'motoboy' ? 0.5 : 1,
                      cursor: inviteToken && value !== 'motoboy' ? 'default' : 'pointer'
                    }}>
                    <div style={{ fontWeight: 700, fontSize: 13, color: role === value ? '#6A1B9A' : '#444' }}>{label}</div>
                    <div style={{ fontSize: 10, color: '#999' }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '15px',
              background: 'linear-gradient(135deg, #6A1B9A, #9C27B0)',
              color: 'white', border: 'none', borderRadius: 12,
              fontSize: 16, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.7 : 1,
              boxShadow: '0 4px 14px rgba(106,27,154,0.4)'
            }}>
              {loading ? 'Criando conta...' : 'Cadastrar'}
            </button>

            <p style={{ textAlign: 'center', marginTop: 20, fontSize: 14, color: '#888' }}>
              Já tem conta?{' '}
              <Link to="/login" style={{ color: '#6A1B9A', fontWeight: 700, textDecoration: 'none' }}>Entrar</Link>
            </p>
          </form>
        </div>
      </div>

      <style>{`
        @keyframes floatBerry {
          0%, 100% { transform: translateY(0px) scale(1); opacity: 0.2; }
          50% { transform: translateY(-10px) scale(1.06); opacity: 0.3; }
        }
      `}</style>

      <p style={{ marginTop: 20, fontSize: 11, color: 'rgba(255,255,255,0.35)', zIndex: 1 }}>
        Pé de Açaí © 2026 — Delivery de açaí
      </p>
    </div>
  );
}

const inputStyle = {
  width: '100%', padding: '14px 16px', fontSize: 16,
  border: '2px solid #E8E0F0', borderRadius: 12, outline: 'none',
  transition: 'border-color 0.2s, box-shadow 0.2s',
  boxSizing: 'border-box'
};

function onFocus(e) {
  e.target.style.borderColor = '#9C27B0';
  e.target.style.boxShadow = '0 0 0 3px rgba(156,39,176,0.1)';
}
function onBlur(e) {
  e.target.style.borderColor = '#E8E0F0';
  e.target.style.boxShadow = 'none';
}
