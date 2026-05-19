import { useState, useEffect, useRef } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useGoogleLogin } from '@react-oauth/google';

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
  const { register, loginWithToken, apiFetch, logout } = useAuth();
  const [searchParams] = useSearchParams();
  const inviteToken = searchParams.get('token');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('customer');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);
  const [mousePos, setMousePos] = useState({ x: 0, y: 0 });

  const googleLogin = useGoogleLogin({
    onSuccess: async (tokenResponse) => {
      setGoogleLoading(true);
      try {
        const infoRes = await fetch('https://www.googleapis.com/oauth2/v3/userinfo', {
          headers: { Authorization: `Bearer ${tokenResponse.access_token}` }
        });
        const info = await infoRes.json();
        const res = await fetch('/api/auth/google', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ userInfo: info, role })
        });
        const data = await res.json();
        if (data.token) loginWithToken(data.token, data.user);
        else setError(data.error || 'Erro ao entrar com Google');
      } catch { setError('Erro ao conectar com Google'); }
      setGoogleLoading(false);
    },
    onError: () => setError('Cadastro com Google cancelado')
  });

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
      await register(name, phone, password, role, inviteToken, { email });
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
          padding: '20px 30px 18px', textAlign: 'center', color: 'white'
        }}>
          <img src="/logo_placa.png" alt="Pé de Açaí" style={{ width: 120, height: 120, objectFit: 'contain', marginBottom: 8, filter: 'drop-shadow(0 4px 12px rgba(0,0,0,0.3))' }} />
          <h1 style={{ fontSize: 24, fontWeight: 800, marginBottom: 2 }}>Pé de Açaí</h1>
          <p style={{ opacity: 0.8, fontSize: 13 }}>Crie sua conta</p>
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

        <div style={{ padding: '18px 30px 20px' }}>
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: '#FFF0F0', color: '#C62828', padding: '10px 14px',
                borderRadius: 10, marginBottom: 14, fontSize: 12,
                border: '1px solid #FFCDD2', display: 'flex', alignItems: 'center', gap: 6
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#C62828"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block' }}>Nome completo</label>
              <input
                type="text" value={name} onChange={e => setName(e.target.value)}
                placeholder="Seu nome" required
                style={inputStyle}
                onFocus={onFocus} onBlur={onBlur}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block' }}>Email</label>
              <input
                type="email" value={email} onChange={e => setEmail(e.target.value)}
                placeholder="seu@email.com" required
                style={inputStyle}
                onFocus={onFocus} onBlur={onBlur}
              />
            </div>

            <div style={{ marginBottom: 12 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block' }}>Telefone</label>
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

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block' }}>Senha</label>
              <input
                type="password" value={password} onChange={e => setPassword(e.target.value)}
                placeholder="Mínimo 6 caracteres" required minLength={6}
                style={inputStyle}
                onFocus={onFocus} onBlur={onBlur}
              />
            </div>

            {role === 'motoboy' && (
              <div style={{
                background: '#F3E5F5', borderRadius: 10, padding: '10px 14px',
                marginBottom: 14, fontSize: 12, color: '#6A1B9A',
                display: 'flex', alignItems: 'center', gap: 8
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#9C27B0"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                CPF e chave Pix serão solicitados quando você ativar o modo online pela primeira vez.
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 6, display: 'block' }}>Tipo de conta</label>
              <div style={{ display: 'flex', gap: 8 }}>
                {[
                  { value: 'customer', label: 'Cliente', desc: 'Fazer pedidos' },
                  { value: 'store', label: 'Loja', desc: 'Vender açaí' },
                  { value: 'motoboy', label: 'Motoboy', desc: 'Entregar' }
                ].map(({ value, label, desc }) => (
                  <div key={value}
                    onClick={() => setRole(value)}
                    style={{
                      flex: 1, padding: '10px 6px', borderRadius: 10, textAlign: 'center',
                      border: `2px solid ${role === value ? '#9C27B0' : '#E8E0F0'}`,
                      background: role === value ? '#F3E5F5' : 'white',
                      transition: 'all 0.2s',
                      opacity: inviteToken && value !== 'motoboy' ? 0.5 : 1,
                      cursor: inviteToken && value !== 'motoboy' ? 'default' : 'pointer'
                    }}>
                    <div style={{ fontWeight: 700, fontSize: 12, color: role === value ? '#6A1B9A' : '#444' }}>{label}</div>
                    <div style={{ fontSize: 10, color: '#999' }}>{desc}</div>
                  </div>
                ))}
              </div>
            </div>

            {!inviteToken && (
              <>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '4px 0 10px' }}>
                  <div style={{ flex: 1, height: 1, background: '#E8E0F0' }} />
                  <span style={{ fontSize: 11, color: '#BBB', whiteSpace: 'nowrap' }}>ou cadastre com</span>
                  <div style={{ flex: 1, height: 1, background: '#E8E0F0' }} />
                </div>
                <button type="button" onClick={() => googleLogin()} disabled={googleLoading} style={{
                  width: '100%', padding: '11px', marginBottom: 10,
                  background: 'white', color: '#333', border: '2px solid #E8E0F0', borderRadius: 10,
                  fontSize: 14, fontWeight: 600, cursor: googleLoading ? 'default' : 'pointer',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
                  opacity: googleLoading ? 0.7 : 1, boxSizing: 'border-box'
                }}>
                  {!googleLoading && (
                    <svg width="18" height="18" viewBox="0 0 48 48">
                      <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                      <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                      <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                      <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                      <path fill="none" d="M0 0h48v48H0z"/>
                    </svg>
                  )}
                  {googleLoading ? 'Aguarde...' : role === 'motoboy' ? 'Cadastrar Motoboy com Google' : role === 'store' ? 'Cadastrar Loja com Google' : 'Cadastrar com Google'}
                </button>
              </>
            )}

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px',
              background: 'linear-gradient(135deg, #6A1B9A, #9C27B0)',
              color: 'white', border: 'none', borderRadius: 10,
              fontSize: 15, fontWeight: 700, cursor: loading ? 'default' : 'pointer',
              opacity: loading ? 0.7 : 1,
              boxShadow: '0 4px 14px rgba(106,27,154,0.4)'
            }}>
              {loading ? 'Criando conta...' : 'Cadastrar'}
            </button>

            <p style={{ textAlign: 'center', marginTop: 14, fontSize: 13, color: '#888' }}>
              Já tem conta?{' '}
              <Link to="/login" style={{ color: '#6A1B9A', fontWeight: 700, textDecoration: 'none' }}>Entrar</Link>
            </p>
            <p style={{ textAlign: 'center', marginTop: 8, fontSize: 11, color: '#BBB', lineHeight: 1.6 }}>
              Ao se cadastrar você concorda com nossa{' '}
              <Link to="/privacidade" style={{ color: '#9C27B0', textDecoration: 'underline' }}>Política de Privacidade</Link>
              {' '}e os{' '}
              <Link to="/termos" style={{ color: '#9C27B0', textDecoration: 'underline' }}>Termos de Uso</Link>
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

      <p style={{ marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,0.35)', zIndex: 1, textAlign: 'center' }}>
        Pé de Açaí © 2026 —{' '}
        <Link to="/privacidade" style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'underline' }}>Privacidade</Link>
        {' · '}
        <Link to="/termos" style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'underline' }}>Termos</Link>
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
