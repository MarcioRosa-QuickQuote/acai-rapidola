import { createContext, useContext, useEffect, useRef, useState } from 'react';
import { io } from 'socket.io-client';
import { useAuth } from './AuthContext';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { token, user } = useAuth();
  const socketRef = useRef(null);
  const [notifications, setNotifications] = useState([]);
  const [toast, setToast] = useState(null);

  useEffect(() => {
    if (!token) return;

    const socket = io('/', { transports: ['websocket', 'polling'] });
    socketRef.current = socket;

    socket.on('connect', () => {
      socket.emit('auth', { token });
    });

    socket.on('notification', (notif) => {
      setNotifications(prev => [notif, ...prev]);
      setToast(notif.body);
      setTimeout(() => setToast(null), 4000);
    });

    socket.on('new_order', (data) => {
      setToast(`Novo pedido de ${data.customer}!`);
      setTimeout(() => setToast(null), 4000);
    });

    return () => {
      socket.disconnect();
      socketRef.current = null;
    };
  }, [token]);

  function joinOrder(orderId) {
    socketRef.current?.emit('join_order', orderId);
  }

  function leaveOrder(orderId) {
    socketRef.current?.emit('leave_order', orderId);
  }

  function joinStore(storeId) {
    socketRef.current?.emit('join_store', storeId);
  }

  return (
    <SocketContext.Provider value={{
      socket: socketRef.current,
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
