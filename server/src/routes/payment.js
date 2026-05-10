const { Router } = require('express');
const { v4: uuid } = require('uuid');
const db = require('../database');
const { authMiddleware } = require('../auth');

const router = Router();

function getIO() {
  const { getIO } = require('../services/socket');
  return getIO();
}

function notifyUser(userId, title, body, type = 'info') {
  const id = uuid();
  db.prepare(
    'INSERT INTO notifications (id, user_id, title, body, type) VALUES (?,?,?,?,?)'
  ).run(id, userId, title, body, type);

  const io = getIO();
  if (io) {
    const sockets = io.sockets.sockets;
    for (const [socketId, socket] of sockets) {
      if (socket.userId === userId) {
        socket.emit('notification', { id, title, body, type });
      }
    }
  }
}

router.post('/pix/qrcode', authMiddleware, (req, res) => {
  const { order_id } = req.body;
  if (!order_id) return res.status(400).json({ error: 'ID do pedido é obrigatório' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.payment_status === 'paid') return res.status(400).json({ error: 'Pedido já foi pago' });

  const pixId = uuid();
  const pixCode = `00020126580014BR.GOV.BCB.PIX0136${pixId.replace(/-/g, '')}520400005303986540${order.total.toFixed(2)}5802BR5913Acai Rapidola6009Sao Paulo62070503***6304AB12`;

  db.prepare('UPDATE orders SET payment_id = ? WHERE id = ?').run(pixId, order_id);

  res.json({
    pix_id: pixId,
    pix_code: pixCode,
    total: order.total,
    expires_in: 300
  });
});

router.post('/pix/confirm', authMiddleware, (req, res) => {
  const { order_id, pix_id } = req.body;
  if (!order_id) return res.status(400).json({ error: 'ID do pedido é obrigatório' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  db.prepare(
    "UPDATE orders SET payment_status = 'paid', status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ?"
  ).run(order_id);

  db.prepare(
    "UPDATE orders SET status = 'confirmed' WHERE id = ? AND status = 'pending'"
  ).run(order_id);

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.store_id);
  if (store) {
    notifyUser(store.owner_id, 'Pagamento Confirmado!', `Pedido #${order_id.slice(0,8)} pago. Prepare o açaí!`, 'payment');
  }

  const io = getIO();
  if (io) {
    io.to(`order:${order_id}`).emit('payment_confirmed', { orderId: order_id });
    io.to(`store:${order.store_id}`).emit('order_paid', { orderId: order_id, total: order.total });
  }

  res.json({ success: true, status: 'paid' });
});

router.get('/notifications', authMiddleware, (req, res) => {
  const notifs = db.prepare(
    'SELECT * FROM notifications WHERE user_id = ? ORDER BY created_at DESC LIMIT 50'
  ).all(req.user.id);
  res.json(notifs);
});

router.patch('/notifications/:id/read', authMiddleware, (req, res) => {
  db.prepare('UPDATE notifications SET read = 1 WHERE id = ? AND user_id = ?')
    .run(req.params.id, req.user.id);
  res.json({ success: true });
});

module.exports = router;
