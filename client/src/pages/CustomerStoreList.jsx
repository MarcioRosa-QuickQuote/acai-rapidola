import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';

export default function CustomerStoreList() {
  const { user, apiFetch, logout } = useAuth();
  const { socket } = useSocket();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [activeOrder, setActiveOrder] = useState(null);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
    const onFocus = () => loadData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  function loadData() {
    apiFetch('/stores').then(d => {
      if (d.data) setStores(d.data);
      setLoading(false);
    });
    apiFetch('/orders').then(d => {
      if (d.data) {
        const active = d.data.find(o => !['delivered','cancelled'].includes(o.status));
        setActiveOrder(active || null);
      }
    });
  }

  useEffect(() => {
    if (!socket) return;
    socket.on('order_status', (data) => {
      if (['delivered','cancelled'].includes(data.status)) setActiveOrder(null);
    });
    socket.on('payment_confirmed', (data) => {
      setActiveOrder(prev => prev ? { ...prev, payment_status: 'paid', status: 'confirmed' } : prev);
    });
    return () => {
      socket.off('order_status');
      socket.off('payment_confirmed');
    };
  }, [socket]);

  function selectStore(store) {
    navigate(`/customer/menu/${store.id}`);
  }

  const openStores = stores.filter(s => s.open);
  const closedStores = stores.filter(s => !s.open);

  let filteredOpen = openStores;
  let filteredClosed = closedStores;
  if (search.trim()) {
    const q = search.toLowerCase();
    filteredOpen = openStores.filter(s =>
      s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q)
    );
    filteredClosed = closedStores.filter(s =>
      s.name.toLowerCase().includes(q) || s.address.toLowerCase().includes(q)
    );
  }

  const displayStores = [...filteredOpen, ...filteredClosed];

  if (loading) return <div className="loading"><img className="spin" src="/saco_acai.png" /></div>;

  const shortAddr = user?.address ? user.address.split(' - ')[0] : null;

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 72 }}>
      {/* Header iFood-style */}
      <div style={{ background: 'var(--primary)', padding: '14px 16px 12px' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <div style={{ fontWeight: 800, fontSize: 18, color: 'white', lineHeight: 1.2 }}>
              Olá, {user?.name?.split(' ')[0]}
            </div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
              <svg width="13" height="13" viewBox="0 0 24 24" fill="rgba(255,255,255,0.8)">
                <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
              </svg>
              <span style={{ fontSize: 12, color: 'rgba(255,255,255,0.85)', fontWeight: 500 }}>
                {shortAddr || 'Adicione seu endereço'}
              </span>
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            {activeOrder && activeOrder.payment_status === 'paid' && !['delivered','cancelled'].includes(activeOrder.status) && (
              <button onClick={() => navigate(`/customer/tracking/${activeOrder.id}`)}
                style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 20, padding: '4px 6px', cursor: 'pointer', display: 'flex', alignItems: 'center' }}>
                <img src="/saco_acai.png" style={{ width: 40, height: 40, objectFit: 'contain' }} />
              </button>
            )}
            <button onClick={() => navigate('/customer/conta')}
              style={{ background: 'rgba(255,255,255,0.2)', border: 'none', borderRadius: 20, padding: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="white">
                <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
              </svg>
            </button>
          </div>
        </div>
      </div>

      <div className="container" style={{ paddingTop: 12 }}>
        <div style={{ marginBottom: 16 }}>
          <div style={{ position: 'relative', marginBottom: 12 }}>
            <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }}
              width="18" height="18" viewBox="0 0 24 24" fill="#999">
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
            <input className="input" type="text" value={search}
              onChange={e => setSearch(e.target.value)}
              placeholder="Buscar loja ou endereço..."
              style={{ paddingLeft: 42, fontSize: 15, borderRadius: 24, border: '2px solid #E8E0F0' }} />
          </div>


        </div>

        {displayStores.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <rect x="12" y="16" width="40" height="32" rx="4" stroke="var(--border)" strokeWidth="2"/>
                <path d="M22 28h20M22 34h12" stroke="var(--border)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <p>{search ? 'Nenhuma loja encontrada' : 'Nenhuma loja disponível'}</p>
          </div>
        )}

        {displayStores.map((store, i) => {
          const isOpen = !!store.open;
          const isFirstClosed = !isOpen && (i === 0 || displayStores[i - 1]?.open);

          return (
            <div key={store.id}>
              {isFirstClosed && (
                <div style={{ margin: '16px 0 12px', display: 'flex', alignItems: 'center', gap: 12 }}>
                  <div style={{ flex: 1, height: 1, background: '#E0E0E0' }} />
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#999', whiteSpace: 'nowrap' }}>
                    FECHADAS
                  </span>
                  <div style={{ flex: 1, height: 1, background: '#E0E0E0' }} />
                </div>
              )}

              <div className="card" onClick={() => isOpen && selectStore(store)}
                style={{
                  cursor: isOpen ? 'pointer' : 'default',
                  opacity: isOpen ? 1 : 0.65,
                  transition: 'transform 0.15s, box-shadow 0.15s'
                }}
                onMouseOver={e => {
                  if (isOpen) {
                    e.currentTarget.style.transform = 'translateY(-2px)';
                    e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)';
                  }
                }}
                onMouseOut={e => {
                  e.currentTarget.style.transform = '';
                  e.currentTarget.style.boxShadow = '';
                }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div style={{ flexShrink: 0, position: 'relative' }}>
                    {store.logo ? (
                      <img src={store.logo} alt={store.name}
                        style={{ width: 72, height: 72, borderRadius: 16, objectFit: 'cover' }}
                        onError={e => { e.target.style.display = 'none'; }} />
                    ) : (
                      <div style={{
                        width: 72, height: 72, borderRadius: 16,
                        background: `linear-gradient(135deg, ${store.color_primary || '#6A1B9A'}, ${store.color_secondary || '#4A148C'})`,
                        display: 'flex', alignItems: 'center', justifyContent: 'center',
                        color: 'white', fontWeight: 800, fontSize: 28
                      }}>
                        {store.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className={`badge ${isOpen ? 'badge-success' : 'badge-danger'}`}
                      style={{
                        position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)',
                        fontSize: 10, fontWeight: 700, padding: '2px 10px', whiteSpace: 'nowrap'
                      }}>
                      {isOpen ? 'ABERTA' : 'FECHADA'}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{store.name}</div>
                    <div style={{ fontSize: 13, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {store.address}
                    </div>
                    <div style={{ display: 'flex', gap: 8, marginTop: 6 }}>
                      {isOpen ? (
                        <span style={{ fontSize: 12, color: '#4CAF50', fontWeight: 600 }}>
                          Aceita pedidos
                        </span>
                      ) : (
                        <span style={{ fontSize: 12, color: '#C62828', fontWeight: 600 }}>
                          Fechada no momento
                        </span>
                      )}
                    </div>
                  </div>
                  {isOpen && (
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="#CCC" style={{ flexShrink: 0 }}>
                      <path d="M8.59 16.59L13.17 12 8.59 7.41 10 6l6 6-6 6z"/>
                    </svg>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {/* Bottom Navigation */}
      <div style={{
        position: 'fixed', bottom: 0, left: 0, right: 0, zIndex: 100,
        background: 'white', borderTop: '1px solid var(--border)',
        display: 'flex', height: 64,
        boxShadow: '0 -2px 12px rgba(0,0,0,0.08)'
      }}>
        {[
          { label: 'Início', path: '/customer', icon: (active) => (
            <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'var(--primary)' : '#999'}>
              <path d="M10 20v-6h4v6h5v-8h3L12 3 2 12h3v8z"/>
            </svg>
          )},
          { label: 'Busca', path: null, icon: (active) => (
            <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'var(--primary)' : '#999'}>
              <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
            </svg>
          )},
          { label: 'Pedidos', path: '/customer/conta', icon: (active) => (
            <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'var(--primary)' : '#999'}>
              <path d="M9 3H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 6H5V5h4v4zm10-6h-4c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2V5c0-1.1-.9-2-2-2zm0 6h-4V5h4v4zM9 13H5c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2v-4c0-1.1-.9-2-2-2zm0 6H5v-4h4v4zm10-6h-4c-1.1 0-2 .9-2 2v4c0 1.1.9 2 2 2h4c1.1 0 2-.9 2-2v-4c0-1.1-.9-2-2-2zm0 6h-4v-4h4v4z"/>
            </svg>
          )},
          { label: 'Favoritos', path: '/customer/conta', icon: (active) => (
            <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'var(--primary)' : '#999'}>
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
          )},
          { label: 'Perfil', path: '/customer/conta', icon: (active) => (
            <svg width="22" height="22" viewBox="0 0 24 24" fill={active ? 'var(--primary)' : '#999'}>
              <path d="M12 12c2.21 0 4-1.79 4-4s-1.79-4-4-4-4 1.79-4 4 1.79 4 4 4zm0 2c-2.67 0-8 1.34-8 4v2h16v-2c0-2.66-5.33-4-8-4z"/>
            </svg>
          )},
        ].map((item) => {
          const isActive = item.path === '/customer' && window.location.pathname === '/customer';
          return (
            <button key={item.label}
              onClick={() => {
                if (item.path === null) {
                  document.querySelector('input[type="text"]')?.focus();
                } else {
                  navigate(item.path);
                }
              }}
              style={{
                flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center',
                justifyContent: 'center', gap: 3, border: 'none', background: 'none',
                cursor: 'pointer', padding: '6px 0'
              }}>
              {item.icon(isActive)}
              <span style={{ fontSize: 10, fontWeight: isActive ? 700 : 500, color: isActive ? 'var(--primary)' : '#999' }}>
                {item.label}
              </span>
            </button>
          );
        })}
      </div>
    </div>
  );
}
