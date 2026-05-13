import { useState, useEffect, useRef } from 'react';
import { useNavigate, useParams, useSearchParams } from 'react-router-dom';
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
  const { storeId } = useParams();
  const [store, setStore] = useState(null);
  const [products, setProducts] = useState([]);
  const [orders, setOrders] = useState([]);
  const [view, setView] = useState('menu');
  const [mainTab, setMainTab] = useState('menu');
  const [searchParams] = useSearchParams();
  const [cart, setCart] = useState({});
  const [splitItems, setSplitItems] = useState({});
  const [loading, setLoading] = useState(true);
  const [addrForm, setAddrForm] = useState(null);
  const [savingAddr, setSavingAddr] = useState(false);
  const [addrMsg, setAddrMsg] = useState('');
  const [addressSuggestions, setAddressSuggestions] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [cep, setCep] = useState('');
  const [cepLoading, setCepLoading] = useState(false);
  const photoRef = useRef(null);
  const navigate = useNavigate();

  useEffect(() => {
    if (searchParams.get('tab') === 'conta') setView('conta');
  }, [searchParams]);

  useEffect(() => {
    if (!storeId) {
      setView('conta');
      setLoading(false);
      return;
    }
    apiFetch(`/products?store_id=${storeId}`).then(d => {
      if (d.data) setProducts(d.data);
      setCart({});
      setSplitItems({});
      setLoading(false);
    });
    apiFetch(`/stores/${storeId}`).then(d => {
      if (d.ok) setStore(d);
    });
    loadOrders();
  }, [storeId]);

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
    setCart(prev => ({ ...prev, [productId]: (prev[productId] || 0) + 1 }));
  }

  function removeFromCart(productId) {
    setCart(prev => {
      const updated = { ...prev };
      if (updated[productId] <= 1) delete updated[productId];
      else updated[productId]--;
      return updated;
    });
  }

  function goToOrder(productId) {
    const prod = products.find(pp => pp.id === productId);
    if (prod && store) {
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
          <button className="btn btn-sm"
            style={{ background: 'rgba(255,255,255,0.15)', color: 'white', fontSize: 13, padding: '6px 10px' }}
            onClick={() => navigate('/customer')}>
            &larr; Lojas
          </button>
        </div>
        <div className="header-right" style={{ gap: 8 }}>
          <div onClick={() => {
            if (storeId) setView(view === 'conta' ? 'menu' : 'conta');
          }}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: storeId ? 'pointer' : 'default' }}>
            {user?.photo_url ? (
              <img src={user.photo_url} alt="Foto"
                style={{ width: 34, height: 34, borderRadius: '50%', objectFit: 'cover', flexShrink: 0 }}
                onError={e => { e.target.style.display = 'none'; }} />
            ) : (
              <div style={{
                width: 34, height: 34, borderRadius: '50%',
                background: 'linear-gradient(135deg, #CE93D8, #AB47BC)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                color: 'white', fontWeight: 700, fontSize: 15, flexShrink: 0, lineHeight: 1
              }}>
                {user?.name?.charAt(0)?.toUpperCase()}
              </div>
            )}
            <div>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'white', lineHeight: 1.2 }}>{user?.name?.split(' ')[0]}</div>
              <div onClick={(e) => { e.stopPropagation(); logout(); }}
                style={{ fontSize: 10, color: 'rgba(255,255,255,0.6)', cursor: 'pointer', lineHeight: 1 }}>
                Sair
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 12 }}>
        {view === 'conta' ? renderConta() : renderMenu()}
      </div>
    </div>
  );

  function renderConta() {
    const currentAddr = addrForm !== null ? addrForm : (user?.address || '');

    async function saveAddress() {
      setSavingAddr(true);
      const newAddr = addrForm || '';
      const data = await apiFetch('/auth/profile', { method: 'PATCH', body: JSON.stringify({ address: newAddr }) });
      if (data.ok) {
        setAddrMsg('Endereço salvo!');
        window.location.reload();
      } else {
        setAddrMsg(data.error || 'Erro ao salvar');
      }
      setTimeout(() => setAddrMsg(''), 3000);
      setSavingAddr(false);
    }

    async function clearAddress() {
      setSavingAddr(true);
      setAddrForm('');
      const data = await apiFetch('/auth/profile', { method: 'PATCH', body: JSON.stringify({ address: '', lat: null, lng: null }) });
      if (data.ok) {
        setAddrMsg('Endereço removido!');
        window.location.reload();
      } else {
        setAddrMsg(data.error || 'Erro ao remover');
      }
      setTimeout(() => setAddrMsg(''), 3000);
      setSavingAddr(false);
    }

    async function searchAddress(q) {
      if (q.length < 5) { setAddressSuggestions([]); setShowSuggestions(false); return; }
      try {
        const res = await fetch(`/api/orders/geocode?q=${encodeURIComponent(q)}`);
        const data = await res.json();
        setAddressSuggestions(data || []);
        setShowSuggestions(data?.length > 0);
      } catch { setShowSuggestions(false); }
    }

    async function lookupCep() {
      const cleaned = cep.replace(/\D/g, '');
      if (cleaned.length !== 8) return;
      setCepLoading(true);
      try {
        const res = await fetch(`/api/orders/cep/${cleaned}`);
        const data = await res.json();
        if (data.error) {
          setAddrMsg(data.error);
          setTimeout(() => setAddrMsg(''), 3000);
          return;
        }
        setAddrForm(data.display_name);
        setShowSuggestions(false);
      } catch {
        setAddrMsg('Erro ao consultar CEP');
        setTimeout(() => setAddrMsg(''), 3000);
      } finally {
        setCepLoading(false);
      }
    }

    function selectAddress(suggestion) {
      setAddrForm(suggestion.display_name);
      setShowSuggestions(false);
    }

    async function uploadPhoto(file) {
      const formData = new FormData();
      formData.append('image', file);
      const res = await fetch('/api/products/upload-image', {
        method: 'POST',
        headers: { Authorization: `Bearer ${localStorage.getItem('token')}` },
        body: formData
      });
      const data = await res.json();
      if (data.url) {
        await apiFetch('/auth/profile', { method: 'PATCH', body: JSON.stringify({ photo_url: data.url }) });
        window.location.reload();
      }
    }

    return (
      <>
        <div className="page-title" style={{ fontWeight: 800 }}>Minha Conta</div>
        <div className="card" style={{ textAlign: 'left' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
            <label style={{ cursor: 'pointer', position: 'relative' }}>
              {user?.photo_url ? (
                <img src={user.photo_url} alt="Foto"
                  style={{ width: 56, height: 56, borderRadius: '50%', objectFit: 'cover' }}
                  onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <div style={{
                  width: 56, height: 56, borderRadius: '50%',
                  background: 'linear-gradient(135deg, #CE93D8, #AB47BC)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 700, fontSize: 24
                }}>
                  {user?.name?.charAt(0)?.toUpperCase()}
                </div>
              )}
              <input type="file" accept="image/*" ref={photoRef}
                onChange={e => { if (e.target.files?.[0]) uploadPhoto(e.target.files[0]); }}
                style={{ display: 'none' }} />
              <div style={{ fontSize: 9, color: '#888', textAlign: 'center', marginTop: 2 }}>Alterar foto</div>
            </label>
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{user?.name}</div>
              <div style={{ fontSize: 12, color: '#888' }}>Cliente</div>
            </div>
          </div>

          <div style={{ marginBottom: 16 }}>
            <label className="label" style={{ fontWeight: 700 }}>Telefone</label>
            <div style={{ fontWeight: 600 }}>{user?.phone}</div>
          </div>

          <div style={{ marginBottom: 8, position: 'relative' }}>
            <label className="label" style={{ fontWeight: 700 }}>Endereço de entrega</label>
            <div className="flex-row" style={{ gap: 8, marginBottom: 8 }}>
              <input className="input" type="text" value={cep}
                onChange={e => { setCep(e.target.value.replace(/\D/g, '').slice(0, 8)); }}
                placeholder="CEP (ex: 01001000)" maxLength={8}
                style={{ width: 140, flexShrink: 0 }} />
              <button type="button" className="btn btn-sm btn-secondary"
                onClick={lookupCep} disabled={cepLoading || cep.replace(/\D/g, '').length !== 8}
                style={{ whiteSpace: 'nowrap' }}>
                {cepLoading ? '...' : 'Buscar CEP'}
              </button>
            </div>
            <input className="input" type="text" value={currentAddr}
              onChange={e => { setAddrForm(e.target.value); searchAddress(e.target.value); }}
              onFocus={() => { if (addressSuggestions.length > 0) setShowSuggestions(true); }}
              onBlur={() => setTimeout(() => setShowSuggestions(false), 200)}
              placeholder="Rua, número, bairro - Cidade" />
            {showSuggestions && addressSuggestions.length > 0 && (
              <div style={{
                position: 'absolute', top: '100%', left: 0, right: 0, zIndex: 10,
                background: 'white', border: '1px solid #DDD', borderRadius: 8, maxHeight: 200, overflow: 'auto',
                boxShadow: '0 4px 12px rgba(0,0,0,0.1)'
              }}>
                {addressSuggestions.map((s, i) => (
                  <div key={i} onMouseDown={() => selectAddress(s)}
                    style={{ padding: '10px 14px', cursor: 'pointer', fontSize: 13, borderBottom: '1px solid #F0F0F0' }}>
                    {s.display_name}
                  </div>
                ))}
              </div>
            )}
          </div>
          {addrMsg && <div style={{ fontSize: 13, fontWeight: 600, color: addrMsg.includes('Erro') || addrMsg.includes('não') ? '#C62828' : '#2E7D32', marginBottom: 8 }}>{addrMsg}</div>}
          <div style={{ display: 'flex', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={saveAddress} disabled={savingAddr}>
              {savingAddr ? 'Salvando...' : 'Salvar Endereço'}
            </button>
            {user?.address && (
              <button className="btn btn-sm" onClick={clearAddress} disabled={savingAddr}
                style={{ background: '#FFEBEE', color: '#C62828', border: '1px solid #EF9A9A' }}>
                Limpar Endereço
              </button>
            )}
          </div>
        </div>
      </>
    );
  }

  function renderMenu() {
    return (
      <>
        {store && !store.open && (
          <div className="card" style={{ background: '#FFF3E0', border: '1px solid #FF6F00', textAlign: 'center' }}>
            <span className="font-bold" style={{ color: '#FF6F00' }}>Entregas encerradas por hoje.</span>
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 12, flexWrap: 'wrap' }}>
          {store && (
            <>
              {store.logo ? (
                <img src={store.logo} alt={store.name}
                  style={{ width: 40, height: 40, borderRadius: 10, objectFit: 'cover', flexShrink: 0 }}
                  onError={e => { e.target.style.display = 'none'; }} />
              ) : (
                <div style={{
                  width: 40, height: 40, borderRadius: 10, flexShrink: 0,
                  background: `linear-gradient(135deg, ${store.color_primary || '#6A1B9A'}, ${store.color_secondary || '#4A148C'})`,
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  color: 'white', fontWeight: 800, fontSize: 20
                }}>
                  {store.name.charAt(0).toUpperCase()}
                </div>
              )}
              <span style={{ fontWeight: 700, fontSize: 15, color: 'var(--primary)' }}>{store.name}</span>
            </>
          )}
          <div className="flex-row">
            <button className={`btn btn-sm ${mainTab === 'menu' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => setMainTab('menu')}>Cardápio</button>
            <button className={`btn btn-sm ${mainTab === 'orders' ? 'btn-primary' : 'btn-outline'}`}
              onClick={() => { setMainTab('orders'); loadOrders(); }}>
              Meus Pedidos
            </button>
          </div>
        </div>

        {mainTab === 'menu' && renderCardapio()}
        {mainTab === 'orders' && renderPedidos()}

        {Object.keys(cart).length > 0 && mainTab === 'menu' && (
          <div style={{
            position: 'fixed', bottom: 0, left: 0, right: 0,
            background: 'white', padding: 16, boxShadow: '0 -4px 20px rgba(0,0,0,0.1)',
            display: 'flex', justifyContent: 'center'
          }}>
            <button className="btn btn-primary" style={{ maxWidth: 400 }}
              onClick={() => {
                const items = Object.entries(cart).map(([id, qty]) => {
                  const pr = products.find(pp => pp.id === id);
                  return { product_id: id, quantity: qty, name: pr?.name, price: pr?.price };
                });
                const total = items.reduce((s, i) => s + (i.price || 0) * i.quantity, 0);
                navigate('/customer/order', { state: { items, store, total } });
              }}>
              Ver Carrinho ({Object.values(cart).reduce((a, b) => a + b, 0)} itens)
            </button>
          </div>
        )}
      </>
    );
  }

  function renderCardapio() {
    return products.map(prod => (
      <div key={prod.id} className="card">
        <div className="flex-row" style={{ gap: 12, marginBottom: 8 }}>
          {prod.image ? (
            <img src={prod.image} alt={prod.name}
              style={{ width: 72, height: 72, borderRadius: 12, objectFit: 'cover', flexShrink: 0 }}
              onError={e => { e.target.style.display = 'none'; }} />
          ) : (
            <div style={{
              width: 72, height: 72, borderRadius: 12, flexShrink: 0,
              background: prod.size_ml >= 1000 ? 'linear-gradient(135deg, #4A148C, #7B1FA2)'
                : prod.name.includes('Farinha') ? 'linear-gradient(135deg, #FFF8E1, #FFE082)'
                : 'linear-gradient(135deg, #6A1B9A, #9C27B0)',
              display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 30
            }}>
              {}
            </div>
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 700, fontSize: 16 }}>{prod.name}</div>
            <div className="text-sm text-muted" style={{ marginTop: 2 }}>{prod.description}</div>
          </div>
          <span className="badge badge-primary" style={{ flexShrink: 0 }}>{prod.size_ml}ml</span>
        </div>
        <div className="flex-between" style={{ marginTop: 8 }}>
          <span style={{ fontSize: 22, fontWeight: 800, color: 'var(--primary)' }}>
            R$ {prod.price.toFixed(2)}
          </span>
          <div className="flex-row">
            {cart[prod.id] ? (
              <>
                <button className="btn btn-sm btn-outline" style={{ width: 36, height: 36, padding: 0 }}
                  onClick={() => removeFromCart(prod.id)}>-</button>
                <span style={{ fontWeight: 700, minWidth: 24, textAlign: 'center' }}>{cart[prod.id]}</span>
                <button className="btn btn-sm btn-primary" style={{ width: 36, height: 36, padding: 0 }}
                  onClick={() => addToCart(prod.id)}>+</button>
                <button className="btn btn-sm btn-secondary" onClick={() => goToOrder(prod.id)}>Pedir</button>
              </>
            ) : (
              <button className="btn btn-sm btn-primary" onClick={() => addToCart(prod.id)}>Adicionar</button>
            )}
          </div>
        </div>
        {prod.size_ml >= 1000 && cart[prod.id] > 0 && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, fontWeight: 600, color: '#888', marginBottom: 6 }}>Como quer receber?</div>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {Array.from({ length: cart[prod.id] + 1 }, (_, k) => {
                const litrosInteiros = cart[prod.id] - k;
                const meios = k * 2;
                if (litrosInteiros === 0 && meios === 0) return null;
                let label = '';
                if (litrosInteiros > 0 && meios > 0) label = `${litrosInteiros}L + ${meios} de meio`;
                else if (litrosInteiros > 0) label = `${litrosInteiros}L`;
                else label = `${meios} de meio`;
                const isActive = (splitItems[prod.id] || 0) === k;
                return (
                  <button key={k}
                    onClick={() => setSplitItems(s => ({ ...s, [prod.id]: k }))}
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
    ));
  }

  function renderPedidos() {
    if (orders.length === 0) {
      return (
        <div className="empty-state">
          <div className="empty-state-icon">
            <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
              <rect x="16" y="20" width="32" height="32" rx="4" stroke="var(--border)" strokeWidth="2"/>
              <path d="M24 30h16M24 36h10" stroke="var(--border)" strokeWidth="2" strokeLinecap="round"/>
            </svg>
          </div>
          <p>Nenhum pedido ainda</p>
        </div>
      );
    }

    return orders.map(order => (
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
    ));
  }
}
