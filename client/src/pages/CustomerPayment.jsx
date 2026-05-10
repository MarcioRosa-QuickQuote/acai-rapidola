import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';

function loadMercadoPagoScript() {
  return new Promise((resolve) => {
    if (window.MercadoPago) return resolve();
    const script = document.createElement('script');
    script.src = 'https://sdk.mercadopago.com/js/v2';
    script.onload = () => resolve();
    document.body.appendChild(script);
  });
}

export default function CustomerPayment() {
  const { id } = useParams();
  const { apiFetch } = useAuth();
  const { socket, joinOrder } = useSocket();
  const navigate = useNavigate();
  const [order, setOrder] = useState(null);
  const [paying, setPaying] = useState(false);
  const [error, setError] = useState('');
  const [savedCards, setSavedCards] = useState([]);
  const [selectedCardId, setSelectedCardId] = useState('');
  const [saveCard, setSaveCard] = useState(true);
  const [useNewCard, setUseNewCard] = useState(true);
  const [mpReady, setMpReady] = useState(false);
  const [paymentMethod, setPaymentMethod] = useState('pix');
  const cardFormRef = useRef(null);

  useEffect(() => {
    joinOrder(id);
    loadOrder();
    loadSavedCards();
    loadMercadoPagoScript().then(async () => {
      try {
        const res = await fetch('/api/config');
        const config = await res.json();
        if (config.mp_public_key) {
          window.__MP_PUBLIC_KEY = config.mp_public_key;
        }
      } catch {}
      setMpReady(true);
    });
  }, [id]);

  useEffect(() => {
    if (!mpReady || paymentMethod !== 'card' || !useNewCard) return;
    cardFormRef.current = null;
    const mp = new window.MercadoPago(window.__MP_PUBLIC_KEY || 'TEST-00000000-0000-0000-0000-000000000000');
    const cardForm = mp.cardForm({
      amount: String(order?.total?.toFixed(2) || '0'),
      iframe: true,
      form: {
        id: 'mp-card-form',
        cardholderName: { id: 'mp-cardholder-name', placeholder: 'Nome no cartao' },
        cardholderEmail: { id: 'mp-cardholder-email', placeholder: 'Email' },
        cardNumber: { id: 'mp-card-number', placeholder: 'Numero do cartao' },
        expirationDate: { id: 'mp-expiration-date', placeholder: 'MM/AA' },
        securityCode: { id: 'mp-security-code', placeholder: 'CVV' },
        installments: { id: 'mp-installments', placeholder: 'Parcelas' },
        identificationType: { id: 'mp-identification-type' },
        identificationNumber: { id: 'mp-identification-number', placeholder: 'CPF' },
        issuer: { id: 'mp-issuer', placeholder: 'Banco emissor' }
      },
      callbacks: {
        onFormMounted: (error) => { if (error) console.error(error); },
        onSubmit: (event) => {
          event.preventDefault();
          handleCardSubmit();
        },
        onFetching: () => setPaying(true),
      }
    });
    cardFormRef.current = cardForm;
    return () => { cardFormRef.current = null; };
  }, [mpReady, paymentMethod, useNewCard, order]);

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

  async function loadSavedCards() {
    const data = await apiFetch('/saved-cards');
    if (Array.isArray(data)) setSavedCards(data);
  }

  async function handleCardSubmit() {
    const cardForm = cardFormRef.current;
    if (!cardForm) return;
    setPaying(true);
    setError('');
    try {
      const cardData = await cardForm.getCardFormData();
      const res = await apiFetch('/process-card-payment', {
        method: 'POST',
        body: JSON.stringify({
          order_id: id,
          token: cardData.token,
          payment_method_id: cardData.paymentMethodId,
          installments: cardData.installments || 1,
          issuer_id: cardData.issuerId,
          payer_email: cardData.email || '',
          identification_type: cardData.identificationType,
          identification_number: cardData.identificationNumber,
          save_card: saveCard
        })
      });
      if (res.status === 'approved') {
        navigate(`/customer/tracking/${id}`);
      } else if (res.status_detail) {
        setError(mapMpError(res.status_detail));
      } else if (res.error) {
        setError(res.error);
      }
    } catch (err) {
      setError('Erro ao processar pagamento.');
    } finally {
      setPaying(false);
    }
  }

  async function payWithSavedCard() {
    if (!selectedCardId) return;
    setPaying(true);
    setError('');
    try {
      const res = await apiFetch('/pay-with-saved-card', {
        method: 'POST',
        body: JSON.stringify({ order_id: id, card_id: selectedCardId })
      });
      if (res.status === 'approved') {
        navigate(`/customer/tracking/${id}`);
      } else if (res.status_detail) {
        setError(mapMpError(res.status_detail));
      } else if (res.error) {
        setError(res.error);
      }
    } catch {
      setError('Erro ao processar pagamento.');
    } finally {
      setPaying(false);
    }
  }

  async function payWithPix() {
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
        setError(data.error);
      }
    } catch {
      setError('Erro ao gerar PIX.');
    } finally {
      setPaying(false);
    }
  }

  function mapMpError(detail) {
    const map = {
      'cc_rejected_bad_filled_date': 'Data de validade invalida.',
      'cc_rejected_bad_filled_other': 'Dados do cartao invalidos.',
      'cc_rejected_bad_filled_security_code': 'CVV invalido.',
      'cc_rejected_blacklist': 'Cartao bloqueado.',
      'cc_rejected_call_for_authorize': 'Ligue para o banco e autorize o pagamento.',
      'cc_rejected_card_disabled': 'Cartao desativado.',
      'cc_rejected_card_error': 'Erro no cartao.',
      'cc_rejected_duplicated_payment': 'Pagamento duplicado.',
      'cc_rejected_high_risk': 'Pagamento recusado por seguranca.',
      'cc_rejected_insufficient_amount': 'Saldo insuficiente.',
      'cc_rejected_invalid_installments': 'Numero de parcelas invalido.',
      'cc_rejected_max_attempts': 'Limite de tentativas excedido.',
      'cc_rejected_other_reason': 'Pagamento recusado pelo banco.'
    };
    return map[detail] || `Pagamento recusado: ${detail}`;
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
          <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--primary)' }}>
            R$ {order.total.toFixed(2)}
          </div>
          <p className="text-sm text-muted mt-2">Pagamento seguro via Mercado Pago</p>
        </div>

        {error && (
          <div style={{ background: '#FFEBEE', color: '#C62828', padding: 12, borderRadius: 8, marginBottom: 12, fontSize: 13, fontWeight: 600 }}>
            {error}
          </div>
        )}

        <div className="flex-row" style={{ marginBottom: 16 }}>
          <button className={`btn btn-sm ${paymentMethod === 'pix' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setPaymentMethod('pix')}>PIX</button>
          <button className={`btn btn-sm ${paymentMethod === 'card' ? 'btn-primary' : 'btn-outline'}`}
            onClick={() => setPaymentMethod('card')}>Cartao</button>
        </div>

        {paymentMethod === 'pix' && (
          <div className="card text-center">
            <p className="text-sm text-muted mb-4">Voce sera redirecionado ao Mercado Pago para pagar com PIX.</p>
            <button className="btn btn-primary" onClick={payWithPix} disabled={paying}
              style={{ padding: 14, fontSize: 16, width: '100%' }}>
              {paying ? 'Redirecionando...' : 'Pagar com PIX'}
            </button>
          </div>
        )}

        {paymentMethod === 'card' && (
          <div className="card">
            {savedCards.length > 0 && (
              <div style={{ marginBottom: 16 }}>
                <label className="label">Cartoes Salvos</label>
                <div className="flex-row" style={{ gap: 8, marginBottom: 8 }}>
                  <button className={`btn btn-sm ${useNewCard ? 'btn-outline' : 'btn-primary'}`}
                    onClick={() => setUseNewCard(false)}>
                    Usar Salvo ({savedCards.length})
                  </button>
                  <button className={`btn btn-sm ${useNewCard ? 'btn-primary' : 'btn-outline'}`}
                    onClick={() => setUseNewCard(true)}>
                    Novo Cartao
                  </button>
                </div>
                {!useNewCard && (
                  <div>
                    {savedCards.map(card => (
                      <div key={card.id} className="flex-between card"
                        onClick={() => setSelectedCardId(card.id)}
                        style={{
                          padding: '10px 14px',
                          cursor: 'pointer',
                          background: selectedCardId === card.id ? '#F3E5F5' : 'white',
                          border: selectedCardId === card.id ? '2px solid var(--primary)' : '1px solid var(--border)'
                        }}>
                        <div>
                          <div className="font-bold text-sm">{card.payment_method_id?.toUpperCase()} •••• {card.last_four_digits}</div>
                          <div className="text-xs text-muted">Validade {card.expiration_month}/{card.expiration_year}</div>
                        </div>
                      </div>
                    ))}
                    <button className="btn btn-primary mt-3" style={{ width: '100%' }}
                      onClick={payWithSavedCard} disabled={paying || !selectedCardId}>
                      {paying ? 'Processando...' : 'Pagar com Cartao Salvo'}
                    </button>
                  </div>
                )}
              </div>
            )}

            {useNewCard && (
              <div>
                <form id="mp-card-form">
                  <div className="form-group">
                    <label className="label">Nome no Cartao</label>
                    <div id="mp-cardholder-name" className="input" style={{ padding: 0 }} />
                  </div>
                  <div className="form-group">
                    <label className="label">Email</label>
                    <div id="mp-cardholder-email" className="input" style={{ padding: 0 }} />
                  </div>
                  <div className="form-group">
                    <label className="label">CPF</label>
                    <div id="mp-identification-number" className="input" style={{ padding: 0 }} />
                  </div>
                  <div className="form-group" style={{ display: 'none' }}>
                    <div id="mp-identification-type" />
                  </div>
                  <div className="form-group">
                    <label className="label">Numero do Cartao</label>
                    <div id="mp-card-number" className="input" style={{ padding: 0 }} />
                  </div>
                  <div style={{ display: 'flex', gap: 8 }}>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="label">Validade</label>
                      <div id="mp-expiration-date" className="input" style={{ padding: 0 }} />
                    </div>
                    <div className="form-group" style={{ flex: 1 }}>
                      <label className="label">CVV</label>
                      <div id="mp-security-code" className="input" style={{ padding: 0 }} />
                    </div>
                  </div>
                  <div className="form-group" style={{ display: 'none' }}>
                    <div id="mp-issuer" />
                  </div>
                  <div className="form-group" style={{ display: 'none' }}>
                    <div id="mp-installments" />
                  </div>

                  <div className="form-group" style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8 }}>
                    <input type="checkbox" id="save-card" checked={saveCard}
                      onChange={e => setSaveCard(e.target.checked)} />
                    <label htmlFor="save-card" className="text-sm" style={{ cursor: 'pointer', margin: 0 }}>
                      Salvar cartao para proximas compras
                    </label>
                  </div>

                  <button type="submit" className="btn btn-primary mt-3" style={{ width: '100%', padding: 14, fontSize: 16 }}
                    disabled={paying}>
                    {paying ? 'Processando...' : `Pagar R$ ${order.total.toFixed(2)}`}
                  </button>
                </form>

                <p className="text-xs text-muted" style={{ marginTop: 12, textAlign: 'center' }}>
                  Seus dados de cartao sao processados diretamente pelo Mercado Pago. Nao armazenamos dados sensiveis.
                </p>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
