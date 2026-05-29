let io = null;

function initSocket(httpServer) {
  const { Server } = require('socket.io');
  io = new Server(httpServer, {
    cors: { origin: '*', methods: ['GET', 'POST'] },
    pingTimeout: 60000,
    pingInterval: 25000
  });

  io.on('connection', (socket) => {
    console.log('[Socket] Conectado:', socket.id);

    socket.on('auth', async (data) => {
      try {
        const { verifyToken } = require('../auth');
        const user = verifyToken(data.token);
        socket.userId = user.id;
        socket.userRole = user.role;

        socket.join(`user:${user.id}`);

        if (user.role === 'motoboy') {
          socket.join('role:motoboy');
        }

        if (user.role === 'store') {
          try {
            const { supabase } = require('../database');
            const { data: store } = await supabase.from('stores').select('id').eq('owner_id', user.id).single();
            if (store) socket.join(`store:${store.id}`);
          } catch (e) {
            console.error('[Socket] Erro ao entrar sala da loja:', e.message);
          }
        }

        console.log(`[Socket] Usuário ${user.name} (${user.role}) autenticado`);
        socket.emit('auth_ok', { userId: user.id, role: user.role });
      } catch (e) {
        socket.emit('auth_error', { error: 'Token inválido' });
      }
    });

    socket.on('join_order', (orderId) => {
      socket.join(`order:${orderId}`);
      console.log(`[Socket] ${socket.id} entrou no pedido ${orderId}`);
    });

    socket.on('leave_order', (orderId) => {
      socket.leave(`order:${orderId}`);
    });

    socket.on('join_store', (storeId) => {
      socket.join(`store:${storeId}`);
    });

    socket.on('disconnect', () => {
      console.log('[Socket] Desconectado:', socket.id);
    });
  });

  return io;
}

function getIO() {
  return io;
}

module.exports = { initSocket, getIO };
