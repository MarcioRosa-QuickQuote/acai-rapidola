import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import CustomerHeader from '../components/CustomerHeader';
import CustomerBottomNav from '../components/CustomerBottomNav';
import { useSocket } from '../contexts/SocketContext';



function notifIcon(body) {
  const b = (body || '').toLowerCase();
  if (b.includes('entregue')) return '✅';
  if (b.includes('caminho') || b.includes('saiu')) return '🛵';
  if (b.includes('metro') || b.includes('distância') || b.includes('próxim')) return '📍';
  if (b.includes('preparando') || b.includes('preparação')) return '⏳';
  if (b.includes('pagamento') && (b.includes('pendente') || b.includes('aguardando'))) return '💳';
  if (b.includes('pagamento') && (b.includes('confirmado') || b.includes('aprovado'))) return '💰';
  if (b.includes('fechou') || b.includes('encerrou')) return '🏪';
  if (b.includes('avalie') || b.includes('avaliação')) return '⭐';
  return '🔔';
}

export default function CustomerNotificacoes() {
  const navigate = useNavigate();
  const { notifications, joinOrder } = useSocket();

  useEffect(() => {
    const activeOrderId = new URLSearchParams(window.location.search).get('order');
    if (activeOrderId) joinOrder(activeOrderId);
  }, [joinOrder]);

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 72 }}>
      <CustomerHeader title="Notificações" />
      <div className="container" style={{ paddingTop: 16 }}>
        {notifications.length > 0 ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            {notifications.map((n, i) => (
              <div key={i} className="card" style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '14px 18px' }}>
                <span style={{ fontSize: 24 }}>{notifIcon(n.body)}</span>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 600, fontSize: 15 }}>{n.title || 'Notificação'}</div>
                  <div style={{ fontSize: 13, color: 'var(--text-light)' }}>{n.body}</div>
                  {n.time && <div style={{ fontSize: 11, color: '#BBB', marginTop: 4 }}>{n.time}</div>}
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <svg width="64" height="64" viewBox="0 0 24 24" fill="#DDD">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>
            <p style={{ fontWeight: 700, fontSize: 17, marginBottom: 4 }}>Nenhuma notificação</p>
            <p style={{ fontSize: 13, color: '#BBB', marginTop: 4 }}>Atualizações dos seus pedidos aparecem aqui</p>
          </div>
        )}
      </div>
      <CustomerBottomNav />
    </div>
  );
}
