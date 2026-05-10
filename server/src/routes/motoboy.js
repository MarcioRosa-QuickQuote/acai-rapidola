const { Router } = require('express');
const db = require('../database');
const { authMiddleware, roleMiddleware } = require('../auth');

const router = Router();

router.get('/available', authMiddleware, roleMiddleware('motoboy'), (req, res) => {
  const orders = db.prepare(`
    SELECT o.*, s.name as store_name, s.address as store_address, s.lat as store_lat, s.lng as store_lng,
           u.name as customer_name
    FROM orders o
    JOIN stores s ON o.store_id = s.id
    JOIN users u ON o.customer_id = u.id
    WHERE o.payment_status = 'paid'
      AND o.status IN ('confirmed','preparing','ready')
      AND (o.motoboy_id IS NULL OR o.motoboy_id = ?)
    ORDER BY o.created_at ASC
  `).all(req.user.id);

  res.json(orders);
});

router.post('/accept/:orderId', authMiddleware, roleMiddleware('motoboy'), (req, res) => {
  const order = db.prepare(
    'SELECT * FROM orders WHERE id = ? AND payment_status = ?'
  ).get(req.params.orderId, 'paid');

  if (!order) return res.status(404).json({ error: 'Pedido não encontrado ou não pago' });
  if (order.motoboy_id && order.motoboy_id !== req.user.id) {
    return res.status(409).json({ error: 'Pedido já atribuído a outro motoboy' });
  }

  db.prepare(
    'UPDATE orders SET motoboy_id = ?, status = COALESCE(NULLIF(?,?), status), updated_at = CURRENT_TIMESTAMP WHERE id = ?'
  ).run(req.user.id, 'assigned' !== order.status ? 'assigned' : null, order.status, req.params.orderId);

  res.json({ success: true });
});

router.post('/location', authMiddleware, roleMiddleware('motoboy'), (req, res) => {
  const { lat, lng, online } = req.body;
  if (lat == null || lng == null) {
    return res.status(400).json({ error: 'Latitude e longitude são obrigatórias' });
  }

  db.prepare(`
    INSERT INTO motoboy_locations (motoboy_id, lat, lng, online, updated_at)
    VALUES (?, ?, ?, ?, CURRENT_TIMESTAMP)
    ON CONFLICT(motoboy_id) DO UPDATE SET lat=?, lng=?, online=COALESCE(?,online), updated_at=CURRENT_TIMESTAMP
  `).run(req.user.id, lat, lng, online ?? 1, lat, lng, online);

  const io = require('../services/socket').getIO();
  if (io) {
    const activeOrders = db.prepare(
      "SELECT id FROM orders WHERE motoboy_id = ? AND status IN ('assigned','picked_up','in_transit','arriving')"
    ).all(req.user.id);

    for (const o of activeOrders) {
      io.to(`order:${o.id}`).emit('motoboy_location', {
        orderId: o.id,
        motoboyId: req.user.id,
        motoboyName: req.user.name,
        lat, lng
      });
    }
  }

  res.json({ success: true });
});

router.get('/location/:motoboyId', authMiddleware, (req, res) => {
  const loc = db.prepare('SELECT * FROM motoboy_locations WHERE motoboy_id = ?')
    .get(req.params.motoboyId);
  if (!loc) return res.json({ lat: -23.5505, lng: -46.6333, online: 0 });
  res.json(loc);
});

router.post('/optimize-route', authMiddleware, roleMiddleware('motoboy'), (req, res) => {
  const { orderIds } = req.body;
  if (!orderIds || !orderIds.length) {
    return res.status(400).json({ error: 'Lista de pedidos é obrigatória' });
  }

  const orders = db.prepare(`
    SELECT o.id, o.customer_address, o.customer_lat, o.customer_lng,
           s.lat as store_lat, s.lng as store_lng, s.name as store_name, s.address as store_address
    FROM orders o JOIN stores s ON o.store_id = s.id
    WHERE o.id IN (${orderIds.map(() => '?').join(',')})
      AND o.motoboy_id = ?
  `).all(...orderIds, req.user.id);

  if (!orders.length) return res.status(404).json({ error: 'Nenhum pedido encontrado' });

  function dist(a, b) {
    const dx = a.lat - b.lat;
    const dy = a.lng - b.lng;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const start = orders[0].store_lat && orders[0].store_lng
    ? { lat: orders[0].store_lat, lng: orders[0].store_lng }
    : { lat: -23.5505, lng: -46.6333 };

  const remaining = [...orders];
  const route = [];
  let current = start;

  while (remaining.length > 0) {
    let bestIdx = 0;
    let bestDist = Infinity;

    for (let i = 0; i < remaining.length; i++) {
      const d = dist(current, { lat: remaining[i].customer_lat, lng: remaining[i].customer_lng });
      if (d < bestDist) {
        bestDist = d;
        bestIdx = i;
      }
    }

    route.push(remaining[bestIdx]);
    current = { lat: remaining[bestIdx].customer_lat, lng: remaining[bestIdx].customer_lng };
    remaining.splice(bestIdx, 1);
  }

  res.json({
    store: { name: orders[0].store_name, address: orders[0].store_address, lat: orders[0].store_lat, lng: orders[0].store_lng },
    route: route.map((r, i) => ({ ...r, stop: i + 1 }))
  });
});

module.exports = router;
