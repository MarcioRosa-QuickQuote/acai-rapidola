const { Router } = require('express');
const { v4: uuid } = require('uuid');
const { supabase } = require('../database');
const { authMiddleware, roleMiddleware } = require('../auth');

const router = Router();

function getIO() {
  const { getIO } = require('../services/socket');
  return getIO();
}

async function notifyUser(userId, title, body, type = 'info') {
  const id = uuid();
  await supabase.from('notifications').insert({ id, user_id: userId, title, body, type });
  const io = getIO();
  if (io) {
    for (const [socketId, socket] of io.sockets.sockets) {
      if (socket.userId === userId) {
        socket.emit('notification', { id, title, body, type });
      }
    }
  }
}

function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

function calcDeliveryFee(distanceKm) {
  if (!isFinite(distanceKm) || distanceKm > 100) return 6.50;
  const base = 5.00;
  const perKm = 1.80;
  const fee = base + distanceKm * perKm;
  return Math.max(6.50, Math.min(50, parseFloat(fee.toFixed(2))));
}

async function notifyUser(userId, title, body, type = 'info') {
  const id = uuid();
  await supabase.from('notifications').insert({ id, user_id: userId, title, body, type });

  const io = getIO();
  if (io) {
    for (const [socketId, socket] of io.sockets.sockets) {
      if (socket.userId === userId) {
        socket.emit('notification', { id, title, body, type });
      }
    }
  }
}

router.post('/', authMiddleware, roleMiddleware('customer'), async (req, res) => {
  try {
  const { store_id, items, address, lat, lng, notes } = req.body;
  if (!store_id || !items || !items.length || !address) {
    return res.status(400).json({ error: 'Loja, itens e endereço são obrigatórios' });
  }

  const { data: store } = await supabase.from('stores').select('*').eq('id', store_id).single();
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  if (!store.open) return res.status(400).json({ error: 'Loja fechada no momento' });

  let total = 0;
  const orderItems = [];

  for (const item of items) {
    const { data: product } = await supabase.from('products')
      .select('*').eq('id', item.product_id).eq('store_id', store_id).eq('active', 1).single();
    if (!product) {
      return res.status(400).json({ error: `Produto ${item.product_id} não encontrado` });
    }
    const qty = Math.max(1, item.quantity || 1);
    total += product.price * qty;
    orderItems.push({ product, quantity: qty });
  }

  const orderId = uuid();
  const customerId = req.user.id;

  const { data: storeData } = await supabase.from('stores').select('lat, lng').eq('id', store_id).single();
  const distanceKm = calcDistance(
    storeData?.lat || store?.lat, storeData?.lng || store?.lng,
    lat || -23.55, lng || -46.63
  );
  const deliveryFee = calcDeliveryFee(distanceKm);

  const { data: created, error: insertErr } = await supabase.from('orders').insert({
    id: orderId, customer_id: customerId, store_id,
    total: total + deliveryFee,
    delivery_fee: deliveryFee,
    customer_address: address,
    customer_lat: lat || -23.55, customer_lng: lng || -46.63, notes: notes || ''
  }).select('*');

  if (insertErr || !created || created.length === 0) {
    throw new Error(insertErr?.message || 'Falha ao inserir pedido');
  }
  const newOrder = created[0];

  await supabase.from('order_items').insert(
    orderItems.map(({ product, quantity }) => ({
      id: uuid(), order_id: orderId, product_id: product.id, quantity, unit_price: product.price
    }))
  );

  if (address) {
    await supabase.from('users').update({ address, lat: lat || null, lng: lng || null }).eq('id', customerId);
  }

  const io = getIO();
  if (io) {
    io.to(`store:${store_id}`).emit('new_order', { orderId, total, customer: req.user.name, address });
  }

  await notifyUser(store.owner_id, 'Novo Pedido!', `${req.user.name} fez um pedido de R$ ${total.toFixed(2)}`, 'order');

  res.json({ order: newOrder, items: orderItems });
  } catch (err) {
    console.error('[Orders] Error:', err);
    res.status(500).json({ error: err.message || 'Erro interno ao criar pedido' });
  }
});

router.get('/', authMiddleware, async (req, res) => {
  if (req.user.role === 'customer') {
    const { data } = await supabase.from('orders')
      .select('*, stores(name)').eq('customer_id', req.user.id)
      .order('created_at', { ascending: false });
    return res.json((data || []).map(o => ({ ...o, store_name: o.stores?.name })));
  }

  if (req.user.role === 'store') {
    const { data: store } = await supabase.from('stores').select('id').eq('owner_id', req.user.id).single();
    if (!store) return res.json([]);
    const { data } = await supabase.from('orders')
      .select('*, users!orders_customer_id_fkey(name), motoboy:users!orders_motoboy_id_fkey(name)')
      .eq('store_id', store.id).order('created_at', { ascending: false });
    return res.json((data || []).map(o => ({
      ...o, customer_name: o.users?.name, motoboy_name: o.motoboy?.name
    })));
  }

  if (req.user.role === 'motoboy') {
    const { data } = await supabase.from('orders')
      .select('*, stores(name, address), users!orders_customer_id_fkey(name)')
      .or(`motoboy_id.eq.${req.user.id},and(motoboy_id.is.null,payment_status.eq.paid,status.in.(confirmed,preparing,ready))`)
      .order('created_at', { ascending: false });
    return res.json((data || []).map(o => ({
      ...o, store_name: o.stores?.name, store_address: o.stores?.address, customer_name: o.users?.name
    })));
  }

  res.json([]);
});

router.get('/:id', authMiddleware, async (req, res) => {
  const { data: order } = await supabase.from('orders')
    .select('*, stores(name, address), customer:users!orders_customer_id_fkey(name, phone), motoboy:users!orders_motoboy_id_fkey(name)')
    .eq('id', req.params.id).single();

  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  const { data: items } = await supabase.from('order_items')
    .select('*, products(name, size_ml)').eq('order_id', req.params.id);

  res.json({
    ...order,
    store_name: order.stores?.name,
    store_address: order.stores?.address,
    customer_name: order.customer?.name,
    customer_phone: order.customer?.phone,
    motoboy_name: order.motoboy?.name,
    items: (items || []).map(i => ({ ...i, product_name: i.products?.name, size_ml: i.products?.size_ml }))
  });
});

router.patch('/:id/status', authMiddleware, async (req, res) => {
  const { status } = req.body;
  const validStatuses = ['confirmed', 'preparing', 'ready', 'picked_up', 'in_transit', 'arriving', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  if (req.user.role === 'store') {
    const { data: store } = await supabase.from('stores').select('*').eq('owner_id', req.user.id).single();
    if (!store || order.store_id !== store.id) {
      return res.status(403).json({ error: 'Não autorizado' });
    }
  } else if (req.user.role === 'motoboy') {
    if (order.motoboy_id !== req.user.id) {
      return res.status(403).json({ error: 'Não autorizado' });
    }
  }

  if (status === 'arriving') {
    await notifyUser(order.customer_id, 'Motoboy chegando!', 'Seu açaí está quase aí! Abra o portão!', 'delivery');
  }
  if (status === 'picked_up') {
    const { data: store } = await supabase.from('stores').select('owner_id').eq('id', order.store_id).single();
    if (store) await notifyUser(store.owner_id, 'Pedido retirado!', 'Motoboy retirou o pedido para entrega', 'delivery');
  }

  await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', req.params.id);

  if (status === 'delivered' && order.motoboy_id) {
    await supabase.from('motoboy_earnings').insert({
      id: uuid(), motoboy_id: order.motoboy_id, order_id: req.params.id,
      amount: order.delivery_fee || parseFloat((order.total * 0.2).toFixed(2)), status: 'pending'
    });
  }

  if (status === 'ready') {
    const { data: motoboys } = await supabase.from('store_motoboys')
      .select('motoboy_id, motoboy_locations!inner(online)')
      .eq('store_id', order.store_id).eq('employee', 1).eq('motoboy_locations.online', 1)
      .order('updated_at', { foreignTable: 'motoboy_locations', ascending: false });

    if (motoboys?.length > 0) {
      const motoboyId = motoboys[0].motoboy_id;
      await supabase.from('orders').update({ motoboy_id: motoboyId, status: 'assigned' }).eq('id', req.params.id);
      await notifyUser(motoboyId, 'Nova entrega!', 'Pedido atribuído automaticamente para você', 'delivery');
    }
  }

  const io = getIO();
  if (io) {
    io.to(`order:${req.params.id}`).emit('order_status', { orderId: req.params.id, status });
    if (order.motoboy_id) {
      io.to(`user:${order.motoboy_id}`).emit('order_updated', { orderId: req.params.id, status });
    }
  }

  res.json({ success: true, status });
});

module.exports = router;
