import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CustomerTopBar from '../components/CustomerTopBar';
import CustomerBottomNav from '../components/CustomerBottomNav';

export default function CustomerBusca() {
  const { apiFetch } = useAuth();
  const navigate = useNavigate();
  const [stores, setStores] = useState([]);
  const [search, setSearch] = useState('');
  const inputRef = useRef(null);

  useEffect(() => {
    apiFetch('/stores').then(d => {
      if (d.data) setStores(d.data);
    });
    setTimeout(() => inputRef.current?.focus(), 100);
  }, []);

  const q = search.toLowerCase().trim();
  const filtered = q
    ? stores.filter(s => s.name.toLowerCase().includes(q) || (s.address || '').toLowerCase().includes(q))
    : [];

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 72 }}>
      <CustomerTopBar />
      <div className="container" style={{ paddingTop: 12 }}>
        <div style={{ position: 'relative', marginBottom: 16 }}>
          <svg style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', zIndex: 1 }} width="18" height="18" viewBox="0 0 24 24" fill="#999">
            <path d="M15.5 14h-.79l-.28-.27A6.471 6.471 0 0016 9.5 6.5 6.5 0 109.5 16c1.61 0 3.09-.59 4.23-1.57l.27.28v.79l5 4.99L20.49 19l-4.99-5zm-6 0C7.01 14 5 11.99 5 9.5S7.01 5 9.5 5 14 7.01 14 9.5 11.99 14 9.5 14z"/>
          </svg>
          <input ref={inputRef} className="input" type="text" value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar loja ou endereço..."
            style={{ paddingLeft: 42, fontSize: 15, borderRadius: 24, border: '2px solid #E8E0F0' }} />
        </div>

        {q && filtered.length === 0 && (
          <div className="empty-state"><p>Nenhuma loja encontrada</p></div>
        )}

        {filtered.map(store => {
          const isOpen = !!store.open;
          return (
            <div key={store.id} className="card" onClick={() => isOpen && navigate(`/customer/menu/${store.id}`)}
              style={{ cursor: isOpen ? 'pointer' : 'default', opacity: isOpen ? 1 : 0.65 }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ flexShrink: 0 }}>
                  {store.logo ? (
                    <img src={store.logo} alt={store.name} style={{ width: 56, height: 56, borderRadius: 12, objectFit: 'cover' }} />
                  ) : (
                    <div style={{ width: 56, height: 56, borderRadius: 12, background: `linear-gradient(135deg, ${store.color_primary || '#6A1B9A'}, ${store.color_secondary || '#4A148C'})`, display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 22 }}>
                      {store.name.charAt(0).toUpperCase()}
                    </div>
                  )}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{store.name}</div>
                  <div style={{ fontSize: 12, color: '#888', marginTop: 2 }}>{store.address}</div>
                </div>
                <span className={`badge ${isOpen ? 'badge-success' : 'badge-danger'}`} style={{ fontSize: 10, fontWeight: 700 }}>
                  {isOpen ? 'ABERTA' : 'FECHADA'}
                </span>
              </div>
            </div>
          );
        })}
      </div>
      <CustomerBottomNav />
    </div>
  );
}
