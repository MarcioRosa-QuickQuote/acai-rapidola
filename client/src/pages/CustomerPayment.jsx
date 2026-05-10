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
  const [useSimulado, setUseSimulado] = useState(false);

  useEffect(() => {
    joinOrder(id);
    loadOrder();
  }, [id]);

  useEffect(() => {
    if (!socket) return;
    socket.on('payment_confirmed', (data) => {
      if (data.orderId === id) {
        navigate(`/customer/tracking/${id}`);
      }
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
        window.location.href = data.sandbox_init_point || data.init_point;
      } else if (data.error) {
        setUseSimulado(true);
      } else {
        setError('Erro ao iniciar pagamento. Tente novamente.');
      }
    } catch {
      setUseSimulado(true);
    } finally {
      setPaying(false);
    }
  }

  async function pagarSimulado() {
    setPaying(true);
    const data = await apiFetch('/pix/qrcode', {
      method: 'POST',
      body: JSON.stringify({ order_id: id })
    });
    if (data.ok || data.pix_code) {
      await apiFetch('/pix/confirm', {
        method: 'POST',
        body: JSON.stringify({ order_id: id })
      });
      navigate(`/customer/tracking/${id}`);
    }
    setPaying(false);
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

      <div className="container">
        <div className="card" style={{ textAlign: 'center' }}>
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
          <p className="text-sm text-muted mt-2">
            Pagamento via Mercado Pago
          </p>
        </div>

        <div className="card text-center">
          <p className="text-sm text-muted mb-4">
            Voce sera redirecionado ao Mercado Pago para concluir o pagamento via Pix ou Cartao.
          </p>

          {error && (
            <div style={{ background: '#FFEBEE', color: '#C62828', padding: 10, borderRadius: 8, marginBottom: 12, fontSize: 13 }}>
              {error}
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, padding: '0 20px' }}>
            <button className="btn btn-primary"
              onClick={pagar}
              disabled={paying}
              style={{ padding: 14, fontSize: 16 }}>
              {paying ? 'Redirecionando...' : 'Pagar com Mercado Pago'}
            </button>

            {useSimulado && (
              <>
                <div style={{
                  background: '#FFF3E0', borderRadius: 8, padding: 10,
                  border: '1px solid #FFE0B2', fontSize: 13, color: '#E65100'
                }}>
                  Mercado Pago nao configurado — use o pagamento simulado.
                </div>
                <button className="btn btn-secondary"
                  onClick={pagarSimulado}
                  style={{ padding: 12 }}>
                  Pagamento Simulado (PIX)
                </button>
              </>
            )}
          </div>

          <p className="text-xs text-muted mt-4">
            Pagamento processado pelo Mercado Pago. Seus dados estao seguros.
          </p>
        </div>
      </div>
    </div>
  );
}
