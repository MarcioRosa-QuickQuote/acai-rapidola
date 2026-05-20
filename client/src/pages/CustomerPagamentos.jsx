import CustomerHeader from '../components/CustomerHeader';
import CustomerBottomNav from '../components/CustomerBottomNav';

export default function CustomerPagamentos() {
  return (
    <div style={{ minHeight: '100vh', paddingBottom: 72 }}>
      <CustomerHeader title="Pagamentos" />
      <div className="container" style={{ paddingTop: 16 }}>
        <div className="empty-state">
          <svg width="64" height="64" viewBox="0 0 24 24" fill="#DDD">
            <path d="M20 4H4c-1.11 0-2 .89-2 2v12c0 1.11.89 2 2 2h16c1.11 0 2-.89 2-2V6c0-1.11-.89-2-2-2zm0 14H4v-6h16v6zm0-10H4V6h16v2z"/>
          </svg>
          <p>Nenhum pagamento registrado</p>
          <p style={{ fontSize: 13, color: '#BBB', marginTop: 4 }}>Seu histórico de pagamentos aparecerá aqui</p>
        </div>
      </div>
      <CustomerBottomNav />
    </div>
  );
}
