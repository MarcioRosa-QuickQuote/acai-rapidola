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
  const { sanitize, sanitizeNum } = require('../helpers');
  const { data: store } = await supabase.from('stores').select('*').eq('owner_id', req.user.id).single();
  if (!store) return res.status(403).json({ error: 'Loja não encontrada' });

  const name = sanitize(req.body.name, 100);
  const description = sanitize(req.body.description, 500);
  const price = sanitizeNum(req.body.price);
  const size_ml = sanitizeNum(req.body.size_ml);
  const image = sanitize(req.body.image, 500);
  if (!name || !price || !size_ml) {
    return res.status(400).json({ error: 'Nome, preço e tamanho são obrigatórios' });
  }

  const id = uuid();
  await supabase.from('products').insert({
    id, store_id: store.id, name, description, price, size_ml, image: image || ''
  });

  res.json({ id, store_id: store.id, name, description, price, size_ml, image });
});

router.put('/:id', authMiddleware, roleMiddleware('store'), async (req, res) => {
  const { sanitize, sanitizeNum } = require('../helpers');
  const { data: store } = await supabase.from('stores').select('*').eq('owner_id', req.user.id).single();
  if (!store) return res.status(403).json({ error: 'Loja não encontrada' });

  const { data: product } = await supabase.from('products')
    .select('*').eq('id', req.params.id).eq('store_id', store.id).single();
  if (!product) return res.status(404).json({ error: 'Produto não encontrado' });

  const update = {};
  if (req.body.name !== undefined) update.name = sanitize(req.body.name, 100);
  if (req.body.description !== undefined) update.description = sanitize(req.body.description, 500);
  if (req.body.price !== undefined) update.price = sanitizeNum(req.body.price);
  if (req.body.size_ml !== undefined) update.size_ml = sanitizeNum(req.body.size_ml);
  if (req.body.active !== undefined) update.active = req.body.active ? 1 : 0;
  if (req.body.image !== undefined && req.body.image !== null && req.body.image !== '') update.image = sanitize(req.body.image, 500);

  if (Object.keys(update).length > 0) {
    await supabase.from('products').update(update).eq('id', req.params.id);
  }

  res.json({ success: true });
});

router.post('/upload-image', authMiddleware, async (req, res) => {
  const multer = require('multer');
  const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
    if (file.mimetype.startsWith('image/')) cb(null, true);
    else cb(new Error('Apenas imagens são aceitas'));
  }});

  upload.single('image')(req, res, async (err) => {
    if (err) return res.status(400).json({ error: err.message });
    if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

    const fileName = `prod-${Date.now()}-${Math.random().toString(36).slice(2,8)}`;
    const { error: uploadErr } = await supabase.storage.from('uploads').upload(fileName, req.file.buffer, {
      contentType: req.file.mimetype, upsert: true
    });

    if (uploadErr) return res.status(500).json({ error: 'Erro ao enviar imagem' });

    const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(fileName);
    res.json({ url: publicUrl });
  });
});

router.delete('/:id', authMiddleware, roleMiddleware('store'), async (req, res) => {
  const { data: store } = await supabase.from('stores').select('*').eq('owner_id', req.user.id).single();
  if (!store) return res.status(403).json({ error: 'Loja não encontrada' });

  await supabase.from('order_items').delete().eq('product_id', req.params.id);
  await supabase.from('products').delete().eq('id', req.params.id).eq('store_id', store.id);
  res.json({ success: true });
});

module.exports = router;
