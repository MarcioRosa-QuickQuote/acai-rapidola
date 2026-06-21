const { Router } = require('express');
const { v4: uuid } = require('uuid');
const { supabase } = require('../database');
const { authMiddleware, roleMiddleware } = require('../auth');

const router = Router();

// POST /api/ratings — cliente avalia entregador após entrega
router.post('/', authMiddleware, roleMiddleware('customer'), async (req, res) => {
  const { order_id, rating } = req.body;
  if (!order_id || !rating || rating < 1 || rating > 5) {
    return res.status(400).json({ error: 'order_id e rating (1-5) são obrigatórios' });
  }

  // Verifica se o pedido pertence ao cliente e foi entregue
  const { data: order } = await supabase.from('orders')
    .select('id, customer_id, motoboy_id, status')
    .eq('id', order_id).single();

  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.customer_id !== req.user.id) return res.status(403).json({ error: 'Não autorizado' });
  if (order.status !== 'delivered') return res.status(400).json({ error: 'Pedido ainda não entregue' });
  if (!order.motoboy_id) return res.status(400).json({ error: 'Pedido sem entregador' });

  const { error } = await supabase.from('delivery_ratings').insert({
    id: uuid(),
    order_id,
    motoboy_id: order.motoboy_id,
    customer_id: req.user.id,
    rating: parseInt(rating),
    created_at: new Date().toISOString()
  });

  // UNIQUE constraint: já avaliou este pedido
  if (error?.code === '23505') return res.status(409).json({ error: 'Pedido já avaliado' });
  if (error) return res.status(500).json({ error: error.message });

  res.json({ ok: true });
});

// GET /api/ratings/check/:order_id — verifica se cliente já avaliou
router.get('/check/:orderId', authMiddleware, async (req, res) => {
  const { data } = await supabase.from('delivery_ratings')
    .select('id, rating')
    .eq('order_id', req.params.orderId)
    .eq('customer_id', req.user.id)
    .single();
  res.json({ rated: !!data, rating: data?.rating || null });
});

// GET /api/ratings/motoboy/:id — média de avaliações de um motoboy (público)
router.get('/motoboy/:id', async (req, res) => {
  const { data } = await supabase.from('delivery_ratings')
    .select('rating')
    .eq('motoboy_id', req.params.id);
  const ratings = (data || []).map(r => r.rating);
  const count = ratings.length;
  const avg = count > 0 ? ratings.reduce((s, r) => s + r, 0) / count : null;
  res.json({ count, avg: avg ? parseFloat(avg.toFixed(1)) : null });
});

module.exports = router;
