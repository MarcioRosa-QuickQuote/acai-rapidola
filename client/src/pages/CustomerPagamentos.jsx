import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { fmt } from '../utils/fmt';
import CustomerHeader from '../components/CustomerHeader';
import CustomerBottomNav from '../components/CustomerBottomNav';

export default function CustomerPagamentos() {
  const { apiFetch } = useAuth();
  const navigate = useNavigate();
  const [payments, setPayments] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/orders').then(d => {
      if (d.data) {
        const now = Date.now();
        const filtered = d.data.filter(o => {
          if (o.payment_status === 'paid') return true;
          if (o.payment_status === 'pending') {
            return now - new Date(o.created_at).getTime() < 24 * 60 * 60 * 1000;
          }
          return false;
        });
        setPayments(filtered.sort((a, b) => new Date(b.created_at) - new Date(a.created_at)));
      }
      setLoading(false);
    });
  }, []);

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 72 }}>
      <CustomerHeader title="Pagamentos" />
      <div className="container" style={{ paddingTop: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Carregando...</div>
        ) : payments.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="#DDD">
              <path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
            </svg>
            <p>Nenhum pagamento registrado</p>
            <p style={{ fontSize: 13, color: '#BBB', marginTop: 4 }}>Seu histórico de pagamentos aparecerá aqui</p>
          </div>
        ) : (
          payments.map(order => (
            <div key={order.id} className="card" onClick={() => navigate(order.payment_status === 'paid' ? `/customer/tracking/${order.id}` : `/customer/payment/${order.id}`)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{order.store_name || 'Loja'}</span>
                <span className={`badge ${order.payment_status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                  {order.payment_status === 'paid' ? 'Pago' : 'Pendente'}
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#888' }}>
                R$ {fmt(order.total)} • {new Date(order.created_at).toLocaleDateString('pt-BR')}
              </div>
            </div>
          ))
        )}
      </div>
      <CustomerBottomNav />
    </div>
  );
}
