import CustomerHeader from '../components/CustomerHeader';
import CustomerBottomNav from '../components/CustomerBottomNav';

export default function CustomerFavoritos() {
  return (
    <div style={{ minHeight: '100vh', paddingBottom: 72 }}>
      <CustomerHeader title="Favoritos" />
      <div className="container" style={{ paddingTop: 16 }}>
        <div className="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="#DDD">
            <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z"/>
          </svg>
          <p>Nenhum favorito ainda</p>
          <p style={{ fontSize: 13, color: '#BBB', marginTop: 4 }}>Favorite lojas e produtos para acessar rapidamente</p>
        </div>
      </div>
      <CustomerBottomNav />
    </div>
  );
}
