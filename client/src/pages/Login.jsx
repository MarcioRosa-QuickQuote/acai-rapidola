import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [storeLogo, setStoreLogo] = useState('');
  const [showTest, setShowTest] = useState(false);

  useEffect(() => {
    fetch('/api/stores')
      .then(r => r.json())
      .then(stores => {
        if (stores.length > 0 && stores[0].logo) setStoreLogo(stores[0].logo);
      })
      .catch(() => {});
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
    <div style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center', alignItems: 'center',
      minHeight: '100vh',
      background: 'linear-gradient(160deg, #1a0533 0%, #2d0a4e 30%, #4A148C 60%, #7B1FA2 100%)',
      padding: 20, position: 'relative', overflow: 'hidden'
    }}>
      {/* Background circles */}
      <div style={{ position: 'absolute', top: -80, right: -80, width: 300, height: 300, borderRadius: '50%', background: 'rgba(255,255,255,0.03)' }} />
      <div style={{ position: 'absolute', bottom: -120, left: -60, width: 400, height: 400, borderRadius: '50%', background: 'rgba(255,255,255,0.02)' }} />

      <div style={{
        width: '100%', maxWidth: 420,
        background: 'white',
        borderRadius: 24,
        boxShadow: '0 20px 60px rgba(0,0,0,0.3)',
        overflow: 'hidden',
        position: 'relative', zIndex: 1
      }}>
        {/* Banner */}
        <div style={{
          background: 'linear-gradient(135deg, #6A1B9A, #9C27B0)',
          padding: '40px 30px 32px',
          textAlign: 'center', color: 'white'
        }}>
          <img
            src={storeLogo || '/logo.png'}
            alt="Logo"
            style={{
              width: 80, height: 80, borderRadius: 18,
              objectFit: 'contain', marginBottom: 16,
              boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
              background: 'white', padding: 6
            }}
            onError={e => { e.target.style.display = 'none'; }}
          />
          <h1 style={{ fontSize: 28, fontWeight: 800, marginBottom: 4, letterSpacing: -0.5 }}>
            Pé de Açaí
          </h1>
          <p style={{ opacity: 0.85, fontSize: 14, fontWeight: 400 }}>
            O jeito mais rápido de pedir seu açaí
          </p>
        </div>

        {/* Form */}
        <div style={{ padding: '32px 30px' }}>
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
              <label style={{
                fontSize: 13, fontWeight: 600, color: '#555',
                marginBottom: 6, display: 'block', letterSpacing: 0.3
              }}>
                Telefone
              </label>
              <input
                type="text"
                value={phone}
                onChange={e => setPhone(e.target.value)}
                placeholder="(11) 99999-9999"
                required
                style={{
                  width: '100%', padding: '14px 16px',
                  fontSize: 16, border: '2px solid #E0E0E0',
                  borderRadius: 12, outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={e => e.target.style.borderColor = '#6A1B9A'}
                onBlur={e => e.target.style.borderColor = '#E0E0E0'}
              />
            </div>

            <div style={{ marginBottom: 24 }}>
              <label style={{
                fontSize: 13, fontWeight: 600, color: '#555',
                marginBottom: 6, display: 'block', letterSpacing: 0.3
              }}>
                Senha
              </label>
              <input
                type="password"
                value={password}
                onChange={e => setPassword(e.target.value)}
                placeholder="Sua senha"
                required
                style={{
                  width: '100%', padding: '14px 16px',
                  fontSize: 16, border: '2px solid #E0E0E0',
                  borderRadius: 12, outline: 'none',
                  transition: 'border-color 0.2s',
                  boxSizing: 'border-box'
                }}
                onFocus={e => e.target.style.borderColor = '#6A1B9A'}
                onBlur={e => e.target.style.borderColor = '#E0E0E0'}
              />
            </div>

            <button
              type="submit"
              disabled={loading}
              style={{
                width: '100%', padding: '15px',
                background: 'linear-gradient(135deg, #6A1B9A, #9C27B0)',
                color: 'white', border: 'none', borderRadius: 12,
                fontSize: 16, fontWeight: 700,
                cursor: loading ? 'default' : 'pointer',
                opacity: loading ? 0.7 : 1,
                transition: 'box-shadow 0.2s, transform 0.15s',
                boxShadow: '0 4px 14px rgba(106,27,154,0.35)'
              }}
              onMouseOver={e => !loading && (e.target.style.boxShadow = '0 6px 20px rgba(106,27,154,0.5)')}
              onMouseOut={e => !loading && (e.target.style.boxShadow = '0 4px 14px rgba(106,27,154,0.35)')}
            >
              {loading ? 'Entrando...' : 'Entrar'}
            </button>

            <p style={{
              textAlign: 'center', marginTop: 20, fontSize: 14,
              color: '#888'
            }}>
              Não tem conta?{' '}
              <Link to="/register" style={{
                color: '#6A1B9A', fontWeight: 700, textDecoration: 'none'
              }}>
                Cadastre-se
              </Link>
            </p>
          </form>

          {/* Test accounts toggle */}
          <div style={{ marginTop: 24, borderTop: '1px solid #F0F0F0', paddingTop: 16, textAlign: 'center' }}>
            <button
              onClick={() => setShowTest(!showTest)}
              style={{
                background: 'none', border: 'none', color: '#BBB',
                fontSize: 12, cursor: 'pointer', padding: 4
              }}
            >
              {showTest ? 'Ocultar' : 'Contas de teste'}
            </button>
            {showTest && (
              <div style={{ marginTop: 8, display: 'flex', gap: 6, justifyContent: 'center', flexWrap: 'wrap' }}>
                {[
                  { role: 'store', label: 'Loja', bg: '#EDE7F6', color: '#5E35B1' },
                  { role: 'motoboy', label: 'Motoboy', bg: '#E8F5E9', color: '#2E7D32' },
                  { role: 'customer', label: 'Cliente', bg: '#E3F2FD', color: '#1565C0' }
                ].map(({ role, label, bg, color }) => (
                  <button key={role}
                    onClick={() => fillTest(role)}
                    style={{
                      background: bg, color, border: 'none',
                      padding: '6px 14px', borderRadius: 20,
                      fontSize: 12, fontWeight: 600,
                      cursor: 'pointer'
                    }}>
                    {label}
                  </button>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Footer */}
      <p style={{
        marginTop: 24, fontSize: 11, color: 'rgba(255,255,255,0.4)',
        textAlign: 'center', zIndex: 1
      }}>
        Pé de Açaí © 2026 — Delivery de açaí
      </p>
    </div>
  );
}
