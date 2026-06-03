import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import { useSocket } from '../contexts/SocketContext';
import CustomerTopBar from '../components/CustomerTopBar';
import CustomerBottomNav from '../components/CustomerBottomNav';

export default function CustomerStoreList() {
  const { apiFetch } = useAuth();
  const { socket } = useSocket();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    loadData();
    const onFocus = () => loadData();
    window.addEventListener('focus', onFocus);
    return () => window.removeEventListener('focus', onFocus);
  }, []);

  function loadData() {
    apiFetch('/stores').then(d => {
      if (d.data) {
        setStores(d.data);
        d.data.forEach(store => {
          if (!window.__productsCache) window.__productsCache = {};
          if (!window.__productsCache[store.id]) {
            apiFetch(`/products?store_id=${store.id}`).then(p => {
              if (p.data) window.__productsCache[store.id] = p.data;
            });
          }
        });
      }
      setLoading(false);
    });
  }

  useEffect(() => {
    if (!socket) return;
    return () => {};
  }, [socket]);

  const openStores = stores.filter(s => s.open);
  const closedStores = stores.filter(s => !s.open);
  const displayStores = [...openStores, ...closedStores];

  if (loading) return <div className="loading"><img className="spin" src="/saco_acai.png" /></div>;

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 72 }}>
      <CustomerTopBar />

      <div className="container" style={{ paddingTop: 12 }}>
        {displayStores.length === 0 && (
          <div className="empty-state">
            <div className="empty-state-icon">
              <svg width="64" height="64" viewBox="0 0 64 64" fill="none">
                <rect x="12" y="16" width="40" height="32" rx="4" stroke="var(--border)" strokeWidth="2"/>
                <path d="M22 28h20M22 34h12" stroke="var(--border)" strokeWidth="2" strokeLinecap="round"/>
              </svg>
            </div>
            <p>Nenhuma loja disponível</p>
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
                  <span style={{ fontSize: 12, fontWeight: 700, color: '#999', whiteSpace: 'nowrap' }}>FECHADAS</span>
                  <div style={{ flex: 1, height: 1, background: '#E0E0E0' }} />
                </div>
              )}

              <div className="card" onClick={() => isOpen && navigate(`/customer/menu/${store.id}`)}
                style={{ cursor: isOpen ? 'pointer' : 'default', opacity: isOpen ? 1 : 0.65, transition: 'transform 0.15s, box-shadow 0.15s' }}
                onMouseOver={e => { if (isOpen) { e.currentTarget.style.transform = 'translateY(-2px)'; e.currentTarget.style.boxShadow = '0 6px 20px rgba(0,0,0,0.1)'; } }}
                onMouseOut={e => { e.currentTarget.style.transform = ''; e.currentTarget.style.boxShadow = ''; }}>
                <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                  <div style={{ flexShrink: 0, position: 'relative' }}>
                    {store.logo ? (
                      <img src={store.logo} alt={store.name} style={{ width: 72, height: 72, borderRadius: 16, objectFit: 'cover' }} onError={e => { e.target.style.display = 'none'; }} />
                    ) : (
                      <div style={{ width: 72, height: 72, borderRadius: 16, background: `linear-gradient(135deg, ${store.color_primary || '#6A1B9A'}, ${store.color_secondary || '#4A148C'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 28 }}>
                        {store.name.charAt(0).toUpperCase()}
                      </div>
                    )}
                    <span className={`badge ${isOpen ? 'badge-success' : 'badge-danger'}`} style={{ position: 'absolute', bottom: -6, left: '50%', transform: 'translateX(-50%)', fontSize: 10, fontWeight: 700, padding: '2px 10px', whiteSpace: 'nowrap' }}>
                      {isOpen ? 'ABERTA' : 'FECHADA'}
                    </span>
                  </div>
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div style={{ fontWeight: 700, fontSize: 16, marginBottom: 4 }}>{store.name}</div>
                    <div style={{ fontSize: 13, color: '#888', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{store.address}</div>
                    <div style={{ marginTop: 6 }}>
                      <span style={{ fontSize: 12, color: isOpen ? '#4CAF50' : '#C62828', fontWeight: 600 }}>
                        {isOpen ? 'Aceita pedidos' : 'Fechada no momento'}
                      </span>
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

      <CustomerBottomNav />
    </div>
  );
}
