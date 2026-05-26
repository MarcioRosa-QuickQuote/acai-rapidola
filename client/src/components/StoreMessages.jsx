import { useState, useEffect } from 'react';

function OrderDetails({ orderId, apiFetch }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orderId || order) return;
    setLoading(true);
    apiFetch(`/orders/${orderId}`).then(d => {
      if (d.data) setOrder(d.data);
      setLoading(false);
    });
  }, [orderId]);

  if (loading) return <div style={{ fontSize: 12, color: '#888', padding: '8px 0' }}>Carregando pedido...</div>;
  if (!order) return null;

  return (
    <div style={{ marginTop: 8, padding: 12, background: '#F3E5F5', borderRadius: 8, border: '1px solid #E1BEE7' }}>
      <div style={{ fontWeight: 700, fontSize: 13, color: '#6A1B9A', marginBottom: 6 }}>📋 Pedido #{order.id?.slice(0, 8)}</div>
      {(order.items || []).map((item, i) => (
        <div key={i} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 2 }}>
          <span>{item.quantity}x {item.product_name || 'Produto'}</span>
          <span>R$ {(item.unit_price * item.quantity).toFixed(2)}</span>
        </div>
      ))}
      {order.delivery_fee > 0 && (
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginTop: 4 }}>
          <span>Frete</span>
          <span>R$ {order.delivery_fee.toFixed(2)}</span>
        </div>
      )}
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, fontWeight: 700, color: '#6A1B9A', marginTop: 6, borderTop: '1px solid #E1BEE7', paddingTop: 6 }}>
        <span>Total</span>
        <span>R$ {order.total?.toFixed(2)}</span>
      </div>
    </div>
  );
}

export default function StoreMessages({ messages, storeId, apiFetch, onReload }) {
  const [showReplyFor, setShowReplyFor] = useState(null);
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [showOrderFor, setShowOrderFor] = useState(null);

  if (messages.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#333' }}>Mensagens</div>
        <div className="text-muted" style={{ marginTop: 8 }}>Nenhuma mensagem recebida</div>
      </div>
    );
  }

  return messages.map(msg => {
    const replying = showReplyFor === msg.id;
    return (
      <div key={msg.id} className="card" style={{
        padding: '14px 16px', marginBottom: 8,
        background: msg.read ? 'white' : '#F3E5F5',
        borderLeft: msg.read ? '3px solid transparent' : '3px solid #6A1B9A'
      }}>
        <div style={{ cursor: 'pointer' }} onClick={async () => {
          if (!msg.read) {
            await apiFetch(`/messages/${msg.id}/read`, { method: 'PATCH' });
            onReload();
          }
          setShowReplyFor(showReplyFor === msg.id ? null : msg.id);
          setReplyText('');
        }}>
          <div className="flex-between" style={{ marginBottom: 4 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
              {msg.from_store ? <span style={{ fontSize: 12, color: '#6A1B9A', fontWeight: 600 }}>📤 Você</span> : <span style={{ fontWeight: 700, fontSize: 14 }}>{msg.customer_name}</span>}
              {msg.from_store ? <span className="badge" style={{ background: '#E8F5E9', color: '#2E7D32', fontSize: 10 }}>Resposta enviada</span> : null}
            </div>
            <span style={{ fontSize: 11, color: '#999' }}>
              {new Date(msg.created_at).toLocaleString('pt-BR')}
            </span>
          </div>
          <div style={{ fontSize: 13, color: '#555', lineHeight: 1.4 }}>{msg.message}</div>
        </div>
        {!msg.from_store && msg.order_id && (
          <div style={{ marginTop: 8 }}>
            <span onClick={(e) => { e.stopPropagation(); setShowOrderFor(showOrderFor === msg.id ? null : msg.id); }}
              style={{ fontSize: 12, color: '#6A1B9A', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
              📋 {showOrderFor === msg.id ? 'Esconder pedido' : 'Ver pedido'}
            </span>
            {showOrderFor === msg.id && (
              <OrderDetails orderId={msg.order_id} apiFetch={apiFetch} />
            )}
          </div>
        )}
        {replying && !msg.from_store && (
          <div style={{ marginTop: 12, borderTop: '1px solid var(--border)', paddingTop: 12 }}>
            <textarea className="input" value={replyText} onChange={e => setReplyText(e.target.value)}
              placeholder="Digite sua resposta..."
              style={{ minHeight: 80, resize: 'vertical', fontSize: 14, marginBottom: 8 }} />
            <button className="btn btn-sm btn-primary" disabled={!replyText.trim() || replySending}
              onClick={async () => {
                if (!replyText.trim()) return;
                setReplySending(true);
                const data = await apiFetch('/messages/reply', {
                  method: 'POST',
                  body: JSON.stringify({ customer_id: msg.customer_id, store_id: storeId, message: replyText.trim() })
                });
                setReplySending(false);
                if (data.ok) { setReplyText(''); setShowReplyFor(null); onReload(); }
              }}>
              {replySending ? 'Enviando...' : 'Responder'}
            </button>
          </div>
        )}
      </div>
    );
  });
}
