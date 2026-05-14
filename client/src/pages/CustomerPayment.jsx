import { useState, useEffect } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';

export default function CustomerPayment() {
  const { id } = useParams();
  const { apiFetch } = useAuth();
  const { socket, joinOrder } = useSocket();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    joinOrder(id);
    loadOrder();
  }, [id]);

  useEffect(() => {
    if (!socket) return;
    socket.on('payment_confirmed', (data) => {
      if (data.orderId === id) navigate(`/customer/tracking/${id}`);
    });
    return () => { socket.off('payment_confirmed'); };
  }, [socket, id]);

  async function loadOrder() {
    const data = await apiFetch(`/orders/${id}`);
    if (data.ok || data.id) setOrder(data);
  }

  async function pagar() {
    setPaying(true);
    setError('');
    try {
      const data = await apiFetch('/create-preference', {
        method: 'POST',
        body: JSON.stringify({ order_id: id })
      });
      if (data.init_point) {
        window.location.href = data.init_point;
      } else if (data.error) {
        setError(data.error);
      }
    } catch {
      setError('Erro ao iniciar pagamento.');
    } finally {
      setPaying(false);
    }
  }

  if (!order) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div>
      <div className="header">
        <div className="header-left">
          <button className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 14 }}
            onClick={() => navigate('/customer')}>
            Voltar
          </button>
        </div>
        <div className="header-title">Pagamento</div>
        <div className="header-right" />
      </div>

      <div className="container" style={{ textAlign: 'center' }}>
        <div className="card">
          <div style={{ fontSize: 48, marginBottom: 8 }}>
            <svg width="80" height="80" viewBox="0 0 80 80" fill="none">
              <rect x="10" y="20" width="60" height="40" rx="6" stroke="#6A1B9A" strokeWidth="3" fill="#F3E5F5"/>
              <path d="M25 35h30M25 42h20" stroke="#6A1B9A" strokeWidth="3" strokeLinecap="round"/>
              <circle cx="58" cy="38" r="12" fill="#2E7D32"/>
              <path d="M54 38l2.5 2.5L62 35" stroke="white" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/>
            </svg>
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>
            R$ {order.total.toFixed(2)}
          </div>
          {order.delivery_fee > 0 && (
            <p className="text-xs text-muted mt-2">
              Inclui R$ {order.delivery_fee.toFixed(2)} de taxa de entrega
            </p>
          )}
        </div>

        <div className="card">
          {error && (
            <div style={{
              background: '#FFEBEE', color: '#C62828', padding: 10,
              borderRadius: 8, marginBottom: 12, fontSize: 13
            }}>
              {error}
            </div>
          )}

          <button className="btn btn-primary"
            onClick={pagar} disabled={paying}
            style={{ padding: '16px 32px', fontSize: 18, fontWeight: 700, borderRadius: 12 }}>
            {paying ? 'Redirecionando...' : 'Ir para Pagamento'}
          </button>

          <p className="text-xs text-muted mt-4">
            Pagamento seguro via Mercado Pago
          </p>
        </div>
      </div>
    </div>
  );
}
