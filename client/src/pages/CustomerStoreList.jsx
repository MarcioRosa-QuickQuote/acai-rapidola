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

  if (loading) return <div className="loading"><div className="spinner" /></div>;

  return (
    <div>
      <div className="header" style={{ padding: '6px 16px' }}>
        <div className="header-left" style={{ gap: 10 }}>
          <img src="/logomarca.png" alt="Pé de Açaí"
            style={{ width: 64, height: 64, borderRadius: 14, objectFit: 'contain', flexShrink: 0 }} />
          <div>
            <div className="header-title" style={{ fontSize: 18 }}>Pé de Açaí</div>
          </div>
        </div>
        <div className="header-right" style={{ gap: 6 }}>
          <div onClick={() => navigate('/customer/conta')}
            style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer' }}>
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
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)', lineHeight: 1.2 }}>{user?.name?.split(' ')[0]}</div>
              <div onClick={(e) => { e.stopPropagation(); logout(); }}
                style={{ fontSize: 10, color: 'var(--text-light)', cursor: 'pointer', lineHeight: 1 }}>
                Sair
              </div>
            </div>
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
    </div>
  );
}
