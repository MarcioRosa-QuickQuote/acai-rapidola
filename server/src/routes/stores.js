const { Router } = require('express');
const { v4: uuid } = require('uuid');
const { supabase } = require('../database');
const { authMiddleware, roleMiddleware } = require('../auth');
const multer = require('multer');

const router = Router();
const upload = multer({ storage: multer.memoryStorage(), limits: { fileSize: 5 * 1024 * 1024 }, fileFilter: (req, file, cb) => {
  if (file.mimetype.startsWith('image/')) cb(null, true);
  else cb(new Error('Apenas imagens são aceitas'));
}});

router.post('/', authMiddleware, roleMiddleware('store'), async (req, res) => {
  const { name, address, lat, lng } = req.body;
  if (!name || !address) {
    return res.status(400).json({ error: 'Nome e endereço são obrigatórios' });
  }

  const { data: existing } = await supabase.from('stores').select('*').eq('owner_id', req.user.id).single();
  if (existing) return res.status(409).json({ error: 'Você já possui uma loja' });

  const id = uuid();
  const trialUntil = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();
  await supabase.from('stores').insert({
    id, name, owner_id: req.user.id, address,
    lat: lat || -23.5505, lng: lng || -46.6333,
    plan: 'premium', premium_until: trialUntil
  });

  res.json({ id, name, owner_id: req.user.id, address, lat, lng });
});

router.get('/', async (req, res) => {
  const { data: stores } = await supabase.from('stores').select('*');
  res.json(stores);
});

router.get('/:id', async (req, res) => {
  const { data: store } = await supabase.from('stores').select('*').eq('id', req.params.id).single();
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  res.json(store);
});

router.put('/:id/settings', authMiddleware, roleMiddleware('store'), async (req, res) => {
  const { data: store } = await supabase.from('stores')
    .select('*').eq('id', req.params.id).eq('owner_id', req.user.id).single();
  if (!store) return res.status(403).json({ error: 'Não autorizado' });

  const { name, logo, lat, lng, address, color_primary, color_secondary, pix_key } = req.body;
  const update = {};
  const toVal = (v) => (v === '' || v === null || v === undefined || Number.isNaN(v)) ? null : v;

  const n = toVal(name); const l = toVal(logo); const la = toVal(lat);
  const ln = toVal(lng); const ad = toVal(address); const cp = toVal(color_primary); const cs = toVal(color_secondary);
  const pk = toVal(pix_key);

  if (n !== null) update.name = n;
  if (l !== null) update.logo = l;
  if (la !== null) update.lat = la;
  if (ln !== null) update.lng = ln;
  if (ad !== null) update.address = ad;
  if (cp !== null) update.color_primary = cp;
  if (cs !== null) update.color_secondary = cs;
  if (pk !== null) update.pix_key = pk;

  if (Object.keys(update).length > 0) {
    await supabase.from('stores').update(update).eq('id', store.id);
  }

  const { data: updated } = await supabase.from('stores').select('*').eq('id', store.id).single();
  res.json(updated);
});

router.post('/:id/logo', authMiddleware, roleMiddleware('store'), upload.single('logo'), async (req, res) => {
  const { data: store } = await supabase.from('stores')
    .select('*').eq('id', req.params.id).eq('owner_id', req.user.id).single();
  if (!store) return res.status(403).json({ error: 'Não autorizado' });

  if (!req.file) return res.status(400).json({ error: 'Nenhuma imagem enviada' });

  const fileName = `logo-${req.params.id}-${Date.now()}`;

  const { error: uploadErr } = await supabase.storage.from('uploads').upload(fileName, req.file.buffer, {
    contentType: req.file.mimetype,
    upsert: true
  });

  if (uploadErr) {
    console.error('[Upload] Error:', uploadErr);
    return res.status(500).json({ error: 'Erro ao enviar imagem' });
  }

  const { data: { publicUrl } } = supabase.storage.from('uploads').getPublicUrl(fileName);
  await supabase.from('stores').update({ logo: publicUrl }).eq('id', store.id);

  res.json({ logo: publicUrl });
});

router.patch('/:id/toggle-open', authMiddleware, roleMiddleware('store'), async (req, res) => {
  const { data: store } = await supabase.from('stores')
    .select('*').eq('id', req.params.id).eq('owner_id', req.user.id).single();
  if (!store) return res.status(403).json({ error: 'Não autorizado' });

  const newStatus = store.open ? 0 : 1;
  await supabase.from('stores').update({ open: newStatus }).eq('id', req.params.id);

  res.json({ open: !!newStatus, message: newStatus ? 'Loja ABERTA' : 'Loja FECHADA' });
});

router.get('/:id/motoboys', authMiddleware, roleMiddleware('store'), async (req, res) => {
  const { data: store } = await supabase.from('stores')
    .select('*').eq('id', req.params.id).eq('owner_id', req.user.id).single();
  if (!store) return res.status(403).json({ error: 'Não autorizado' });

  const { data: motoboys } = await supabase.from('store_motoboys')
    .select('motoboy_id, employee, created_at, users!inner(id, name, phone)')
    .eq('store_id', req.params.id);

  res.json(motoboys?.map(m => ({ id: m.users.id, name: m.users.name, phone: m.users.phone, employee: m.employee, created_at: m.created_at })) || []);
});

router.get('/:id/invites', authMiddleware, roleMiddleware('store'), async (req, res) => {
  const { data: store } = await supabase.from('stores')
    .select('*').eq('id', req.params.id).eq('owner_id', req.user.id).single();
  if (!store) return res.status(403).json({ error: 'Não autorizado' });

  const { data: invites } = await supabase.from('store_invites')
    .select('*').eq('store_id', req.params.id).order('created_at', { ascending: false });
  res.json(invites);
});

router.post('/:id/invite', authMiddleware, roleMiddleware('store'), async (req, res) => {
  const { data: store } = await supabase.from('stores')
    .select('*').eq('id', req.params.id).eq('owner_id', req.user.id).single();
  if (!store) return res.status(403).json({ error: 'Não autorizado' });

  const { phone } = req.body;
  if (!phone) return res.status(400).json({ error: 'Telefone do motoboy é obrigatório' });

  const { data: existingUser } = await supabase.from('users').select('id, role').eq('phone', phone).single();

  if (existingUser) {
    if (existingUser.role !== 'motoboy') {
      return res.status(400).json({ error: 'Este telefone não pertence a um motoboy' });
    }

    const { data: alreadyLinked } = await supabase.from('store_motoboys')
      .select('*').eq('store_id', req.params.id).eq('motoboy_id', existingUser.id).single();
    if (alreadyLinked) return res.status(409).json({ error: 'Motoboy já vinculado' });

    await supabase.from('store_motoboys').insert({
      store_id: req.params.id, motoboy_id: existingUser.id, employee: 1
    });

    const { data: userData } = await supabase.from('users').select('id, name, phone').eq('id', existingUser.id).single();
    return res.json({ ...userData, employee: 1, direct: true });
  }

  const token = uuid().replace(/-/g, '').slice(0, 12);
  const id = uuid();

  await supabase.from('store_invites').insert({ id, store_id: req.params.id, phone, token });

  const appUrl = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  const inviteLink = `${appUrl}/register?token=${token}`;
  res.json({ id, phone, token, inviteLink });
});

router.delete('/:id/invite/:inviteId', authMiddleware, roleMiddleware('store'), async (req, res) => {
  const { data: store } = await supabase.from('stores')
    .select('*').eq('id', req.params.id).eq('owner_id', req.user.id).single();
  if (!store) return res.status(403).json({ error: 'Não autorizado' });

  await supabase.from('store_invites').delete().eq('id', req.params.inviteId).eq('store_id', req.params.id);
  res.json({ success: true });
});

router.patch('/:id/motoboy/:motoboyId', authMiddleware, roleMiddleware('store'), async (req, res) => {
  const { data: store } = await supabase.from('stores')
    .select('*').eq('id', req.params.id).eq('owner_id', req.user.id).single();
  if (!store) return res.status(403).json({ error: 'Não autorizado' });

  const { employee } = req.body;
  await supabase.from('store_motoboys').update({ employee: employee ? 1 : 0 })
    .eq('store_id', req.params.id).eq('motoboy_id', req.params.motoboyId);

  const { data: updated } = await supabase.from('store_motoboys')
    .select('motoboy_id, employee, users!inner(id, name, phone)')
    .eq('store_id', req.params.id).eq('motoboy_id', req.params.motoboyId).single();

  res.json(updated ? { id: updated.users.id, name: updated.users.name, phone: updated.users.phone, employee: updated.employee } : {});
});

router.delete('/:id/motoboy/:motoboyId', authMiddleware, roleMiddleware('store'), async (req, res) => {
  const { data: store } = await supabase.from('stores')
    .select('*').eq('id', req.params.id).eq('owner_id', req.user.id).single();
  if (!store) return res.status(403).json({ error: 'Não autorizado' });

  await supabase.from('store_motoboys').delete()
    .eq('store_id', req.params.id).eq('motoboy_id', req.params.motoboyId);

  res.json({ success: true });
});

module.exports = router;
