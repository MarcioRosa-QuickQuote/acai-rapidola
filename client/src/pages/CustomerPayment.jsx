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
  const [pixData, setPixData] = useState(null);
  const [copied, setCopied] = useState(false);
  const [paying, setPaying] = useState(false);

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

  async function gerarPix() {
    const data = await apiFetch('/pix/qrcode', {
      method: 'POST',
      body: JSON.stringify({ order_id: id })
    });
    if (data.ok || data.pix_code) setPixData(data);
  }

  async function confirmarPagamento() {
    setPaying(true);
    const data = await apiFetch('/pix/confirm', {
      method: 'POST',
      body: JSON.stringify({ order_id: id })
    });
    if (data.ok) {
      navigate(`/customer/tracking/${id}`);
    }
  }

  function copyPix() {
    if (pixData) {
      navigator.clipboard.writeText(pixData.pix_code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  }

  if (!order) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div>
      <div className="header">
        <button className="btn btn-sm"
          style={{ background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 14 }}
          onClick={() => navigate('/customer')}>
          Voltar
        </button>
        <div className="header-title">Pagamento</div>
        <div style={{ width: 50 }} />
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
          <p className="text-sm text-muted mt-2">Pagamento via PIX</p>
        </div>

        {!pixData ? (
          <div className="card text-center">
            <p className="text-sm text-muted mb-4">Gere o código PIX para realizar o pagamento</p>
            <button className="btn btn-primary" onClick={gerarPix}>
              Gerar PIX
            </button>
          </div>
        ) : (
          <>
            <div className="card text-center">
              <div style={{
                background: 'white', padding: 16, display: 'inline-block',
                border: '3px solid var(--primary)', borderRadius: 12, margin: '8px 0'
              }}>
                <svg width="160" height="160" viewBox="0 0 160 160">
                  <rect width="160" height="160" fill="white"/>
                  <rect x="4" y="4" width="152" height="152" fill="none" stroke="#6A1B9A" strokeWidth="2"/>
                  <rect x="24" y="24" width="16" height="16" fill="#6A1B9A"/>
                  <rect x="24" y="56" width="16" height="16" fill="#6A1B9A"/>
                  <rect x="24" y="88" width="16" height="16" fill="#6A1B9A"/>
                  <rect x="56" y="24" width="16" height="16" fill="#6A1B9A"/>
                  <rect x="88" y="24" width="16" height="16" fill="#6A1B9A"/>
                  <rect x="120" y="24" width="16" height="16" fill="#6A1B9A"/>
                  <rect x="56" y="88" width="16" height="16" fill="#6A1B9A"/>
                  <rect x="88" y="88" width="16" height="16" fill="#6A1B9A"/>
                  <rect x="120" y="88" width="16" height="16" fill="#6A1B9A"/>
                  <rect x="24" y="120" width="16" height="16" fill="#6A1B9A"/>
                  <rect x="56" y="120" width="16" height="16" fill="#6A1B9A"/>
                  <rect x="88" y="120" width="16" height="16" fill="#6A1B9A"/>
                  <rect x="120" y="120" width="16" height="16" fill="#6A1B9A"/>
                </svg>
              </div>
              <p className="text-xs text-muted mt-2">Escaneie o QR Code no app do seu banco</p>

              <div className="flex-row" style={{ marginTop: 12, justifyContent: 'center' }}>
                <button className="btn btn-sm btn-outline" onClick={copyPix}>
                  {copied ? 'Copiado!' : 'Copiar PIX'}
                </button>
              </div>
            </div>

            <div style={{ padding: '12px 0', textAlign: 'center' }}>
              <div style={{
                background: '#FFF3E0', borderRadius: 8, padding: 12, marginBottom: 12,
                border: '1px solid #FFE0B2'
              }}>
                <span className="text-sm" style={{ color: '#E65100' }}>
                  Simulação: o pagamento será aprovado automaticamente ao clicar abaixo.
                </span>
              </div>
              <button className="btn btn-secondary" onClick={confirmarPagamento} disabled={paying}>
                {paying ? 'Confirmando...' : 'Confirmar Pagamento (Simulado)'}
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
