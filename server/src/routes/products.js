const { Router } = require('express');
const { v4: uuid } = require('uuid');
const { supabase } = require('../database');
const { authMiddleware, roleMiddleware } = require('../auth');

const router = Router();

router.get('/', async (req, res) => {
  let query = supabase.from('products').select('*, stores(name)').eq('active', 1);
  if (req.query.store_id) {
    query = query.eq('store_id', req.query.store_id);
  }
  const { data } = await query;
  res.json(data || []);
});

router.post('/', authMiddleware, roleMiddleware('store'), async (req, res) => {
  const { data: store } = await supabase.from('stores').select('*').eq('owner_id', req.user.id).single();
  if (!store) return res.status(403).json({ error: 'Loja não encontrada' });

  const { name, description, price, size_ml } = req.body;
  if (!name || !price || !size_ml) {
    return res.status(400).json({ error: 'Nome, preço e tamanho são obrigatórios' });
  }

  const id = uuid();
  await supabase.from('products').insert({
    id, store_id: store.id, name, description: description || '', price, size_ml
  });

  res.json({ id, store_id: store.id, name, description, price, size_ml });
});

router.put('/:id', authMiddleware, roleMiddleware('store'), async (req, res) => {
  const { data: store } = await supabase.from('stores').select('*').eq('owner_id', req.user.id).single();
  if (!store) return res.status(403).json({ error: 'Loja não encontrada' });

  const { data: product } = await supabase.from('products')
    .select('*').eq('id', req.params.id).eq('store_id', store.id).single();
  if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

  const { name, description, price, size_ml, active } = req.body;
  const update = {};
  if (name !== undefined) update.name = name;
  if (description !== undefined) update.description = description;
  if (price !== undefined) update.price = price;
  if (size_ml !== undefined) update.size_ml = size_ml;
  if (active !== undefined) update.active = active;

  if (Object.keys(update).length > 0) {
    await supabase.from('products').update(update).eq('id', req.params.id);
  }

  res.json({ success: true });
});

router.delete('/:id', authMiddleware, roleMiddleware('store'), async (req, res) => {
  const { data: store } = await supabase.from('stores').select('*').eq('owner_id', req.user.id).single();
  if (!store) return res.status(403).json({ error: 'Loja não encontrada' });

  await supabase.from('products').update({ active: 0 }).eq('id', req.params.id).eq('store_id', store.id);
  res.json({ success: true });
});

module.exports = router;
