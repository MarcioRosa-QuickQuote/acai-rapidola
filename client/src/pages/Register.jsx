import { useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function Register() {
  const { register } = useAuth();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState('customer');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await register(name, phone, password, role);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="container" style={{
      display: 'flex', flexDirection: 'column', justifyContent: 'center',
      background: 'linear-gradient(180deg, #6A1B9A 0%, #4A148C 35%, #F5F0FA 35%)',
      minHeight: '100vh'
    }}>
      <div style={{ textAlign: 'center', color: 'white', padding: '30px 20px' }}>
        <h1 style={{ fontSize: 28, fontWeight: 800 }}>Açaí Rapidola</h1>
        <p style={{ opacity: 0.9, fontSize: 14 }}>Crie sua conta</p>
      </div>

      <div className="card" style={{ maxWidth: 400, width: '100%', margin: '0 auto' }}>
        <form onSubmit={handleSubmit}>
          {error && (
            <div style={{ background: '#FFEBEE', color: '#C62828', padding: 12, borderRadius: 8, marginBottom: 16, fontSize: 14 }}>
              {error}
            </div>
          )}

          <div className="form-group">
            <label className="label">Nome completo</label>
            <input className="input" type="text" value={name} onChange={e => setName(e.target.value)}
              placeholder="Seu nome" required />
          </div>

          <div className="form-group">
            <label className="label">Telefone</label>
            <input className="input" type="text" value={phone} onChange={e => setPhone(e.target.value)}
              placeholder="(11) 99999-9999" required />
          </div>

          <div className="form-group">
            <label className="label">Senha</label>
            <input className="input" type="password" value={password} onChange={e => setPassword(e.target.value)}
              placeholder="Mínimo 6 caracteres" required minLength={6} />
          </div>

          <div className="form-group">
            <label className="label">Tipo de conta</label>
            <div className="grid-2">
              {[
                { value: 'customer', label: 'Cliente', desc: 'Fazer pedidos' },
                { value: 'store', label: 'Loja', desc: 'R$89/mês' },
                { value: 'motoboy', label: 'Motoboy', desc: 'Entregar' }
              ].map(({ value, label, desc }) => (
                <div key={value}
                  onClick={() => setRole(value)}
                  style={{
                    padding: '12px', borderRadius: 8, cursor: 'pointer', textAlign: 'center',
                    border: `2px solid ${role === value ? 'var(--primary)' : 'var(--border)'}`,
                    background: role === value ? '#F3E5F5' : 'white',
                    transition: 'all 0.2s'
                  }}>
                  <div style={{ fontWeight: 700, fontSize: 14 }}>{label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-light)' }}>{desc}</div>
                </div>
              ))}
            </div>
          </div>

          <button className="btn btn-primary" type="submit" disabled={loading} style={{ marginTop: 8 }}>
            {loading ? <span className="spinner" style={{ width: 20, height: 20 }} /> : 'Cadastrar'}
          </button>

          <p style={{ textAlign: 'center', marginTop: 16, fontSize: 14 }}>
            Já tem conta? <Link to="/login" style={{ color: 'var(--primary)', fontWeight: 600 }}>Entrar</Link>
          </p>
        </form>
      </div>
    </div>
  );
}
