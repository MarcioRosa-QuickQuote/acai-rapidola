import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useGoogleLogin } from '@react-oauth/google';

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
  const { login, loginWithToken, apiFetch } = useAuth();
  const [phone, setPhone] = useState('admin');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

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
          body: JSON.stringify({ credential: tokenResponse.access_token, userInfo: info })
        });
        const data = await res.json();
        if (data.token) loginWithToken(data.token, data.user);
        else setError(data.error || 'Erro ao entrar com Google');
      } catch { setError('Erro ao conectar com Google'); }
      setGoogleLoading(false);
    },
    onError: () => setError('Login com Google cancelado')
  });
  const [showTest, setShowTest] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState(1);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryMsg, setRecoveryMsg] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
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
      display: 'flex', flexDirection: 'column', justifyContent: 'flex-start', alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #1a0533 0%, #2d0a4e 30%, #4A148C 60%, #7B1FA2 100%)',
      padding: '24px 20px 20px', position: 'relative', overflow: 'hidden'
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

      {/* Logo flutuando acima do card */}
      <div style={{ textAlign: 'center', marginBottom: 8, zIndex: 1, position: 'relative' }}>
        <img src="/logo_placa.png" alt="Pé de Açaí" style={{
          width: 150, height: 150, objectFit: 'contain',
          filter: 'drop-shadow(0 6px 28px rgba(0,0,0,0.55))',
          transform: `translate(${mousePos.x * -8}px, ${mousePos.y * -8}px)`,
          transition: 'transform 0.5s ease-out'
        }} />
        <p style={{ color: 'rgba(255,255,255,0.6)', fontSize: 12, marginTop: 6, fontWeight: 400 }}>
          O jeito mais rápido de pedir seu açaí
        </p>
      </div>

      {/* Card */}
      <div style={{
        width: '100%', maxWidth: 440,
        background: 'rgba(255,255,255,0.97)',
        backdropFilter: 'blur(20px)',
        borderRadius: 24,
        boxShadow: '0 20px 60px rgba(0,0,0,0.35), 0 0 0 1px rgba(255,255,255,0.05)',
        position: 'relative', zIndex: 1,
        transform: `translate(${mousePos.x * -3}px, ${mousePos.y * -3}px)`,
        transition: 'transform 0.5s ease-out'
      }}>
        {/* Form */}
        <div style={{ padding: '24px 30px 20px' }}>
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: '#FFF0F0', color: '#C62828', padding: '10px 14px',
                borderRadius: 10, marginBottom: 16, fontSize: 12,
                border: '1px solid #FFCDD2', display: 'flex', alignItems: 'center', gap: 6
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#C62828"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block' }}>
                Telefone
              </label>
              <input
                type="text" value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(11) 99999-9999" required
                style={{
                  width: '100%', padding: '12px 14px', fontSize: 15,
                  border: '2px solid #E8E0F0', borderRadius: 10, outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={e => { e.target.style.borderColor = '#9C27B0'; e.target.style.boxShadow = '0 0 0 3px rgba(156,39,176,0.1)'; }}
                onBlur={e => { e.target.style.borderColor = '#E8E0F0'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 12, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block' }}>
                Senha
              </label>
              <input
                type="password" value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Sua senha" required
                style={{
                  width: '100%', padding: '12px 14px', fontSize: 15,
                  border: '2px solid #E8E0F0', borderRadius: 10, outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={e => { e.target.style.borderColor = '#9C27B0'; e.target.style.boxShadow = '0 0 0 3px rgba(156,39,176,0.1)'; }}
                onBlur={e => { e.target.style.borderColor = '#E8E0F0'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px',
              background: 'linear-gradient(135deg, #6A1B9A, #9C27B0)',
              color: 'white', border: 'none', borderRadius: 10,
              fontSize: 15, fontWeight: 700,
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

            <div style={{ display: 'flex', alignItems: 'center', gap: 10, margin: '14px 0 2px' }}>
              <div style={{ flex: 1, height: 1, background: '#E8E0F0' }} />
              <span style={{ fontSize: 11, color: '#BBB', whiteSpace: 'nowrap' }}>ou continue com</span>
              <div style={{ flex: 1, height: 1, background: '#E8E0F0' }} />
            </div>

            <button type="button" onClick={() => googleLogin()} disabled={googleLoading} style={{
              width: '100%', padding: '11px', marginTop: 10,
              background: 'white', color: '#333', border: '2px solid #E8E0F0', borderRadius: 10,
              fontSize: 14, fontWeight: 600, cursor: googleLoading ? 'default' : 'pointer',
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 10,
              opacity: googleLoading ? 0.7 : 1,
              transition: 'border-color 0.2s, box-shadow 0.2s',
              boxSizing: 'border-box'
            }}
              onMouseOver={e => !googleLoading && (e.currentTarget.style.borderColor = '#BDBDBD')}
              onMouseOut={e => !googleLoading && (e.currentTarget.style.borderColor = '#E8E0F0')}
            >
              {!googleLoading && (
                <svg width="18" height="18" viewBox="0 0 48 48">
                  <path fill="#EA4335" d="M24 9.5c3.54 0 6.71 1.22 9.21 3.6l6.85-6.85C35.9 2.38 30.47 0 24 0 14.62 0 6.51 5.38 2.56 13.22l7.98 6.19C12.43 13.72 17.74 9.5 24 9.5z"/>
                  <path fill="#4285F4" d="M46.98 24.55c0-1.57-.15-3.09-.38-4.55H24v9.02h12.94c-.58 2.96-2.26 5.48-4.78 7.18l7.73 6c4.51-4.18 7.09-10.36 7.09-17.65z"/>
                  <path fill="#FBBC05" d="M10.53 28.59c-.48-1.45-.76-2.99-.76-4.59s.27-3.14.76-4.59l-7.98-6.19C.92 16.46 0 20.12 0 24c0 3.88.92 7.54 2.56 10.78l7.97-6.19z"/>
                  <path fill="#34A853" d="M24 48c6.48 0 11.93-2.13 15.89-5.81l-7.73-6c-2.18 1.48-4.97 2.31-8.16 2.31-6.26 0-11.57-4.22-13.47-9.91l-7.98 6.19C6.51 42.62 14.62 48 24 48z"/>
                  <path fill="none" d="M0 0h48v48H0z"/>
                </svg>
              )}
              {googleLoading ? 'Entrando...' : 'Entrar com Google'}
            </button>

            <p style={{ textAlign: 'center', marginTop: 12, fontSize: 13, color: '#888' }}>
              Não tem conta?{' '}
              <Link to="/register" style={{ color: '#6A1B9A', fontWeight: 700, textDecoration: 'none' }}>
                Cadastre-se
              </Link>
            </p>
            <p style={{ textAlign: 'center', marginTop: 4, fontSize: 12 }}>
              <button type="button" onClick={() => { setRecovery(true); setRecoveryStep(1); setRecoveryMsg(''); }}
                style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 12, textDecoration: 'underline' }}>
                Esqueci minha senha
              </button>
            </p>
          </form>

          {recovery && (
            <div style={{ borderTop: '1px solid #F3E5F5', paddingTop: 14, marginTop: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#6A1B9A', marginBottom: 12 }}>Recuperar Senha</div>

              {recoveryStep === 1 && (
                <div>
                  <div className="form-group">
                    <label className="label">Email cadastrado</label>
                    <input className="input" type="email" value={recoveryEmail}
                      onChange={e => setRecoveryEmail(e.target.value)}
                      placeholder="seu@email.com" />
                  </div>
                  {recoveryMsg && <div style={{ fontSize: 13, padding: '8px 12px', borderRadius: 8, marginBottom: 10,
                    background: recoveryMsg.includes('sucesso') || recoveryMsg.includes('enviado') ? '#E8F5E9' : '#FFF3E0',
                    color: recoveryMsg.includes('sucesso') || recoveryMsg.includes('enviado') ? '#2E7D32' : '#E65100' }}>{recoveryMsg}</div>}
                  <button className="btn btn-primary" onClick={async () => {
                    setRecoveryLoading(true); setRecoveryMsg('');
                    const res = await apiFetch('/auth/forgot-password', {
                      method: 'POST', body: JSON.stringify({ email: recoveryEmail })
                    });
                    setRecoveryMsg(res.message || (res._test ? `Código: ${res.code}` : 'Código enviado!'));
                    if (res.ok !== false) setRecoveryStep(2);
                    setRecoveryLoading(false);
                  }} disabled={recoveryLoading || !recoveryEmail}>
                    {recoveryLoading ? 'Enviando...' : 'Enviar código'}
                  </button>
                </div>
              )}

              {recoveryStep === 2 && (
                <div>
                  <div className="form-group">
                    <label className="label">Código recebido por SMS</label>
                    <input className="input" type="text" value={recoveryCode}
                      onChange={e => setRecoveryCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000" maxLength={6} />
                  </div>
                  <button className="btn btn-primary" onClick={() => setRecoveryStep(3)}
                    disabled={recoveryCode.length < 6}>
                    Confirmar código
                  </button>
                  <button className="btn btn-sm" style={{ marginTop: 8, background: 'none', color: '#999' }}
                    onClick={() => { setRecoveryStep(1); setRecoveryMsg(''); }}>
                    Voltar
                  </button>
                </div>
              )}

              {recoveryStep === 3 && (
                <div>
                  <div className="form-group">
                    <label className="label">Nova senha</label>
                    <input className="input" type="password" value={recoveryPassword}
                      onChange={e => setRecoveryPassword(e.target.value)}
                      placeholder="Nova senha (min 4 caracteres)" />
                  </div>
                  {recoveryMsg && <div style={{ fontSize: 13, fontWeight: 600, padding: '8px 12px', borderRadius: 8, marginBottom: 10,
                    background: recoveryMsg.includes('sucesso') ? '#E8F5E9' : '#FFEBEE',
                    color: recoveryMsg.includes('sucesso') ? '#2E7D32' : '#C62828' }}>{recoveryMsg}</div>}
                  <button className="btn btn-primary" onClick={async () => {
                    setRecoveryLoading(true); setRecoveryMsg('');
                    const res = await apiFetch('/auth/reset-password', {
                      method: 'POST',
                      body: JSON.stringify({ email: recoveryEmail, code: recoveryCode, new_password: recoveryPassword })
                    });
                    setRecoveryMsg(res.message || (res.error || 'Erro ao redefinir'));
                    if (res.ok) {
                      setTimeout(() => {
                        setRecovery(false); setRecoveryMsg('Senha redefinida! Faça login.');
                      }, 2000);
                    }
                    setRecoveryLoading(false);
                  }} disabled={recoveryLoading || !recoveryPassword}>
                    {recoveryLoading ? 'Salvando...' : 'Redefinir senha'}
                  </button>
                  <button className="btn btn-sm" style={{ marginTop: 8, background: 'none', color: '#999' }}
                    onClick={() => { setRecoveryStep(2); setRecoveryMsg(''); }}>
                    Voltar
                  </button>
                </div>
              )}

              <button onClick={() => { setRecovery(false); setRecoveryMsg(''); }}
                style={{ marginTop: 10, background: 'none', border: 'none', color: '#CCC', fontSize: 11, cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center' }}>
                Voltar ao login
              </button>
            </div>
          )}

          <div style={{ marginTop: 18, borderTop: '1px solid #F3E5F5', paddingTop: 12, textAlign: 'center' }}>
            <button onClick={() => setShowTest(!showTest)} style={{
              background: 'none', border: 'none', color: '#CCC', fontSize: 11, cursor: 'pointer'
            }}>
              {showTest ? 'Ocultar' : 'Contas de teste'}
            </button>
            {showTest && (
              <div style={{ marginTop: 6, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                {[
                  { role: 'store', label: 'Loja', bg: '#F3E5F5', color: '#6A1B9A' },
                  { role: 'motoboy', label: 'Motoboy', bg: '#E8F5E9', color: '#2E7D32' },
                  { role: 'customer', label: 'Cliente', bg: '#E3F2FD', color: '#1565C0' }
                ].map(({ role, label, bg, color }) => (
                  <button key={role} onClick={() => fillTest(role)} style={{
                    background: bg, color, border: 'none',
                    padding: '6px 12px', borderRadius: 20, fontSize: 11, fontWeight: 600, cursor: 'pointer'
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

      <p style={{ marginTop: 16, fontSize: 11, color: 'rgba(255,255,255,0.35)', zIndex: 1, textAlign: 'center' }}>
        Pé de Açaí © 2026 —{' '}
        <Link to="/privacidade" style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'underline' }}>Privacidade</Link>
        {' · '}
        <Link to="/termos" style={{ color: 'rgba(255,255,255,0.45)', textDecoration: 'underline' }}>Termos</Link>
      </p>
    </div>
  );
}
