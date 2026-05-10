const { Router } = require('express');
const { v4: uuid } = require('uuid');
const db = require('../database');
const { authMiddleware } = require('../auth');
const mercadopago = require('mercadopago');

const router = Router();

const MERCADO_PAGO_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;

if (MERCADO_PAGO_TOKEN) {
  mercadopago.configure({
    access_token: MERCADO_PAGO_TOKEN
  });
}

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

function buildAppUrl(path) {
  const base = process.env.APP_URL || `http://localhost:${process.env.PORT || 3001}`;
  return `${base}${path}`;
}

router.post('/create-preference', authMiddleware, (req, res) => {
  const { order_id } = req.body;
  if (!order_id) return res.status(400).json({ error: 'ID do pedido é obrigatório' });

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(order_id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.payment_status === 'paid') return res.status(400).json({ error: 'Pedido já foi pago' });

  if (!MERCADO_PAGO_TOKEN) {
    return res.status(500).json({ error: 'Gateway de pagamento não configurado' });
  }

  const paymentId = uuid();
  db.prepare('UPDATE orders SET payment_id = ? WHERE id = ?').run(paymentId, order_id);

  const preference = {
    items: [{
      id: order_id.slice(0, 8),
      title: `Pedido Açaí Rapidola #${order_id.slice(0, 8)}`,
      description: `Açaí delivery`,
      quantity: 1,
      unit_price: parseFloat(order.total.toFixed(2)),
      currency_id: 'BRL'
    }],
    external_reference: order_id,
    notification_url: buildAppUrl('/api/webhook'),
    back_urls: {
      success: buildAppUrl(`/customer/tracking/${order_id}`),
      failure: buildAppUrl(`/customer/payment/${order_id}`),
      pending: buildAppUrl(`/customer/payment/${order_id}`)
    },
    auto_return: 'approved',
    payment_methods: {
      installments: 1,
      default_payment_method_id: 'pix'
    }
  };

  mercadopago.preferences.create(preference)
    .then(response => {
      res.json({
        init_point: response.body.init_point,
        sandbox_init_point: response.body.sandbox_init_point,
        preference_id: response.body.id
      });
    })
    .catch(err => {
      console.error('[MP] Erro ao criar preferência:', err);
      res.status(500).json({ error: 'Erro ao criar pagamento' });
    });
});

router.post('/webhook', (req, res) => {
  const { type, data } = req.body;

  if (type === 'payment' && data?.id) {
    mercadopago.payment.findById(data.id)
      .then(paymentResp => {
        const payment = paymentResp.body;
        const orderId = payment.external_reference;
        const status = payment.status;

        if (status === 'approved') {
          const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);
          if (!order) return;

          db.prepare(
            "UPDATE orders SET payment_status = 'paid', status = 'confirmed', updated_at = CURRENT_TIMESTAMP WHERE id = ? AND payment_status != 'paid'"
          ).run(orderId);

          db.prepare(
            "UPDATE orders SET status = 'confirmed' WHERE id = ? AND status = 'pending'"
          ).run(orderId);

          const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(order.store_id);
          if (store) {
            notifyUser(store.owner_id, 'Pagamento Confirmado!', `Pedido #${orderId.slice(0,8)} pago via Mercado Pago.`, 'payment');
          }

          const io = getIO();
          if (io) {
            io.to(`order:${orderId}`).emit('payment_confirmed', { orderId });
            if (order.store_id) {
              io.to(`store:${order.store_id}`).emit('order_paid', { orderId, total: order.total });
            }
          }
        }

        console.log(`[MP] Webhook payment ${data.id}: status=${status}, order=${orderId}`);
      })
      .catch(err => console.error('[MP] Webhook error:', err));
  }

  res.sendStatus(200);
});

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
