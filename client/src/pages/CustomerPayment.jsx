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
  const [pix, setPix] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [countdown, setCountdown] = useState(1800);

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
    if (data.ok || data.id) {
      setOrder(data);
      if (data.payment_status === 'paid') {
        navigate(`/customer/tracking/${id}`);
        return;
      }
      if (data.payment_id) {
        const statusRes = await apiFetch(`/payment-status/${data.payment_id}`);
        if (statusRes.status === 'approved') {
          await apiFetch('/pix/confirm', { method: 'POST', body: JSON.stringify({ order_id: id }) });
          navigate(`/customer/tracking/${id}`);
          return;
        }
      }
      generatePix();
    }
    setLoading(false);
  }

  async function generatePix() {
    setError('');
    try {
      const data = await apiFetch('/pix/qrcode', {
        method: 'POST',
        body: JSON.stringify({ order_id: id })
      });
      if (data.success) {
        setPix(data);
        startPolling(data.payment_id);
      } else if (data.error) {
        setError(data.error);
      }
    } catch {
      setError('Erro ao gerar PIX. Tente novamente.');
    }
  }

  function startPolling(paymentId) {
    let confirmed = false;
    const timer = setInterval(async () => {
      if (confirmed) return;
      try {
        const res = await apiFetch(`/payment-status/${paymentId}`);
        if (res.status === 'approved') {
          confirmed = true;
          clearInterval(timer);
          await apiFetch('/pix/confirm', { method: 'POST', body: JSON.stringify({ order_id: id }) });
          navigate(`/customer/tracking/${id}`);
        }
      } catch {}
    }, 5000);
    setTimeout(() => { clearInterval(timer); confirmed = true; }, 30 * 60 * 1000);
  }

  useEffect(() => {
    if (!pix) return;
    const t = setInterval(() => {
      setCountdown(prev => {
        if (prev <= 1) { clearInterval(t); return 0; }
        return prev - 1;
      });
    }, 1000);
    return () => clearInterval(t);
  }, [pix]);

  function copyPix() {
    if (!pix?.pix_copy_paste) return;
    navigator.clipboard.writeText(pix.pix_copy_paste);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  const minutes = Math.floor(countdown / 60);
  const seconds = countdown % 60;

  if (loading) return <div className="loading"><img className="spin" src="/saco_acai.png" /></div>;

  return (
    <div>
      <div className="header">
        <div className="header-left">
          <button className="btn btn-sm"
            style={{ background: 'var(--border)', color: 'var(--primary-dark)', fontSize: 13, fontWeight: 700 }}
            onClick={() => navigate(-1)}>
            Voltar
          </button>
        </div>
        <div className="header-title">Pagamento</div>
        <div className="header-right" />
      </div>

      <div className="container" style={{ textAlign: 'center' }}>
        <div className="card" style={{ background: 'linear-gradient(135deg, #F3E5F5, #E1BEE7)', border: '1px solid #CE93D8' }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#6A1B9A', marginBottom: 4 }}>Valor do pedido</div>
          <div style={{ fontSize: 32, fontWeight: 800, color: 'var(--primary-dark)' }}>
            R$ {order.total.toFixed(2)}
          </div>
        </div>

        {order.payment_status === 'paid' ? (
          <div className="card" style={{ background: '#E8F5E9', border: '1px solid #C8E6C9', textAlign: 'center' }}>
            <div style={{ fontSize: 48, marginBottom: 8 }}>✅</div>
            <div style={{ fontSize: 18, fontWeight: 700, color: '#2E7D32' }}>Pagamento confirmado!</div>
            <p className="text-sm text-muted mt-2">Redirecionando para acompanhar seu pedido...</p>
          </div>
        ) : pix ? (
          <div className="card" style={{ padding: '16px 20px' }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text)', marginBottom: 12 }}>
              Pague com PIX
            </div>

            {pix.qr_code_base64 && (
              <div style={{
                background: 'white', padding: 16, borderRadius: 12,
                display: 'inline-block', border: '2px solid #E8E0F0', marginBottom: 16
              }}>
                <img src={`data:image/png;base64,${pix.qr_code_base64}`}
                  alt="QR Code PIX" style={{ width: 200, height: 200, display: 'block' }} />
              </div>
            )}

            {pix.pix_copy_paste && (
              <div style={{ textAlign: 'left', marginBottom: 16 }}>
                <div style={{ fontSize: 11, fontWeight: 600, color: '#999', marginBottom: 6 }}>
                  Ou copie o código PIX:
                </div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    flex: 1, background: '#F5F5F5', padding: '10px 12px', borderRadius: 8,
                    fontSize: 11, wordBreak: 'break-all', color: '#666', border: '1px solid #E0E0E0',
                    maxHeight: 60, overflow: 'auto'
                  }}>
                    {pix.pix_copy_paste}
                  </div>
                  <button className="btn btn-sm btn-primary"
                    onClick={copyPix} style={{ width: 'auto', whiteSpace: 'nowrap', padding: '10px 16px' }}>
                    {copied ? 'Copiado!' : 'Copiar'}
                  </button>
                </div>
              </div>
            )}

            <div style={{
              background: '#FFF3E0', borderRadius: 8, padding: '10px 14px',
              fontSize: 12, color: '#E65100', fontWeight: 600
            }}>
              Expira em {minutes}:{seconds.toString().padStart(2, '0')}
            </div>

            <p className="text-xs text-muted mt-3">
              Pagamento seguro via Mercado Pago
            </p>
          </div>
        ) : (
          <div className="card">
            {error && (
              <div style={{
                background: '#FFEBEE', color: '#C62828', padding: 10,
                borderRadius: 8, marginBottom: 12, fontSize: 13
              }}>
                {error}
              </div>
            )}
            <button className="btn btn-primary" onClick={generatePix}
              style={{ padding: '16px 32px', fontSize: 18, fontWeight: 700, borderRadius: 12 }}>
              Gerar PIX
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
