import { useState, useEffect, useRef } from 'react';

function OrderDetails({ orderId, apiFetch }) {
  const [order, setOrder] = useState(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!orderId || order) return;
    setLoading(true);
    apiFetch(`/orders/${orderId}`).then(d => {
      if (d.ok) setOrder(d);
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

function Conversation({ group, apiFetch, storeId, onBack, onReload }) {
  const [replyText, setReplyText] = useState('');
  const [replySending, setReplySending] = useState(false);
  const [showOrderFor, setShowOrderFor] = useState(null);
  const bottomRef = useRef(null);

  const sorted = [...group.messages].sort((a, b) => new Date(a.created_at) - new Date(b.created_at));

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [sorted.length]);

  async function sendReply() {
    if (!replyText.trim()) return;
    setReplySending(true);
      const data = await apiFetch('/messages/reply', {
      method: 'POST',
      body: JSON.stringify({ customer_id: group.customer_id, store_id: storeId, message: replyText.trim() })
    });
    setReplySending(false);
    if (data.ok) { setReplyText(''); onReload(); }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100vh - 160px)' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12 }}>
        <div onClick={onBack} style={{
          width: 36, height: 36, borderRadius: '50%',
          background: '#F3E5F5', display: 'flex', alignItems: 'center', justifyContent: 'center',
          cursor: 'pointer', fontSize: 18, fontWeight: 700, color: '#6A1B9A', flexShrink: 0
        }}>‹</div>
        <div>
          <div style={{ fontWeight: 700, fontSize: 16 }}>{group.customer_name}</div>
          <div style={{ fontSize: 12, color: '#888' }}>{sorted.length} mensagens</div>
        </div>
      </div>

      <div style={{ flex: 1, overflowY: 'auto', padding: '0 4px' }}>
        {sorted.map(msg => {
          const isStore = msg.from_store;
          return (
            <div key={msg.id} style={{ display: 'flex', flexDirection: 'column', alignItems: isStore ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
              <div style={{
                maxWidth: '85%',
                background: isStore ? '#6A1B9A' : '#F0F0F0',
                color: isStore ? 'white' : '#333',
                borderRadius: isStore ? '16px 16px 4px 16px' : '16px 16px 16px 4px',
                padding: '10px 14px',
                fontSize: 14,
                lineHeight: 1.4,
                wordBreak: 'break-word'
              }}>
                <div>{msg.message}</div>
                <div style={{ fontSize: 10, marginTop: 4, color: isStore ? 'rgba(255,255,255,0.6)' : '#999', textAlign: 'right' }}>
                  {new Date(msg.created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                </div>
              </div>
              {!isStore && msg.order_id && (
                <div style={{ marginTop: 4, marginLeft: 4 }}>
                  <span onClick={() => setShowOrderFor(showOrderFor === msg.id ? null : msg.id)}
                    style={{ fontSize: 12, color: '#6A1B9A', fontWeight: 600, cursor: 'pointer', textDecoration: 'underline' }}>
                    📋 {showOrderFor === msg.id ? 'Esconder pedido' : 'Ver pedido'}
                  </span>
                  {showOrderFor === msg.id && <OrderDetails orderId={msg.order_id} apiFetch={apiFetch} />}
                </div>
              )}
            </div>
          );
        })}
        <div ref={bottomRef} />
      </div>

      <div style={{ borderTop: '1px solid var(--border)', padding: '12px 0', display: 'flex', gap: 8, alignItems: 'flex-end' }}>
        <textarea className="input" value={replyText} onChange={e => setReplyText(e.target.value)}
          placeholder="Digite sua resposta..."
          style={{ flex: 1, minHeight: 44, maxHeight: 120, resize: 'none', fontSize: 14 }}
          onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendReply(); } }} />
        <button className="btn btn-primary" style={{ height: 44, width: 44, padding: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', borderRadius: '50%' }}
          disabled={!replyText.trim() || replySending} onClick={sendReply}>
          <svg width="20" height="20" viewBox="0 0 24 24" fill="white"><path d="M2.01 21L23 12 2.01 3 2 10l15 2-15 2z"/></svg>
        </button>
      </div>
    </div>
  );
}

export default function StoreMessages({ messages, storeId, apiFetch, onReload }) {
  const [selectedCustomer, setSelectedCustomer] = useState(null);

  const groups = {};
  messages.forEach(msg => {
    const key = msg.from_store ? 'store' : msg.customer_id;
    if (!groups[key]) groups[key] = { customer_id: msg.customer_id, customer_name: msg.customer_name, messages: [] };
    groups[key].messages.push(msg);
  });

  const groupList = Object.entries(groups).sort((a, b) => {
    const aLast = new Date(a[1].messages[a[1].messages.length - 1].created_at).getTime();
    const bLast = new Date(b[1].messages[b[1].messages.length - 1].created_at).getTime();
    return bLast - aLast;
  });

  if (selectedCustomer) {
    return (
      <Conversation group={selectedCustomer} apiFetch={apiFetch} storeId={storeId}
        onBack={() => setSelectedCustomer(null)} onReload={onReload} />
    );
  }

  if (messages.length === 0) {
    return (
      <div className="card" style={{ textAlign: 'center', padding: 40 }}>
        <div style={{ fontSize: 40, marginBottom: 12 }}>💬</div>
        <div style={{ fontSize: 16, fontWeight: 700, color: '#333' }}>Mensagens</div>
        <div className="text-muted" style={{ marginTop: 8 }}>Nenhuma mensagem recebida</div>
      </div>
    );
  }

  return groupList.map(([key, group]) => {
    const unread = group.messages.some(m => !m.read && !m.from_store);
    return (
      <div key={key} className="card" style={{
        padding: '14px 16px', marginBottom: 12, cursor: 'pointer',
        background: unread ? '#F8F4FC' : 'white',
        borderLeft: unread ? '3px solid #6A1B9A' : '3px solid transparent'
      }} onClick={async () => {
        const unreadMsgs = group.messages.filter(m => !m.read && !m.from_store);
        await Promise.all(unreadMsgs.map(m => apiFetch(`/messages/${m.id}/read`, { method: 'PATCH' })));
        onReload();
        setSelectedCustomer(group);
      }}>
        <div className="flex-between" style={{ marginBottom: 4 }}>
          <span style={{ fontWeight: 700, fontSize: 15 }}>{group.customer_name}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
            {unread && <div style={{ width: 10, height: 10, borderRadius: '50%', background: '#6A1B9A' }} />}
            <span style={{ fontSize: 12, color: '#999' }}>
              {new Date(group.messages[group.messages.length - 1].created_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
            </span>
          </div>
        </div>
        <div style={{ fontSize: 13, color: '#888', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {group.messages[group.messages.length - 1].message}
        </div>
      </div>
    );
  });
}
