import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';

const statusLabels = {
  pending: 'Aguardando', confirmed: 'Confirmado', preparing: 'Preparando',
  ready: 'Pronto', assigned: 'Motoboy a caminho', picked_up: 'Retirado',
  in_transit: 'Em trânsito', arriving: 'Chegando', delivered: 'Entregue', cancelled: 'Cancelado'
};

const statusColors = {
  pending: 'badge-warning', confirmed: 'badge-primary', preparing: 'badge-primary',
  ready: 'badge-success', assigned: 'badge-info', picked_up: 'badge-info',
  in_transit: 'badge-info', arriving: 'badge-accent', delivered: 'badge-success', cancelled: 'badge-danger'
};

export default function CustomerHome() {
  const { user, apiFetch, logout } = useAuth();
  const { socket, joinOrder } = useSocket();
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [view, setView] = useState('menu');
  const [cart, setCart] = useState({});
  const [splitItems, setSplitItems] = useState({});
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    apiFetch('/products').then(d => {
      if (d.data) setProducts(d.data);
      setCart({});
      setSplitItems({});
      setLoading(false);
    });
    apiFetch('/stores').then(d => {
      if (d.data && d.data.length > 0) setStore(d.data[0]);
    });
    loadOrders();
  }, []);

  useEffect(() => {
    if (!socket) return;
    socket.on('order_status', (data) => {
      setOrders(prev => prev.map(o =>
        o.id === data.orderId ? { ...o, status: data.status } : o
      ));
    });
    socket.on('payment_confirmed', (data) => {
      setOrders(prev => prev.map(o =>
        o.id === data.orderId ? { ...o, payment_status: 'paid', status: 'confirmed' } : o
      ));
    });
    return () => {
      socket.off('order_status');
      socket.off('payment_confirmed');
    };
  }, [socket]);

  function loadOrders() {
    apiFetch('/orders').then(d => {
      if (d.data) setOrders(d.data);
    });
  }

  function addToCart(productId) {
    setCart(prev => ({
      ...prev,
      [productId]: (prev[productId] || 0) + 1
    }));
  }

  function removeFromCart(productId) {
    setCart(prev => {
      const updated = { ...prev };
      if (updated[productId] <= 1) {
        delete updated[productId];
      } else {
        updated[productId]--;
      }
      return updated;
    });
  }

  function goToOrder(productId) {
    const prod = products.find(p => p.id === productId);
    if (prod) {
      navigate('/customer/order', {
        state: { product: prod, store, quantity: cart[productId] || 1, splitCount: splitItems[productId] || 0 }
      });
    }
  }

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div>
      <div className="header">
        <div className="header-left">
          {store?.logo && (
            <img src={store.logo} alt="Logo" style={{ width: 56, height: 56, borderRadius: 8, objectFit: 'contain', flexShrink: 0 }} onError={e => { e.target.style.display = 'none'; }} />
          )}
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: 12, opacity: 0.8 }}>Olá, {user?.name?.split(' ')[0]}</div>
            <div className="header-title">Açaí Rapidola</div>
          </div>
        </div>
        <div className="header-right">
          <button className="btn btn-sm"
            style={{ color: 'white', borderColor: 'rgba(255,255,255,0.5)', fontSize: 12, background: 'transparent', border: '1px solid rgba(255,255,255,0.4)' }}
            onClick={() => setView(view === 'menu' ? 'orders' : view === 'orders' ? 'conta' : 'menu')}>
            {view === 'menu' ? 'Pedidos' : view === 'orders' ? 'Conta' : 'Cardápio'}
          </button>
          <button className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 12 }}
            onClick={logout}>Sair</button>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 12 }}>
        {view === 'menu' ? (
          <>
            {store && !store.open && (
              <div className="card" style={{
                background: '#FFF3E0', border: '1px solid #FF6F00', textAlign: 'center' }}>
                <span className="font-bold" style={{ color: '#FF6F00' }}>
                  As entregas já encerraram por hoje. Volte amanhã!
                </span>
              </div>
            )}

            <div className="page-title" style={{ color: 'var(--primary)' }}>
              <span role="img" aria-label="acai"></span> Cardápio
            </div>

            {products.map(p => (
              <div key={p.id} className="card">
                <div className="flex-row" style={{ gap: 12, marginBottom: 8 }}>
                  {p.image ? (
                    <img src={p.image} alt={p.name}
                      style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
                      onError={e => { e.target.style.display = 'none'; }} />
                  ) : (
                    <div style={{
                      width: 72, height: 72, borderRadius: 12, flexShrink: 0,
                      background: p.size_ml >= 1000 ? 'linear-gradient(135deg, #4A148C, #7B1FA2)' :
                                   p.name.includes('Farinha') ? 'linear-gradient(135deg, #FFF8E1, #FFE082)' :
                                   'linear-gradient(135deg, #6A1B9A, #9C27B0)',
                      display: 'flex', alignItems: 'center', justifyContent: 'center',
                      fontSize: 30
                    }}>
                      {p.name.includes('Açaí') ? '' : p.name.includes('Farinha') ? '' : ''}
                    </div>
                  )}
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16 }}>{p.name}</div>
                    <div className="text-sm text-muted" style={{ marginTop: 2 }}>{p.description}</div>
                  </div>
                  <span className="badge badge-primary" style={{ flexShrink: 0 }}>{p.size_ml}ml</span>
                </div>
                <div className="flex-between" style={{ marginTop: 8 }}>
                  <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>
                    R$ {p.price.toFixed(2)}
                  </span>
                  <div className="flex-row">
                    {cart[p.id] ? (
                      <>
                        <button className="btn btn-sm btn-outline"
                          style={{ width: 36, height: 36, padding: 0 }}
                          onClick={() => removeFromCart(p.id)}>−</button>
                        <span style={{ fontWeight: 700, minWidth: 24, textAlign: 'center' }}>
                          {cart[p.id]}
                        </span>
                        <button className="btn btn-sm btn-primary"
                          style={{ width: 36, height: 36, padding: 0 }}
                          onClick={() => addToCart(p.id)}>+</button>
                        <button className="btn btn-sm btn-secondary"
                          onClick={() => goToOrder(p.id)}>
                          Pedir
                        </button>
                      </>
                    ) : (
                      <button className="btn btn-sm btn-primary"
                        onClick={() => addToCart(p.id)}>
                        Adicionar
                      </button>
                    )}
                  </div>
                </div>

                {p.size_ml >= 1000 && cart[p.id] > 0 && (
                  <div style={{ marginTop: 8 }}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 6 }}>Como quer receber?</div>
                    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                      {Array.from({ length: cart[p.id] + 1 }, (_, k) => {
                        const litrosInteiros = cart[p.id] - k;
                        const meios = k * 2;
                        if (litrosInteiros === 0 && meios === 0) return null;
                        let label = '';
                        if (litrosInteiros > 0 && meios > 0) label = `${litrosInteiros}L + ${meios} de meio`;
                        else if (litrosInteiros > 0) label = `${litrosInteiros}L`;
                        else label = `${meios} de meio`;
                        const isActive = (splitItems[p.id] || 0) === k;
                        return (
                          <button key={k}
                            onClick={() => setSplitItems(s => ({ ...s, [p.id]: k }))}
                            style={{
                              padding: '6px 12px', borderRadius: 20, border: isActive ? '2px solid #6A1B9A' : '1px solid #DDD',
                              background: isActive ? '#F3E5F5' : 'white', color: isActive ? '#6A1B9A' : '#666',
                              fontSize: 13, fontWeight: isActive ? 700 : 400, cursor: 'pointer'
                            }}>
                            {label}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            ))}

            {Object.keys(cart).length > 0 && (
              <div style={{
                position: 'fixed', bottom: 0, left: 0, right: 0,
                background: 'white', padding: 16, boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
                display: 'flex', justifyContent: 'center'
              }}>
                <button className="btn btn-primary" style={{ maxWidth: 400 }}
                  onClick={() => {
                    const items = Object.entries(cart).map(([id, qty]) => {
                      const p = products.find(pp => pp.id === id);
                      return { product_id: id, quantity: qty, name: p?.name, price: p?.price };
                    });
                    const total = items.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
                    navigate('/customer/order', { state: { items, store, total } });
                  }}>
                  Ver Carrinho ({Object.values(cart).reduce((a,b) => a+b, 0)} itens)
                </button>
              </div>
            )}
          </>
        ) : view === 'orders' ? (
          <>
            <div className="page-title">Meus Pedidos</div>
            {orders.length === 0 ? (
              <div className="empty-state">
                <div className="empty-state-icon">
                  <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                    <rect x="16" y="20" width="32" height="32" rx="4" stroke="var(--border)" strokeWidth="2"/>
                    <path d="M24 30h16M24 36h10" stroke="var(--border)" strokeWidth="2" strokeLinecap="round"/>
                  </svg>
                </div>
                <p>Nenhum pedido ainda</p>
              </div>
            ) : (
              orders.map(order => (
                <div key={order.id} className="card" onClick={() => {
                  joinOrder(order.id);
                  if (order.payment_status === 'paid') {
                    navigate(`/customer/tracking/${order.id}`);
                  } else if (order.payment_status === 'pending') {
                    navigate(`/customer/payment/${order.id}`);
                  }
                }} style={{ cursor: 'pointer' }}>
                  <div className="flex-between" style={{ marginBottom: 8 }}>
                    <span style={{ fontWeight: 700 }}>Pedido #{order.id.slice(0, 8)}</span>
                    <span className={`badge ${statusColors[order.status] || 'badge-warning'}`}>
                      {statusLabels[order.status]}
                    </span>
                  </div>
                  <div className="flex-between text-sm text-muted">
                    <span>{order.store_name}</span>
                    <span className="font-bold" style={{ color: 'var(--primary)' }}>
                      R$ {order.total.toFixed(2)}
                    </span>
                  </div>
                  <div className="flex-between text-xs text-muted" style={{ marginTop: 4 }}>
                    <span>{new Date(order.created_at).toLocaleString('pt-BR')}</span>
                    <span className={`badge ${order.payment_status === 'paid' ? 'badge-success' : 'badge-warning'}`}>
                      {order.payment_status === 'paid' ? 'Pago' : 'Pendente'}
                    </span>
                  </div>
                </div>
              ))
            )}
          </>
        ) : (
          <>
            <div className="page-title">Minha Conta</div>
            <div className="card">
              <div className="form-group">
                <label className="label">Endereço de entrega</label>
                <input className="input" type="text" value={user?.address || ''}
                  readOnly
                  placeholder="Seu endereço será salvo no primeiro pedido"
                  style={{ background: '#F5F5F5' }} />
                <span className="text-xs text-muted">
                  O endereço é salvo automaticamente no seu primeiro pedido. Para alterar, faça um novo pedido com o endereço atualizado.
                </span>
              </div>
              <div className="flex-between text-sm" style={{ marginTop: 8 }}>
                <span>Nome:</span><span className="font-bold">{user?.name}</span>
              </div>
              <div className="flex-between text-sm" style={{ marginTop: 4 }}>
                <span>Telefone:</span><span>{user?.phone}</span>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
