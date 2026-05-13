const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { supabase } = require('../database');
const { signToken, authMiddleware } = require('../auth');

const router = Router();

router.post('/register', async (req, res) => {
  const { name, phone, password, role, inviteToken, extra } = req.body;
  if (!name || !phone || !password || !role) {
    return res.status(400).json({ error: 'Nome, telefone, senha e perfil são obrigatórios' });
  }
  if (!['customer', 'store', 'motoboy'].includes(role)) {
    return res.status(400).json({ error: 'Perfil inválido' });
  }

  const { data: existing } = await supabase.from('users').select('id').eq('phone', phone).single();
  if (existing) return res.status(409).json({ error: 'Telefone já cadastrado' });

  const id = uuid();
  const hash = bcrypt.hashSync(password, 10);

  await supabase.from('users').insert({
    id, name, phone, password_hash: hash, role,
    cpf: (extra?.cpf) || '',
    vehicle_type: (extra?.vehicle_type) || '',
    pix_key: (extra?.pix_key) || ''
  });

  const user = { id, name, role, phone };
  const token = signToken(user);

  if (role === 'motoboy') {
    await supabase.from('motoboy_locations').upsert(
      { motoboy_id: id, lat: -23.5505, lng: -46.6333, online: 1 },
      { onConflict: 'motoboy_id' }
    );
  }

  if (inviteToken) {
    const { data: invite } = await supabase.from('store_invites')
      .select('*').eq('token', inviteToken).eq('used', 0).single();
    if (invite && invite.phone === phone) {
      await supabase.from('store_invites').update({ used: 1, motoboy_id: id }).eq('id', invite.id);
      await supabase.from('store_motoboys').upsert(
        { store_id: invite.store_id, motoboy_id: id, employee: 1 },
        { onConflict: 'store_id,motoboy_id' }
      );
    }
  }

  res.json({ user, token });
});

router.get('/register/check-invite', async (req, res) => {
  const { token } = req.query;
  if (!token) return res.json({ valid: false });

  const { data: invite } = await supabase.from('store_invites')
    .select('*').eq('token', token).eq('used', 0).single();

  if (!invite) return res.json({ valid: false });
  res.json({ valid: true, phone: invite.phone });
});

router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'Telefone e senha são obrigatórios' });
  }

  const { data: user } = await supabase.from('users').select('*').eq('phone', phone).single();
  if (!user) return res.status(401).json({ error: 'Telefone ou senha inválidos' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Telefone ou senha inválidos' });

  const payload = { id: user.id, name: user.name, role: user.role, phone: user.phone, address: user.address || '', lat: user.lat, lng: user.lng, photo_url: user.photo_url || '' };
  const token = signToken(payload);

  let store = null;
  if (user.role === 'store') {
    const { data: s } = await supabase.from('stores').select('*').eq('owner_id', user.id).single();
    store = s;
  }

  res.json({ user: payload, token, store });
});

router.get('/me', authMiddleware, async (req, res) => {
  const { data: user } = await supabase.from('users')
    .select('id, name, phone, role, address, lat, lng, photo_url, created_at')
    .eq('id', req.user.id).single();

  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  let store = null;
  if (user.role === 'store') {
    const { data: s } = await supabase.from('stores').select('*').eq('owner_id', user.id).single();
    store = s;
  }

  res.json({ user, store });
});

router.patch('/profile', authMiddleware, async (req, res) => {
  const { address, lat, lng, photo_url } = req.body;
  const update = {};
  if (address !== undefined) update.address = address;
  if (lat !== undefined) update.lat = lat;
  if (lng !== undefined) update.lng = lng;
  if (photo_url !== undefined) update.photo_url = photo_url;

  if (Object.keys(update).length > 0) {
    await supabase.from('users').update(update).eq('id', req.user.id);
  }

  res.json({ ok: true });
});

module.exports = router;
