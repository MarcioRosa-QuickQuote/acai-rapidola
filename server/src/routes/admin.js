const { Router } = require('express');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const { supabase } = require('../database');
const { authMiddleware, roleMiddleware } = require('../auth');

const router = Router();

// ── Middleware: apenas admin ──────────────────────────────────────────────────
const adminOnly = [authMiddleware, roleMiddleware('admin')];

// ── Setup: cria o usuário admin com role='store' (compatível sem migração SQL) ──
// Autenticação real via ADMIN_PHONES no env — role no DB não precisa ser 'admin'
router.post('/setup', async (req, res) => {
  const { secret, name, phone, password } = req.body;
  const expected = process.env.ADMIN_SETUP_SECRET;
  if (!expected || secret !== expected) {
    return res.status(403).json({ error: 'Secret inválido' });
  }
  if (!name || !phone || !password) {
    return res.status(400).json({ error: 'name, phone e password são obrigatórios' });
  }

  const { data: existing } = await supabase.from('users').select('id').eq('phone', phone).single();
  if (existing) return res.status(409).json({ error: 'Usuário já existe com esse telefone' });

  const id = uuid();
  const hash = bcrypt.hashSync(password, 10);
  // role='store' para compatibilidade com a constraint atual (sem migração SQL)
  // O login vai sobrescrever para 'admin' via ADMIN_PHONES env var
  const { error } = await supabase.from('users').insert({
    id, name, phone, password_hash: hash, role: 'store', email: phone + '@admin.local'
  });
  if (error) return res.status(500).json({ error: error.message });
  res.json({ ok: true, message: `Admin criado. Adicione ADMIN_PHONES=${phone} no Render e faça login.` });
});

// ── Stats gerais ──────────────────────────────────────────────────────────────
router.get('/stats', adminOnly, async (req, res) => {
  const [storesR, ordersR, usersR] = await Promise.all([
    supabase.from('stores').select('id, plan, subscription_active, premium_until'),
    supabase.from('orders').select('id, created_at, total, status').gte('created_at', new Date(Date.now() - 30 * 86400000).toISOString()),
    supabase.from('users').select('id, role, created_at').neq('role', 'admin'),
  ]);

  const stores = storesR.data || [];
  const orders = ordersR.data || [];
  const users = usersR.data || [];

  const now = new Date();
  const premiumActive = stores.filter(s =>
    s.plan === 'premium' && s.subscription_active === 1 &&
    (!s.premium_until || new Date(s.premium_until) > now)
  ).length;

  const today = new Date(); today.setHours(0,0,0,0);
  const ordersToday = orders.filter(o => new Date(o.created_at) >= today).length;
  const revenueToday = orders
    .filter(o => new Date(o.created_at) >= today && o.status !== 'cancelled')
    .reduce((s, o) => s + (o.total || 0), 0);

  res.json({
    totalStores: stores.length,
    premiumActive,
    basico: stores.length - premiumActive,
    inactive: stores.filter(s => s.subscription_active === 0).length,
    totalOrders30d: orders.length,
    ordersToday,
    revenueToday,
    totalCustomers: users.filter(u => u.role === 'customer').length,
    totalMotoboys: users.filter(u => u.role === 'motoboy').length,
    totalStoreUsers: users.filter(u => u.role === 'store').length,
  });
});

// ── Listar lojas ──────────────────────────────────────────────────────────────
router.get('/stores', adminOnly, async (req, res) => {
  const { data: stores } = await supabase
    .from('stores')
    .select('id, name, address, plan, subscription_active, premium_until, created_at, owner_id, logo');

  if (!stores) return res.json([]);

  // Buscar donos
  const ownerIds = [...new Set(stores.map(s => s.owner_id).filter(Boolean))];
  let owners = {};
  if (ownerIds.length) {
    const { data: users } = await supabase
      .from('users')
      .select('id, name, phone, email, created_at')
      .in('id', ownerIds);
    (users || []).forEach(u => { owners[u.id] = u; });
  }

  // Contagem de pedidos por loja (30 dias)
  const since = new Date(Date.now() - 30 * 86400000).toISOString();
  const { data: orderCounts } = await supabase
    .from('orders')
    .select('store_id, total, status')
    .gte('created_at', since);
  const countMap = {};
  for (const o of (orderCounts || [])) {
    if (!countMap[o.store_id]) countMap[o.store_id] = { count: 0, revenue: 0 };
    countMap[o.store_id].count++;
    if (o.status !== 'cancelled') countMap[o.store_id].revenue += (o.total || 0);
  }

  const now = new Date();
  const result = stores.map(s => {
    const isPremium = s.plan === 'premium' && s.subscription_active === 1 &&
      (!s.premium_until || new Date(s.premium_until) > now);
    const daysLeft = s.premium_until
      ? Math.max(0, Math.ceil((new Date(s.premium_until) - now) / 86400000))
      : null;
    return {
      ...s,
      owner: owners[s.owner_id] || null,
      orders30d: countMap[s.id]?.count || 0,
      revenue30d: countMap[s.id]?.revenue || 0,
      isPremium,
      daysLeft,
    };
  });

  // Ordenar: premium primeiro, depois por orders30d desc
  result.sort((a, b) => {
    if (a.isPremium !== b.isPremium) return a.isPremium ? -1 : 1;
    return b.orders30d - a.orders30d;
  });

  res.json(result);
});

// ── Detalhes de uma loja + histórico de assinatura ────────────────────────────
router.get('/stores/:id', adminOnly, async (req, res) => {
  const { data: store } = await supabase.from('stores').select('*').eq('id', req.params.id).single();
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

  const { data: owner } = store.owner_id
    ? await supabase.from('users').select('id,name,phone,email,created_at').eq('id', store.owner_id).single()
    : { data: null };

  const { data: logs } = await supabase.from('subscription_logs')
    .select('*, users!subscription_logs_admin_id_fkey(name)')
    .eq('store_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(50);

  const { data: orders } = await supabase.from('orders')
    .select('id, status, total, created_at')
    .eq('store_id', req.params.id)
    .order('created_at', { ascending: false })
    .limit(20);

  const now = new Date();
  const isPremium = store.plan === 'premium' && store.subscription_active === 1 &&
    (!store.premium_until || new Date(store.premium_until) > now);
  const daysLeft = store.premium_until
    ? Math.max(0, Math.ceil((new Date(store.premium_until) - now) / 86400000))
    : null;

  res.json({
    ...store, owner, isPremium, daysLeft,
    logs: (logs || []).map(l => ({ ...l, admin_name: l.users?.name })),
    recentOrders: orders || []
  });
});

// ── Alterar plano / dar dias grátis ──────────────────────────────────────────
router.patch('/stores/:id/plan', adminOnly, async (req, res) => {
  const { action, days, note } = req.body;
  // action: 'grant_premium' | 'revoke_premium' | 'reset_expiry'
  if (!action) return res.status(400).json({ error: 'action é obrigatório' });

  const { data: store } = await supabase.from('stores').select('*').eq('id', req.params.id).single();
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

  const now = new Date();
  let update = {};

  if (action === 'grant_premium') {
    const d = parseInt(days) || 30;
    // Se já tem premium_until no futuro, extend; senão, começa de agora
    const base = store.premium_until && new Date(store.premium_until) > now
      ? new Date(store.premium_until)
      : now;
    const newUntil = new Date(base.getTime() + d * 86400000);
    update = { plan: 'premium', subscription_active: 1, premium_until: newUntil.toISOString() };
  } else if (action === 'revoke_premium') {
    update = { plan: 'basico', premium_until: null };
  } else if (action === 'set_permanent_premium') {
    update = { plan: 'premium', subscription_active: 1, premium_until: null };
  } else {
    return res.status(400).json({ error: 'action inválido' });
  }

  await supabase.from('stores').update(update).eq('id', req.params.id);

  // Log
  await supabase.from('subscription_logs').insert({
    id: uuid(), store_id: req.params.id, admin_id: req.user.id,
    action, days: parseInt(days) || null,
    note: note || '',
    created_at: now.toISOString()
  });

  const { data: updated } = await supabase.from('stores').select('*').eq('id', req.params.id).single();
  res.json({ ok: true, store: updated });
});

// ── Ativar / desativar assinatura ─────────────────────────────────────────────
router.patch('/stores/:id/active', adminOnly, async (req, res) => {
  const { active } = req.body;
  if (active == null) return res.status(400).json({ error: 'active é obrigatório' });

  const { data: store } = await supabase.from('stores').select('id').eq('id', req.params.id).single();
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

  await supabase.from('stores').update({ subscription_active: active ? 1 : 0 }).eq('id', req.params.id);

  await supabase.from('subscription_logs').insert({
    id: uuid(), store_id: req.params.id, admin_id: req.user.id,
    action: active ? 'activate' : 'deactivate',
    note: req.body.note || '',
    created_at: new Date().toISOString()
  });

  res.json({ ok: true });
});

// ── Logs de assinatura (globais) ──────────────────────────────────────────────
router.get('/logs', adminOnly, async (req, res) => {
  const { data: logs } = await supabase
    .from('subscription_logs')
    .select('*, stores(name), users!subscription_logs_admin_id_fkey(name)')
    .order('created_at', { ascending: false })
    .limit(100);

  res.json((logs || []).map(l => ({
    ...l,
    store_name: l.stores?.name,
    admin_name: l.users?.name,
  })));
});

// ── Buscar usuários ───────────────────────────────────────────────────────────
router.get('/users', adminOnly, async (req, res) => {
  const { q, role } = req.query;
  let query = supabase.from('users').select('id,name,phone,email,role,created_at').neq('role','admin');
  if (role) query = query.eq('role', role);
  if (q) query = query.or(`name.ilike.%${q}%,phone.ilike.%${q}%,email.ilike.%${q}%`);
  const { data } = await query.order('created_at', { ascending: false }).limit(100);
  res.json(data || []);
});

module.exports = router;
