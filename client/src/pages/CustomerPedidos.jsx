import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';
import CustomerHeader from '../components/CustomerHeader';
import CustomerBottomNav from '../components/CustomerBottomNav';

const statusLabels = { pending:'Aguardando', confirmed:'Confirmado', preparing:'Preparando', ready:'Pronto', assigned:'Saiu para entrega', picked_up:'A caminho', arriving:'Chegando', delivered:'Entregue', cancelled:'Cancelado' };
const statusColors = { pending:'badge-warning', confirmed:'badge-primary', preparing:'badge-primary', ready:'badge-success', assigned:'badge-info', picked_up:'badge-info', arriving:'badge-accent', delivered:'badge-success', cancelled:'badge-danger' };

export default function CustomerPedidos() {
  const { apiFetch } = useAuth();
  const navigate = useNavigate();
  const [orders, setOrders] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    apiFetch('/orders').then(d => {
      if (d.data) setOrders(d.data);
      setLoading(false);
    });
  }, []);

  return (
    <div style={{ minHeight: '100vh', paddingBottom: 72 }}>
      <CustomerHeader title="Meus Pedidos" />
      <div className="container" style={{ paddingTop: 16 }}>
        {loading && <div className="loading"><img className="spin" src="/saco_acai.png" /></div>}

        {!loading && orders.length === 0 && (
          <div className="empty-state">
            <img src="/saco_acai.png" style={{ width: 72, opacity: 0.3, marginBottom: 12 }} />
            <p>Nenhum pedido ainda</p>
            <button className="btn btn-primary" onClick={() => navigate('/customer')} style={{ marginTop: 12 }}>
              Ver lojas
            </button>
          </div>
        )}

        {orders.filter(order => {
          if (order.payment_status !== 'pending') return true;
          return Date.now() - new Date(order.created_at).getTime() < 24 * 60 * 60 * 1000;
        }).map(order => {
          const canTrack = !['cancelled'].includes(order.status) && order.payment_status === 'paid';
          return (
            <div key={order.id} className="card" onClick={() => canTrack && navigate(`/customer/tracking/${order.id}`)}
              style={{ cursor: canTrack ? 'pointer' : 'default' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 6 }}>
                <span style={{ fontWeight: 700, fontSize: 15 }}>{order.store_name}</span>
                <span className={`badge ${statusColors[order.status] || 'badge-warning'}`} style={{ fontSize: 11 }}>
                  {statusLabels[order.status] || order.status}
                </span>
              </div>
              <div style={{ fontSize: 13, color: '#888', marginBottom: 4 }}>
                R$ {order.total?.toFixed(2)} • {new Date(order.created_at).toLocaleDateString('pt-BR', { day: '2-digit', month: '2-digit', year: '2-digit' })}
              </div>
              {canTrack && (
                <div style={{ fontSize: 12, color: 'var(--primary)', fontWeight: 600, marginTop: 4 }}>
                  Toque para acompanhar →
                </div>
              )}
            </div>
          );
        })}
      </div>
      <CustomerBottomNav />
    </div>
  );
}
