import CustomerHeader from '../components/CustomerHeader';
import CustomerBottomNav from '../components/CustomerBottomNav';

export default function CustomerNotificacoes() {
  return (
    <div style={{ minHeight: '100vh', paddingBottom: 72 }}>
      <CustomerHeader title="Notificações" />
      <div className="container" style={{ paddingTop: 16 }}>
        <div className="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="#DDD">
            <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
          </svg>
          <p>Nenhuma notificação</p>
          <p style={{ fontSize: 13, color: '#BBB', marginTop: 4 }}>Atualizações dos seus pedidos aparecem aqui</p>
        </div>
      </div>
      <CustomerBottomNav />
    </div>
  );
}
