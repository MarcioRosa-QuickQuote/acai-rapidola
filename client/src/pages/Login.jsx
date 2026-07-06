import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useGoogleLogin } from '@react-oauth/google';

export default function Login() {
  const { login, loginWithToken, apiFetch } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
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
  const [showPw, setShowPw] = useState(false);
  const [recovery, setRecovery] = useState(false);
  const [recoveryStep, setRecoveryStep] = useState(1);
  const [recoveryEmail, setRecoveryEmail] = useState('');
  const [recoveryCode, setRecoveryCode] = useState('');
  const [recoveryPassword, setRecoveryPassword] = useState('');
  const [recoveryMsg, setRecoveryMsg] = useState('');
  const [recoveryLoading, setRecoveryLoading] = useState(false);
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

  return (
    <div className="login-container" style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh', background: 'transparent',
      padding: '24px 20px 20px', position: 'relative', overflow: 'visible'
    }}>

      {/* Logo — z-index abaixo do card para a estaca ficar "fincada" no modal */}
      <div className="login-logo" style={{ textAlign: 'center', marginBottom: -55, marginTop: -80, zIndex: 2, position: 'relative' }}>
        <img src="/vem_acai_transp.png" alt="Vem Açaí" style={{
          width: 190, height: 190, objectFit: 'contain', display: 'block', margin: '0 auto'
        }} />
      </div>

      {/* Card — z-index acima da logo para cobrir a estaca */}
      <div className="login-card" style={{
        width: '100%', maxWidth: 440,
        background: '#fff',
        borderRadius: 24,
        boxShadow: '0 20px 60px rgba(0,0,0,0.35)',
        position: 'relative', zIndex: 3,
      }}>
        {/* Form */}
        <div style={{ padding: '24px 30px 20px' }}>
          <form onSubmit={handleSubmit}>
            {error && (
              <div style={{
                background: '#FFF0F0', color: '#C62828', padding: '10px 14px',
                borderRadius: 10, marginBottom: 16, fontSize: 13,
                border: '1px solid #FFCDD2', display: 'flex', alignItems: 'center', gap: 6
              }}>
                <svg width="16" height="16" viewBox="0 0 24 24" fill="#C62828"><path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm1 15h-2v-2h2v2zm0-4h-2V7h2v6z"/></svg>
                {error}
              </div>
            )}

            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block' }}>
                Telefone
              </label>
              <input
                type="text" value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(11) 99999-9999" required
                style={{
                  width: '100%', padding: '12px 14px', fontSize: 16,
                  border: '2px solid #E8E0F0', borderRadius: 10, outline: 'none',
                  transition: 'border-color 0.2s, box-shadow 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={e => { e.target.style.borderColor = '#9C27B0'; e.target.style.boxShadow = '0 0 0 3px rgba(156,39,176,0.1)'; }}
                onBlur={e => { e.target.style.borderColor = '#E8E0F0'; e.target.style.boxShadow = 'none'; }}
              />
            </div>

            <div style={{ marginBottom: 18 }}>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#555', marginBottom: 4, display: 'block' }}>
                Senha
              </label>
              <div style={{ position: 'relative' }}>
                <input
                  type={showPw ? 'text' : 'password'} value={password}
                  onChange={e => setPassword(e.target.value)}
                  placeholder="Sua senha" required
                  style={{
                    width: '100%', padding: '12px 44px 12px 14px', fontSize: 16,
                    border: '2px solid #E8E0F0', borderRadius: 10, outline: 'none',
                    transition: 'border-color 0.2s, box-shadow 0.2s',
                    boxSizing: 'border-box'
                  }}
                  onFocus={e => { e.target.style.borderColor = '#9C27B0'; e.target.style.boxShadow = '0 0 0 3px rgba(156,39,176,0.1)'; }}
                  onBlur={e => { e.target.style.borderColor = '#E8E0F0'; e.target.style.boxShadow = 'none'; }}
                />
                <button type="button" tabIndex={-1} onClick={() => setShowPw(v => !v)}
                  style={{ position: 'absolute', right: 12, top: '50%', transform: 'translateY(-50%)', background: 'none', border: 'none', cursor: 'pointer', padding: 4, color: '#aaa', lineHeight: 0 }}>
                  {showPw
                    ? <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19m-6.72-1.07a3 3 0 1 1-4.24-4.24"/><line x1="1" y1="1" x2="23" y2="23"/></svg>
                    : <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                  }
                </button>
              </div>
            </div>

            <button type="submit" disabled={loading} style={{
              width: '100%', padding: '13px',
              background: 'linear-gradient(135deg, #6A1B9A, #9C27B0)',
              color: 'white', border: 'none', borderRadius: 10,
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

            <button type="button" onClick={() => googleLogin()} disabled={googleLoading} style={{
              width: '100%', padding: '11px', marginTop: 10,
              background: 'white', color: '#333', border: '2px solid #E8E0F0', borderRadius: 10,
              fontSize: 15, fontWeight: 400, cursor: googleLoading ? 'default' : 'pointer',
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

            <p style={{ textAlign: 'center', marginTop: 12, fontSize: 14, color: '#888' }}>
              Não tem conta?{' '}
              <Link to="/register" style={{ color: '#6A1B9A', fontWeight: 700, textDecoration: 'none' }}>
                Cadastre-se
              </Link>
            </p>
            <p style={{ textAlign: 'center', marginTop: 4, fontSize: 13 }}>
              <button type="button" onClick={() => { setRecovery(true); setRecoveryStep(1); setRecoveryMsg(''); }}
                style={{ background: 'none', border: 'none', color: '#999', cursor: 'pointer', fontSize: 13, textDecoration: 'underline' }}>
                Esqueci minha senha
              </button>
            </p>
          </form>

          {recovery && (
            <div style={{ borderTop: '1px solid #F3E5F5', paddingTop: 14, marginTop: 14 }}>
              <div style={{ fontSize: 16, fontWeight: 700, color: '#6A1B9A', marginBottom: 12 }}>Recuperar Senha</div>

              {recoveryStep === 1 && (
                <div>
                  <div className="form-group">
                    <label className="label">Email cadastrado</label>
                    <input className="input" type="email" value={recoveryEmail}
                      onChange={e => setRecoveryEmail(e.target.value)}
                      placeholder="seu@email.com" />
                  </div>
                  {recoveryMsg && <div style={{ fontSize: 14, padding: '8px 12px', borderRadius: 8, marginBottom: 10,
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
                  {recoveryMsg && <div style={{ fontSize: 14, fontWeight: 600, padding: '8px 12px', borderRadius: 8, marginBottom: 10,
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
                style={{ marginTop: 10, background: 'none', border: 'none', color: '#CCC', fontSize: 12, cursor: 'pointer', display: 'block', width: '100%', textAlign: 'center' }}>
                Voltar ao login
              </button>
            </div>
          )}

        </div>
      </div>

      <p style={{ marginTop: 16, fontSize: 12, color: '#fff', position: 'relative', zIndex: 2, textAlign: 'center', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 6, flexWrap: 'wrap', textShadow: '0 1px 3px rgba(0,0,0,0.6), 0 0 6px rgba(0,0,0,0.4)' }}>
        <a href="/landing" style={{ color: '#fff', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 3 }}>
          <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/></svg>
          Página de Vendas
        </a>
        <span>·</span>
        <span>Vem Açaí © 2026 —{' '}
          <Link to="/privacidade" style={{ color: '#fff', textDecoration: 'underline' }}>Privacidade</Link>
          {' · '}
          <Link to="/termos" style={{ color: '#fff', textDecoration: 'underline' }}>Termos</Link>
        </span>
      </p>

    </div>
  );
}
