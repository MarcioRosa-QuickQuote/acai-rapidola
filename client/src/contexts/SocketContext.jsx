import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token } = useAuth();
  const [socket, setSocket] = useState(null);
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null);
  const disconnectedRef = useRef(false);
  const disconnectTimerRef = useRef(null);

  useEffect(() => {
    if (!token) return;

    const s = io('/', { transports: ['websocket', 'polling'] });
    setSocket(s);

    s.on('connect', () => {
      s.emit('auth', { token });
      clearTimeout(disconnectTimerRef.current);
      if (disconnectedRef.current) {
        disconnectedRef.current = false;
        setToast('Conexão restaurada ✓');
        setTimeout(() => setToast(null), 3000);
      }
    });

    s.on('disconnect', () => {
      disconnectedRef.current = true;
      disconnectTimerRef.current = setTimeout(() => {
        if (disconnectedRef.current) {
          setToast('Sem conexão — reconectando…');
          setTimeout(() => setToast(null), 5000);
        }
      }, 15000);
    });

    s.on('notification', (notif) => {
      setNotifications(prev => [notif, ...prev]);
      setToast(notif.body);
      setTimeout(() => setToast(null), 4000);
    });

    s.on('new_order', (data) => {
      setToast(`Novo pedido de ${data.customer}!`);
      setTimeout(() => setToast(null), 4000);
    });

    return () => {
      s.disconnect();
      setSocket(null);
    };
  }, [token]);

  function joinOrder(orderId) {
    socket?.emit('join_order', orderId);
  }

  function leaveOrder(orderId) {
    socket?.emit('leave_order', orderId);
  }

  function joinStore(storeId) {
    socket?.emit('join_store', storeId);
  }

  return (
    <SocketContext.Provider value={{
      socket,
      notifications,
      toast,
      setToast,
      joinOrder,
      leaveOrder,
      joinStore
    }}>
      {children}
      {toast && <div className="toast">{toast}</div>}
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}
