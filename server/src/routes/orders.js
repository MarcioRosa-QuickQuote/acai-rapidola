const { Router } = require('express');
const { v4: uuid } = require('uuid');
const db = require('../database');
const { authMiddleware, roleMiddleware } = require('../auth');

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

router.post('/', authMiddleware, roleMiddleware('customer'), (req, res) => {
  const { store_id, items, address, lat, lng, notes } = req.body;
  if (!store_id || !items || !items.length || !address) {
    return res.status(400).json({ error: 'Loja, itens e endereço são obrigatórios' });
  }

  const store = db.prepare('SELECT * FROM stores WHERE id = ?').get(store_id);
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  if (!store.open) return res.status(400).json({ error: 'Loja fechada no momento' });

  let total = 0;
  const orderItems = [];

  for (const item of items) {
    const product = db.prepare('SELECT * FROM products WHERE id = ? AND store_id = ? AND active = 1')
      .get(item.product_id, store_id);
    if (!product) {
      return res.status(400).json({ error: `Produto ${item.product_id} não encontrado` });
    }
    const qty = Math.max(1, item.quantity || 1);
    total += product.price * qty;
    orderItems.push({ product, quantity: qty });
  }

  const orderId = uuid();

  const insertOrder = db.prepare(`
    INSERT INTO orders (id, customer_id, store_id, total, customer_address, customer_lat, customer_lng, notes)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertOrder.run(orderId, req.user.id, store_id, total, address, lat || -23.55, lng || -46.63, notes || '');

  const insertItem = db.prepare(
    'INSERT INTO order_items (id, order_id, product_id, quantity, unit_price) VALUES (?, ?, ?, ?, ?)'
  );

  for (const { product, quantity } of orderItems) {
    insertItem.run(uuid(), orderId, product.id, quantity, product.price);
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(orderId);

  if (address) {
    db.prepare('UPDATE users SET address = ?, lat = ?, lng = ? WHERE id = ?')
      .run(address, lat || null, lng || null, req.user.id);
  }

  const io = getIO();
  if (io) {
    io.to(`store:${store_id}`).emit('new_order', { orderId, total, customer: req.user.name, address });
  }

  notifyUser(store.owner_id, 'Novo Pedido!', `${req.user.name} fez um pedido de R$ ${total.toFixed(2)}`, 'order');

  res.json({ order, items: orderItems });
});

router.get('/', authMiddleware, (req, res) => {
  let orders;
  if (req.user.role === 'customer') {
    orders = db.prepare(`
      SELECT o.*, s.name as store_name
      FROM orders o JOIN stores s ON o.store_id = s.id
      WHERE o.customer_id = ? ORDER BY o.created_at DESC
    `).all(req.user.id);
  } else if (req.user.role === 'store') {
    const store = db.prepare('SELECT id FROM stores WHERE owner_id = ?').get(req.user.id);
    if (!store) return res.json([]);
    orders = db.prepare(`
      SELECT o.*, u.name as customer_name, mu.name as motoboy_name
      FROM orders o
      JOIN users u ON o.customer_id = u.id
      LEFT JOIN users mu ON o.motoboy_id = mu.id
      WHERE o.store_id = ? ORDER BY o.created_at DESC
    `).all(store.id);
  } else if (req.user.role === 'motoboy') {
    orders = db.prepare(`
      SELECT o.*, s.name as store_name, u.name as customer_name, s.address as store_address
      FROM orders o
      JOIN stores s ON o.store_id = s.id
      JOIN users u ON o.customer_id = u.id
      WHERE (o.motoboy_id = ? OR (o.motoboy_id IS NULL AND o.payment_status = 'paid' AND o.status IN ('confirmed','preparing','ready')))
      ORDER BY o.created_at DESC
    `).all(req.user.id);
  }

  res.json(orders || []);
});

router.get('/:id', authMiddleware, (req, res) => {
  const order = db.prepare(`
    SELECT o.*, s.name as store_name, s.address as store_address,
           u.name as customer_name, u.phone as customer_phone,
           mu.name as motoboy_name
    FROM orders o
    JOIN stores s ON o.store_id = s.id
    JOIN users u ON o.customer_id = u.id
    LEFT JOIN users mu ON o.motoboy_id = mu.id
    WHERE o.id = ?
  `).get(req.params.id);

  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  const items = db.prepare(`
    SELECT oi.*, p.name as product_name, p.size_ml
    FROM order_items oi JOIN products p ON oi.product_id = p.id
    WHERE oi.order_id = ?
  `).all(req.params.id);

  res.json({ ...order, items });
});

router.patch('/:id/status', authMiddleware, (req, res) => {
  const { status } = req.body;
  const validStatuses = ['confirmed', 'preparing', 'ready', 'picked_up', 'in_transit', 'arriving', 'delivered', 'cancelled'];

  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  const order = db.prepare('SELECT * FROM orders WHERE id = ?').get(req.params.id);
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  if (req.user.role === 'store') {
    const store = db.prepare('SELECT * FROM stores WHERE owner_id = ?').get(req.user.id);
    if (!store || order.store_id !== store.id) {
      return res.status(403).json({ error: 'Não autorizado' });
    }
  } else if (req.user.role === 'motoboy') {
    if (order.motoboy_id !== req.user.id) {
      return res.status(403).json({ error: 'Não autorizado' });
    }
  }

  const io = getIO();

  if (status === 'arriving' || status === 'picked_up') {
    if (status === 'arriving') {
      notifyUser(order.customer_id, 'Motoboy chegando!', 'Seu açaí está quase aí! Abra o portão!', 'delivery');
    }
    if (status === 'picked_up') {
      const store = db.prepare('SELECT owner_id FROM stores WHERE id = ?').get(order.store_id);
      if (store) notifyUser(store.owner_id, 'Pedido retirado!', 'Motoboy retirou o pedido para entrega', 'delivery');
    }
  }

  db.prepare('UPDATE orders SET status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
    .run(status, req.params.id);

  if (status === 'ready') {
    const employeeMotoboys = db.prepare(`
      SELECT sm.motoboy_id FROM store_motoboys sm
      JOIN motoboy_locations ml ON sm.motoboy_id = ml.motoboy_id
      WHERE sm.store_id = ? AND sm.employee = 1 AND ml.online = 1
      ORDER BY ml.updated_at DESC
    `).all(order.store_id);

    if (employeeMotoboys.length > 0) {
      const motoboyId = employeeMotoboys[0].motoboy_id;
      db.prepare('UPDATE orders SET motoboy_id = ?, status = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?')
        .run(motoboyId, 'assigned', req.params.id);
      notifyUser(motoboyId, 'Nova entrega!', 'Pedido atribuído automaticamente para você', 'delivery');
    }
  }

  if (io) {
    io.to(`order:${req.params.id}`).emit('order_status', { orderId: req.params.id, status });
    if (order.motoboy_id) {
      io.to(`user:${order.motoboy_id}`).emit('order_updated', { orderId: req.params.id, status });
    }
  }

  res.json({ success: true, status });
});

module.exports = router;
