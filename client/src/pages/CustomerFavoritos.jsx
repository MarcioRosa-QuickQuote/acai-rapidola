import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CustomerHeader from '../components/CustomerHeader';
import CustomerBottomNav from '../components/CustomerBottomNav';

export default function CustomerFavoritos() {
  const { apiFetch } = useAuth();
  const navigate = useNavigate();
  const [stores, setStores] = useState([]);
  const [loading, setLoading] = useState(true);
  const [favs, setFavs] = useState(() => {
    try { return JSON.parse(localStorage.getItem('fav_stores') || '[]'); }
    catch { return []; }
  });

  useEffect(() => {
    if (favs.length === 0) { setLoading(false); return; }
    Promise.all(favs.map(id =>
      apiFetch('/stores/' + id).then(d => d && d.ok ? d : null).catch(() => null)
    )).then(results => {
      setStores(results.filter(Boolean));
      setLoading(false);
    }).catch(() => setLoading(false));
  }, [favs]);

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 72 }}>
      <CustomerHeader title="Favoritos" />
      <div className="container" style={{ paddingTop: 16 }}>
        {loading ? (
          <div style={{ textAlign: 'center', padding: 40, color: '#999' }}>Carregando...</div>
        ) : stores.length === 0 ? (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="#DDD">
              <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
            </svg>
            <p>Nenhum favorito ainda</p>
            <p style={{ fontSize: 13, color: '#BBB', marginTop: 4 }}>Favorite lojas para acessar rapidamente</p>
          </div>
        ) : (
          stores.map(store => (
            <div key={store.id} className="card" onClick={() => navigate('/customer/menu/' + store.id)} style={{ cursor: 'pointer' }}>
              <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
                <div style={{ width: 56, height: 56, borderRadius: 12, background: 'linear-gradient(135deg, #6A1B9A, #4A148C)', display: 'flex', alignItems: 'center', justifyContent: 'center', color: 'white', fontWeight: 800, fontSize: 24, flexShrink: 0 }}>
                  {(store.name || '?').charAt(0).toUpperCase()}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ fontWeight: 700, fontSize: 15 }}>{store.name}</div>
                  <div style={{ fontSize: 13, color: '#888', marginTop: 2 }}>{store.address}</div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
      <CustomerBottomNav />
    </div>
  );
}
