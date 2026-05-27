const { Router } = require('express');
const { supabase } = require('../database');
const { authMiddleware, roleMiddleware } = require('../auth');

const router = Router();

router.get('/available', authMiddleware, roleMiddleware('motoboy'), async (req, res) => {
  const { data: employeeStores } = await supabase.from('store_motoboys')
    .select('store_id').eq('motoboy_id', req.user.id).eq('employee', 1);
  const storeIds = (employeeStores || []).map(s => s.store_id);

  let query = supabase.from('orders')
    .select('*, stores(name, address, lat, lng), users!orders_customer_id_fkey(name)')
    .eq('payment_status', 'paid')
    .in('status', ['confirmed', 'preparing', 'ready']);

  if (storeIds.length > 0) {
    query = query.in('store_id', storeIds).is('motoboy_id', null);
  } else {
    query = query.or(`motoboy_id.is.null,motoboy_id.eq.${req.user.id}`);
  }

  const { data } = await query.order('created_at', { ascending: true });
  res.json((data || []).map(o => ({
    ...o, store_name: o.stores?.name, store_address: o.stores?.address,
    store_lat: o.stores?.lat, store_lng: o.stores?.lng,
    customer_name: o.users?.name
  })));
});

router.get('/profile', authMiddleware, roleMiddleware('motoboy'), async (req, res) => {
  const { data: employments } = await supabase.from('store_motoboys')
    .select('store_id, employee, stores(name)')
    .eq('motoboy_id', req.user.id);

  const { data: earnings } = await supabase.from('motoboy_earnings')
    .select('*').eq('motoboy_id', req.user.id).order('created_at', { ascending: false });

  const total = (earnings || []).reduce((s, e) => s + e.amount, 0);
  const pending = (earnings || []).filter(e => e.status === 'pending').reduce((s, e) => s + e.amount, 0);

  res.json({ employments: (employments || []).map(e => ({ ...e, store_name: e.stores?.name })), earnings: earnings || [], total, pending });
});

router.post('/accept/:orderId', authMiddleware, roleMiddleware('motoboy'), async (req, res) => {
  const { data: order } = await supabase.from('orders')
    .select('*').eq('id', req.params.orderId).eq('payment_status', 'paid').single();

  if (!order) return res.status(404).json({ error: 'Pedido não encontrado ou não pago' });
  if (order.motoboy_id && order.motoboy_id !== req.user.id) {
    return res.status(409).json({ error: 'Pedido já atribuído a outro motoboy' });
  }

  const newStatus = order.status !== 'assigned' ? 'assigned' : order.status;
  await supabase.from('orders').update({ motoboy_id: req.user.id, status: newStatus }).eq('id', req.params.orderId);

  // Notificar a loja que o motoboy aceitou e está a caminho
  const io = require('../services/socket').getIO();
  if (io && newStatus === 'assigned') {
    io.to(`store:${order.store_id}`).emit('order_status', {
      orderId: req.params.orderId,
      status: 'assigned',
      motoboyName: req.user.name || 'Motoboy'
    });
  }

  res.json({ success: true });
});

function calcDistance(lat1, lng1, lat2, lng2) {
  const R = 6371;
  const dLat = (lat2 - lat1) * Math.PI / 180;
  const dLng = (lng2 - lng1) * Math.PI / 180;
  const a = Math.sin(dLat / 2) ** 2 + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLng / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
}

router.post('/location', authMiddleware, roleMiddleware('motoboy'), async (req, res) => {
  const { lat, lng, online } = req.body;
  if (lat == null || lng == null) {
    return res.status(400).json({ error: 'Latitude e longitude são obrigatórias' });
  }

  await supabase.from('motoboy_locations').upsert({
    motoboy_id: req.user.id, lat, lng, online: online ?? 1, updated_at: new Date().toISOString()
  }, { onConflict: 'motoboy_id' });

  const io = require('../services/socket').getIO();
  if (io) {
    const { data: activeOrders } = await supabase.from('orders')
      .select('id, customer_lat, customer_lng, status').eq('motoboy_id', req.user.id)
      .in('status', ['assigned', 'picked_up', 'in_transit', 'arriving']);

    for (const o of (activeOrders || [])) {
      io.to(`order:${o.id}`).emit('motoboy_location', {
        orderId: o.id, motoboyId: req.user.id, motoboyName: req.user.name, lat, lng
      });

      if (o.status === 'picked_up' && o.customer_lat && o.customer_lng) {
        const km = calcDistance(lat, lng, o.customer_lat, o.customer_lng);
        if (km < 0.2) {
          await supabase.from('orders').update({
            status: 'arriving', updated_at: new Date().toISOString()
          }).eq('id', o.id).eq('status', 'picked_up');

          io.to(`order:${o.id}`).emit('order_status', { orderId: o.id, status: 'arriving' });

          const { data: orderData } = await supabase.from('orders').select('customer_id').eq('id', o.id).single();
          if (orderData) {
            const id = require('uuid').v4();
            await supabase.from('notifications').insert({
              id, user_id: orderData.customer_id, title: 'Motoboy chegando!',
              body: 'Seu açaí está quase aí! Abra o portão!', type: 'delivery'
            });
            for (const [sid, sock] of io.sockets.sockets) {
              if (sock.userId === orderData.customer_id) {
                sock.emit('notification', { id, title: 'Motoboy chegando!', body: 'Seu açaí está quase aí! Abra o portão!', type: 'delivery' });
              }
            }
          }
        }
      }
    }
  }

  res.json({ success: true });
});

router.get('/location/:motoboyId', authMiddleware, async (req, res) => {
  const { data: loc } = await supabase.from('motoboy_locations')
    .select('*').eq('motoboy_id', req.params.motoboyId).single();
  if (!loc) return res.json({ lat: -23.5505, lng: -46.6333, online: 0 });
  res.json(loc);
});

router.post('/optimize-route', authMiddleware, roleMiddleware('motoboy'), async (req, res) => {
  const { orderIds } = req.body;
  if (!orderIds || !orderIds.length) {
    return res.status(400).json({ error: 'Lista de pedidos é obrigatória' });
  }

  const { data: orders } = await supabase.from('orders')
    .select('id, customer_address, customer_lat, customer_lng, stores(lat, lng, name, address)')
    .in('id', orderIds).eq('motoboy_id', req.user.id);

  if (!orders?.length) return res.status(404).json({ error: 'Nenhum pedido encontrado' });

  function dist(a, b) {
    const dx = a.lat - b.lat;
    const dy = a.lng - b.lng;
    return Math.sqrt(dx * dx + dy * dy);
  }

  const start = orders[0].stores?.lat ? { lat: orders[0].stores.lat, lng: orders[0].stores.lng } : { lat: -23.5505, lng: -46.6333 };
  const remaining = [...orders];
  const route = [];
  let current = start;

  while (remaining.length > 0) {
    let bestIdx = 0, bestDist = Infinity;
    for (let i = 0; i < remaining.length; i++) {
      const d = dist(current, { lat: remaining[i].customer_lat, lng: remaining[i].customer_lng });
      if (d < bestDist) { bestDist = d; bestIdx = i; }
    }
    route.push(remaining[bestIdx]);
    current = { lat: remaining[bestIdx].customer_lat, lng: remaining[bestIdx].customer_lng };
    remaining.splice(bestIdx, 1);
  }

  res.json({
    store: orders[0].stores ? { name: orders[0].stores.name, address: orders[0].stores.address, lat: orders[0].stores.lat, lng: orders[0].stores.lng } : null,
    route: route.map((r, i) => ({ ...r, stop: i + 1, customer_name: r.customer_name, store_name: r.stores?.name, store_address: r.stores?.address, store_lat: r.stores?.lat, store_lng: r.stores?.lng }))
  });
});

router.patch('/profile', authMiddleware, roleMiddleware('motoboy'), async (req, res) => {
  const { pix_key, name, email, cpf, vehicle_type, whatsapp } = req.body;
  const update = {};
  if (pix_key !== undefined) update.pix_key = pix_key;
  if (name !== undefined) update.name = name;
  if (email !== undefined) update.email = email;
  if (cpf !== undefined) update.cpf = cpf;
  if (vehicle_type !== undefined) update.vehicle_type = vehicle_type;
  if (whatsapp !== undefined) update.whatsapp = whatsapp;
  try {
    const { error } = await supabase.from('users').update(update).eq('id', req.user.id);
    if (error) throw error;
    res.json({ ok: true });
  } catch (err) {
    console.error('[Motoboy] Erro ao salvar perfil:', err?.message || err);
    res.status(500).json({ error: 'Erro ao salvar perfil' });
  }
});

module.exports = router;
