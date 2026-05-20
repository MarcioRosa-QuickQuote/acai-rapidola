import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../contexts/AuthContext';

export default function CustomerTopBar() {
  const { user, apiFetch } = useAuth();
  const navigate = useNavigate();
  const [activeOrder, setActiveOrder] = useState(null);
  const shortAddr = user?.address ? user.address.split(' - ')[0] : null;

  useEffect(() => {
    apiFetch('/orders').then(d => {
      if (d.data) {
        const active = d.data.find(o => !['delivered', 'cancelled'].includes(o.status));
        setActiveOrder(active || null);
      }
    });
  }, []);

  return (
    <div style={{ background: 'var(--bg)', padding: '14px 16px 12px', flexShrink: 0 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontWeight: 800, fontSize: 18, color: 'var(--primary-dark)', lineHeight: 1.2 }}>
            Olá, {user?.name?.split(' ')[0]}
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
            <svg width="13" height="13" viewBox="0 0 24 24" fill="var(--primary)">
              <path d="M12 2C8.13 2 5 5.13 5 9c0 5.25 7 13 7 13s7-7.75 7-13c0-3.87-3.13-7-7-7zm0 9.5c-1.38 0-2.5-1.12-2.5-2.5s1.12-2.5 2.5-2.5 2.5 1.12 2.5 2.5-1.12 2.5-2.5 2.5z"/>
            </svg>
            <span style={{ fontSize: 12, color: 'var(--text-light)', fontWeight: 500 }}>
              {shortAddr || 'Adicione seu endereço'}
            </span>
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          {activeOrder && activeOrder.payment_status === 'paid' && !['delivered', 'cancelled'].includes(activeOrder.status) && (
            <img src="/saco_acai.png"
              onClick={() => navigate(`/customer/tracking/${activeOrder.id}`)}
              style={{ width: 40, height: 40, objectFit: 'contain', cursor: 'pointer' }} />
          )}
          <button onClick={() => navigate('/customer/notificacoes')}
            style={{ background: 'rgba(106,27,154,0.08)', border: 'none', borderRadius: 20, padding: 8, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <svg width="22" height="22" viewBox="0 0 24 24" fill="var(--primary)">
              <path d="M12 22c1.1 0 2-.9 2-2h-4c0 1.1.9 2 2 2zm6-6v-5c0-3.07-1.64-5.64-4.5-6.32V4c0-.83-.67-1.5-1.5-1.5s-1.5.67-1.5 1.5v.68C7.63 5.36 6 7.92 6 11v5l-2 2v1h16v-1l-2-2z"/>
            </svg>
          </button>
        </div>
      </div>
    </div>
  );
}
