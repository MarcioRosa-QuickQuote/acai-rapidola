const { Router } = require('express');
const { v4: uuid } = require('uuid');
const { supabase } = require('../database');
const { authMiddleware } = require('../auth');

const router = Router();

router.get('/', authMiddleware, async (req, res) => {
  const { data, error } = await supabase
    .from('user_addresses')
    .select('*')
    .eq('user_id', req.user.id)
    .order('created_at', { ascending: true });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ data: data || [] });
});

router.post('/', authMiddleware, async (req, res) => {
  const { label, address, complement, lat, lng } = req.body;
  if (!label || !address) return res.status(400).json({ error: 'label e address obrigatorios' });
  const { data, error } = await supabase
    .from('user_addresses')
    .insert({ id: uuid(), user_id: req.user.id, label, address, complement: complement || null, lat: lat || null, lng: lng || null })
    .select('*')
    .single();
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, data });
});

router.patch('/:id', authMiddleware, async (req, res) => {
  const { label, address, complement, lat, lng } = req.body;
  const { error } = await supabase
    .from('user_addresses')
    .update({ label, address, complement: complement || null, lat: lat || null, lng: lng || null })
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

router.delete('/:id', authMiddleware, async (req, res) => {
  const { error } = await supabase
    .from('user_addresses')
    .delete()
    .eq('id', req.params.id)
    .eq('user_id', req.user.id);
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true });
});

module.exports = router;
