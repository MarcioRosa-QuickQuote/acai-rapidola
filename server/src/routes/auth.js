const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { supabase } = require('../database');
const { signToken, authMiddleware } = require('../auth');

const router = Router();

router.post('/register', async (req, res) => {
  const { sanitize } = require('../helpers');
  const name = sanitize(req.body.name, 100);
  const phone = sanitize(req.body.phone, 20);
  const password = req.body.password || '';
  const role = sanitize(req.body.role, 20);
  const extra = req.body.extra || {};
  const inviteToken = sanitize(req.body.inviteToken || extra.inviteToken || '', 200);
  const email = sanitize(extra.email, 200);
  const cpf = sanitize((req.body.cpf || extra.cpf || '').replace(/\D/g, ''), 11);
  const plate = sanitize(req.body.plate || extra.plate || '', 10);
  const selfie_url = req.body.selfie_url || extra.selfie_url || '';
  const vehicle_type = sanitize(req.body.vehicle_type || extra.vehicle_type || '', 20);
  const pix_key = sanitize(req.body.pix_key || extra.pix_key || '', 100);
  if (!name || !phone || !password || !role) {
    return res.status(400).json({ error: 'Nome, telefone, senha e perfil são obrigatórios' });
  }
  if (!email) {
    return res.status(400).json({ error: 'Email é obrigatório para recuperação de senha' });
  }
  if (!['customer', 'store', 'motoboy'].includes(role)) {
    return res.status(400).json({ error: 'Perfil inválido' });
  }
  if (password.length < 4) {
    return res.status(400).json({ error: 'Senha deve ter no mínimo 4 caracteres' });
  }

  const { data: existing } = await supabase.from('users').select('id').eq('phone', phone).single();
  if (existing) return res.status(409).json({ error: 'Telefone já cadastrado' });

  const id = uuid();
  const hash = bcrypt.hashSync(password, 10);

  // Verifica configuração de aprovação automática
  let approval_status = 'approved';
  if (role === 'motoboy') {
    const { data: setting } = await supabase.from('app_settings')
      .select('value').eq('key', 'auto_approve_motoboy').single();
    approval_status = (setting?.value === 'true') ? 'approved' : 'pending';
  }

  const insertData = {
    id, name, phone, password_hash: hash, role, email,
    approval_status,
  };
  if (cpf) insertData.cpf = cpf;
  if (plate) insertData.plate = plate;
  if (selfie_url) insertData.selfie_url = selfie_url;
  if (vehicle_type) insertData.vehicle_type = vehicle_type;
  if (pix_key) insertData.pix_key = pix_key;

  const { error: regInsertErr } = await supabase.from('users').insert(insertData);
  if (regInsertErr) {
    console.error('[Auth] Register insert error:', regInsertErr);
    return res.status(500).json({ error: 'Erro ao criar conta: ' + regInsertErr.message });
  }

  const user = { id, name, role, phone, email, approval_status };
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

router.post('/google', async (req, res) => {
  const { userInfo, role: reqRole, cpf, vehicle_type, pix_key } = req.body;
  if (!userInfo?.email) return res.status(400).json({ error: 'Dados Google inválidos' });
  try {
    const { email, name, picture, sub: googleId } = userInfo;

    let { data: user } = await supabase.from('users').select('*').eq('email', email).single();

    if (!user) {
      const id = uuid();
      const role = ['customer', 'store', 'motoboy'].includes(reqRole) ? reqRole : 'customer';
      const { error: insertErr } = await supabase.from('users').insert({
        id, name: name || email.split('@')[0], phone: null, email,
        password_hash: '', role,
        google_id: googleId, photo_url: picture || ''
      });
      if (insertErr) {
        console.error('[Auth] Google insert error:', insertErr);
        return res.status(500).json({ error: 'Erro ao criar usuário: ' + insertErr.message });
      }
      if (role === 'motoboy') {
        await supabase.from('motoboy_locations').upsert(
          { motoboy_id: id, lat: -23.5505, lng: -46.6333, online: 1 },
          { onConflict: 'motoboy_id' }
        );
      }
      ({ data: user } = await supabase.from('users').select('*').eq('id', id).single());
    } else if (!user.google_id) {
      await supabase.from('users').update({
        google_id: googleId,
        photo_url: user.photo_url || picture || ''
      }).eq('id', user.id);
    }

    if (!user) return res.status(500).json({ error: 'Erro ao criar usuário' });

    const payload = {
      id: user.id, name: user.name, role: user.role,
      phone: user.phone || '', email: user.email || '',
      address: user.address || '', lat: user.lat, lng: user.lng,
      photo_url: user.photo_url || picture || ''
    };
    const token = signToken(payload);
    res.json({ user: payload, token });
  } catch (err) {
    console.error('[Auth] Google login error:', err);
    res.status(500).json({ error: 'Erro ao autenticar com Google' });
  }
});

// ── Helper: verifica se o telefone é admin (via env ADMIN_PHONES) ──────────────
function isAdminPhone(phone) {
  const list = (process.env.ADMIN_PHONES || '').split(',').map(p => p.trim()).filter(Boolean);
  return list.includes(phone);
}

router.post('/login', async (req, res) => {
  const { phone, password } = req.body;
  if (!phone || !password) {
    return res.status(400).json({ error: 'Telefone e senha são obrigatórios' });
  }

  const { data: user } = await supabase.from('users').select('*').eq('phone', phone).single();
  if (!user) return res.status(401).json({ error: 'Telefone ou senha inválidos' });

  const valid = bcrypt.compareSync(password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Telefone ou senha inválidos' });

  // Se o telefone consta na lista de admins, força role='admin' no JWT
  const role = isAdminPhone(user.phone) ? 'admin' : user.role;
  const payload = { id: user.id, name: user.name, role, phone: user.phone, email: user.email || '', address: user.address || '', lat: user.lat, lng: user.lng, photo_url: user.photo_url || '', approval_status: user.approval_status || 'approved' };
  const token = signToken(payload);

  let store = null;
  if (user.role === 'store' && role !== 'admin') {
    const { data: s } = await supabase.from('stores').select('*').eq('owner_id', user.id).single();
    store = s;
  }

  res.json({ user: payload, token, store });
});

router.get('/me', authMiddleware, async (req, res) => {
  const { data: user } = await supabase.from('users')
    .select('id, name, phone, email, role, address, lat, lng, photo_url, cpf, approval_status, rejection_reason, created_at')
    .eq('id', req.user.id).single();

  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  // Aplica override de admin se telefone estiver na lista ADMIN_PHONES
  const role = isAdminPhone(user.phone) ? 'admin' : user.role;
  const userOut = { ...user, role };

  let store = null;
  if (user.role === 'store' && role !== 'admin') {
    const { data: s } = await supabase.from('stores').select('*').eq('owner_id', user.id).single();
    store = s;
  }

  res.json({ user: userOut, store });
});

router.patch('/profile', authMiddleware, async (req, res) => {
  const { address, lat, lng, photo_url, cpf, vehicle_type, pix_key, name } = req.body;
  const update = {};
  if (name !== undefined && name.trim()) update.name = name.trim().slice(0, 100);
  if (address !== undefined) update.address = address;
  if (lat !== undefined) update.lat = lat;
  if (lng !== undefined) update.lng = lng;
  if (photo_url !== undefined) update.photo_url = photo_url;
  if (cpf !== undefined) update.cpf = cpf.replace(/\D/g, '').slice(0, 11);
  if (vehicle_type !== undefined) update.vehicle_type = vehicle_type;
  if (pix_key !== undefined) update.pix_key = pix_key;

  if (Object.keys(update).length > 0) {
    await supabase.from('users').update(update).eq('id', req.user.id);
  }

  res.json({ ok: true });
});

router.get('/setup-password-reset', async (req, res) => {
  try {
    const SUPABASE_URL = process.env.SUPABASE_URL;
    const SUPABASE_SERVICE_ROLE = process.env.SUPABASE_SERVICE_ROLE;
    if (SUPABASE_URL && SUPABASE_SERVICE_ROLE) {
      const sql = `CREATE TABLE IF NOT EXISTS password_reset_codes (
        phone TEXT PRIMARY KEY, code TEXT NOT NULL,
        expires TIMESTAMPTZ NOT NULL, used INTEGER NOT NULL DEFAULT 0,
        created_at TIMESTAMPTZ DEFAULT NOW()
      )`;
      await supabase.rpc('pg_execute', { query_text: sql }).catch(() => {});
      res.json({ ok: true, message: 'Tabela criada/verificada!' });
    } else {
      res.json({ ok: false, message: 'Vá no Supabase SQL Editor e cole o SQL do setup.sql' });
    }
  } catch {
    res.json({ ok: false, message: 'Vá no Supabase SQL Editor e cole o SQL do setup.sql' });
  }
});

router.post('/forgot-password', async (req, res) => {
  const { email } = req.body;
  if (!email) return res.status(400).json({ error: 'Email obrigatório' });

  const { data: user } = await supabase.from('users').select('id,email').eq('email', email).single();
  if (!user) return res.json({ ok: true, message: 'Se o email existir, o código será enviado' });

  const code = String(Math.floor(100000 + Math.random() * 900000));
  const expires = new Date(Date.now() + 10 * 60 * 1000).toISOString();

  const { error: upsertErr } = await supabase.from('password_reset_codes').upsert(
    { phone: email, code, expires, used: 0, created_at: new Date().toISOString() },
    { onConflict: 'phone' }
  );

  if (upsertErr) {
    // Tabela ainda não existe — loga mas não expõe o código
    console.warn('[Auth] password_reset_codes table missing, code not persisted');
    return res.json({ ok: true, message: 'Código enviado se o email existir' });
  }

  try {
    const { sendResetCode, hasEmailProvider } = require('../services/email');
    await sendResetCode(email, code);
    const result = { ok: true, message: 'Código enviado se o email existir' };
    if (!hasEmailProvider()) {
      // Em desenvolvimento (sem provedor), loga no servidor mas NUNCA expõe na resposta HTTP
      console.warn(`[Auth][DEV] Reset code for ${email}: ${code}`);
      result._test = 'Sem provedor de email: código foi logado no servidor (não na resposta).';
    }
    res.json(result);
  } catch (err) {
    console.error('[Auth] Erro ao enviar email:', err?.message);
    res.json({ ok: true, message: 'Código enviado se o email existir' });
  }
});

router.post('/reset-password', async (req, res) => {
  const { email, code, new_password } = req.body;
  if (!email || !code || !new_password) {
    return res.status(400).json({ error: 'Email, código e nova senha obrigatórios' });
  }
  if (new_password.length < 4) {
    return res.status(400).json({ error: 'Senha deve ter no mínimo 4 caracteres' });
  }

  const { data: record } = await supabase.from('password_reset_codes')
    .select('*').eq('phone', email).single();

  if (!record) return res.status(400).json({ error: 'Nenhum código solicitado para este email' });
  if (record.used) return res.status(400).json({ error: 'Código já utilizado' });
  if (record.code !== code) return res.status(400).json({ error: 'Código inválido' });
  if (new Date(record.expires) < new Date()) return res.status(400).json({ error: 'Código expirado' });

  const hash = bcrypt.hashSync(new_password, 10);
  await supabase.from('users').update({ password_hash: hash }).eq('email', email);
  await supabase.from('password_reset_codes').update({ used: 1 }).eq('phone', email);

  res.json({ ok: true, message: 'Senha redefinida com sucesso' });
});

router.patch('/password', authMiddleware, async (req, res) => {
  const { current_password, new_password } = req.body;
  if (!current_password || !new_password) {
    return res.status(400).json({ error: 'Senha atual e nova senha obrigatórias' });
  }
  if (new_password.length < 4) {
    return res.status(400).json({ error: 'Nova senha deve ter no mínimo 4 caracteres' });
  }

  const { data: user } = await supabase.from('users').select('password_hash').eq('id', req.user.id).single();
  if (!user) return res.status(404).json({ error: 'Usuário não encontrado' });

  const valid = bcrypt.compareSync(current_password, user.password_hash);
  if (!valid) return res.status(401).json({ error: 'Senha atual incorreta' });

  const hash = bcrypt.hashSync(new_password, 10);
  await supabase.from('users').update({ password_hash: hash }).eq('id', req.user.id);

  res.json({ ok: true, message: 'Senha alterada com sucesso' });
});

module.exports = router;
