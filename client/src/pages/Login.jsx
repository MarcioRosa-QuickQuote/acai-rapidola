import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Login() {
  const { login } = useAuth();
  const [phone, setPhone] = useState('admin');
  const [password, setPassword] = useState('123456');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [storeLogo, setStoreLogo] = useState('');

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

  return (
    <div className="container" style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      background: 'linear-gradient(180deg, #6A1B9A 0%, #4A148C 40%, #F5F0FA 40%)',
      minHeight: '100vh'
    }}>
      <div style={{ textAlign: 'center', color: 'white', padding: '40px 20px' }}>
        <img
          src={storeLogo || '/logo.png'}
          alt="Logo"
          style={{ width: 120, height: 120, borderRadius: 20, objectFit: 'contain', marginBottom: 12 }}
          onError={e => { e.target.style.display = 'none'; }}
        />
        <h1 style={{ fontSize: 32, fontWeight: 800, marginBottom: 4 }}>Pé de Açaí</h1>
        <p style={{ opacity: 0.9, fontSize: 14 }}>O jeito mais rápido de pedir seu açaí</p>
      </div>

      <div className="card" style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>
        <form onSubmit={handleSubmit}>
          <h2 style={{ textAlign: 'center', marginBottom: 20, color: 'var(--primary)' }}>Entrar</h2>

          {error && (
            <div style={{ background: '#FFEBEE', color: '#C62828', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="label">Telefone</label>
            <input className="input" type="text" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="Seu telefone cadastrado" required />
          </div>

          <div className="form-group">
            <label className="label">Senha</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Sua senha" required />
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : 'Entrar'}
          </button>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14 }}>
            Não tem conta? <Link to="/register" style={{ color: 'var(--primary)', fontWeight: 600 }}>Cadastre-se</Link>
          </p>
        </form>
      </div>

      <div style={{ textAlign: 'center', marginTop: 20 }}>
        <p className="text-sm text-muted">Contas de teste:</p>
        <div className="grid-2" style={{ maxWidth: 400, margin: '8px auto 0' }}>
          <span className="badge badge-primary">Loja: admin</span>
          <span className="badge badge-success">Motoboy: motoboy</span>
          <span className="badge badge-info" style={{ gridColumn: '1/-1' }}>Cliente: cliente</span>
        </div>
        <p className="text-xs text-muted" style={{ marginTop: 4 }}>Senha: 123456</p>
      </div>
    </div>
  );
}
