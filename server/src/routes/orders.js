const { Router } = require('express');
const { v4: uuid } = require('uuid');
const { supabase } = require('../database');
const { authMiddleware, roleMiddleware } = require('../auth');
const { sendPixTransfer } = require('../services/pixTransfer');

const router = Router();

function getIO() {
  const { getIO } = require('../services/socket');
  return getIO();
}

async function notifyUser(userId, title, body, type = 'info') {
  try {
    const id = uuid();
    await supabase.from('notifications').insert({ id, user_id: userId, title, body, type });
  } catch {}
  try {
    const io = getIO();
    if (io) {
      for (const [socketId, socket] of io.sockets.sockets) {
        if (socket.userId === userId) socket.emit('notification', { id: uuid(), title, body, type });
      }
    }
  } catch {}
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
    // Avisa motoboys vinculados/avulsos que há novo pedido disponível
    io.to('role:motoboy').emit('new_available_order', { orderId, storeId: store_id });
  }

  await notifyUser(store.owner_id, 'Novo Pedido!', `${req.user.name} fez um pedido de R$ ${total.toFixed(2)}`, 'order');

  res.json({ order: newOrder, items: orderItems });
  } catch (err) {
    console.error('[Orders] Error:', err);
    res.status(500).json({ error: err.message || 'Erro interno ao criar pedido' });
  }
});

router.post('/estimate-fee', authMiddleware, async (req, res) => {
  const { store_id, lat, lng } = req.body;
  if (!store_id) return res.status(400).json({ error: 'Loja obrigatoria' });

  const { data: st } = await supabase.from('stores').select('lat, lng').eq('id', store_id).single();
  if (!st) return res.status(404).json({ error: 'Loja não encontrada' });

  const km = calcDistance(st.lat, st.lng, lat || st.lat, lng || st.lng);
  const fee = calcDeliveryFee(km);
  res.json({ fee, distance_km: parseFloat(km.toFixed(2)) });
});

const BR_STATES = {
  'Acre':'AC','Alagoas':'AL','Amapá':'AP','Amazonas':'AM','Bahia':'BA','Ceará':'CE',
  'Distrito Federal':'DF','Espírito Santo':'ES','Goiás':'GO','Maranhão':'MA',
  'Mato Grosso':'MT','Mato Grosso do Sul':'MS','Minas Gerais':'MG','Pará':'PA',
  'Paraíba':'PB','Paraná':'PR','Pernambuco':'PE','Piauí':'PI','Rio de Janeiro':'RJ',
  'Rio Grande do Norte':'RN','Rio Grande do Sul':'RS','Rondônia':'RO','Roraima':'RR',
  'Santa Catarina':'SC','São Paulo':'SP','Sergipe':'SE','Tocantins':'TO'
};

function formatPhotonAddress(p) {
  const stateAbbr = BR_STATES[p.state] || '';
  const street = p.street || p.name || '';
  const number = p.housenumber ? `, ${p.housenumber}` : '';
  const neighborhood = p.district || p.suburb || p.quarter || '';
  const city = p.city || p.town || p.village || p.municipality || '';
  let addr = street + number;
  if (neighborhood) addr += ` - ${neighborhood}`;
  if (city) addr += `, ${city}`;
  if (stateAbbr) addr += ` - ${stateAbbr}`;
  return addr.trim() || p.name || '';
}

function formatNominatimAddress(a) {
  const stateAbbr = BR_STATES[a.state] || '';
  let road = a.road || a.pedestrian || a.footway || a.path || '';
  const number = a.house_number || '';
  // Se road é código de rodovia (ex: "BR", "BR-316", "AM-010"), tenta campos mais específicos
  if (/^[A-Z]{2}(-\d+)?$/i.test(road.trim())) {
    road = a.hamlet || a.allotments || a.isolated_dwelling || road;
  }
  const neighborhood = a.suburb || a.neighbourhood || a.quarter || a.district || '';
  const city = a.city || a.town || a.municipality || '';
  let addr = road;
  if (number) addr += `, ${number}`;
  if (neighborhood) addr += ` - ${neighborhood}`;
  if (city) addr += `, ${city}`;
  if (stateAbbr) addr += ` - ${stateAbbr}`;
  return addr.trim();
}

async function photonSearch(q, lat, lon) {
  const params = new URLSearchParams({ q, lang: 'pt', limit: '7', countrycodes: 'br' });
  if (lat && lon) { params.set('lat', lat); params.set('lon', lon); }
  else { params.set('lat', '-1.4558'); params.set('lon', '-48.5044'); }
  const resp = await fetch(
    `https://photon.komoot.io/api/?${params}`,
    { headers: { 'User-Agent': 'PedeAcai/1.0' }, signal: AbortSignal.timeout(5000) }
  );
  const data = await resp.json();
  return (data.features || [])
    .map(f => {
      const p = f.properties;
      const [lon, lat] = f.geometry.coordinates;
      const display_name = formatPhotonAddress(p);
      return display_name ? { display_name, lat: String(lat), lon: String(lon) } : null;
    })
    .filter(Boolean);
}

router.get('/geocode', async (req, res) => {
  const { q } = req.query;
  if (!q || q.length < 3) return res.json([]);
  try { res.json(await photonSearch(q)); }
  catch { res.json([]); }
});

router.get('/places-autocomplete', async (req, res) => {
  const { q, lat, lng } = req.query;
  if (!q || q.length < 3) return res.json({ results: [], source: 'none' });
  const key = process.env.GOOGLE_PLACES_KEY;
  if (key) {
    try {
      const locParam = lat && lng ? `&location=${lat},${lng}` : '&location=-1.4558,-48.5044';
      const url = `https://maps.googleapis.com/maps/api/place/autocomplete/json?input=${encodeURIComponent(q)}&key=${key}&language=pt-BR&components=country:br${locParam}&radius=50000&types=address`;
      const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
      const data = await resp.json();
      if (data.status === 'REQUEST_DENIED' || data.status === 'INVALID_REQUEST') {
        console.error('[Places] Google API error:', data.status, data.error_message);
      } else {
        const results = (data.predictions || []).map(p => ({
          display_name: p.description,
          place_id: p.place_id
        }));
        if (results.length > 0) return res.json({ results, source: 'google' });
      }
    } catch (err) {
      console.error('[Places] Google fetch error:', err.message);
    }
  }
  try {
    const results = await photonSearch(q, lat, lng);
    res.json({ results, source: 'photon' });
  } catch {
    res.json({ results: [], source: 'error' });
  }
});

router.get('/place-details', async (req, res) => {
  const { place_id } = req.query;
  if (!place_id) return res.status(400).json({ error: 'place_id obrigatorio' });
  const key = process.env.GOOGLE_PLACES_KEY;
  if (!key) return res.status(500).json({ error: 'Chave nao configurada' });
  try {
    const url = `https://maps.googleapis.com/maps/api/place/details/json?place_id=${place_id}&key=${key}&fields=geometry,formatted_address&language=pt-BR`;
    const resp = await fetch(url);
    const data = await resp.json();
    const loc = data.result?.geometry?.location;
    res.json({ display_name: data.result?.formatted_address, lat: loc?.lat, lon: loc?.lng });
  } catch {
    res.status(500).json({ error: 'Erro ao buscar detalhes' });
  }
});

router.get('/reverse-geocode', async (req, res) => {
  const { lat, lng } = req.query;
  if (!lat || !lng) return res.json({ error: 'Latitude e longitude são obrigatórias' });
  try {
    const resp = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&countrycodes=BR&zoom=18`,
      { headers: { 'User-Agent': 'PedeAcai/1.0' }, signal: AbortSignal.timeout(6000) }
    );
    const data = await resp.json();
    if (data.error) return res.json({ error: data.error });
    const display_name = formatNominatimAddress(data.address || {});
    res.json({ display_name, lat: parseFloat(data.lat), lon: parseFloat(data.lon) });
  } catch {
    res.json({ error: 'Erro ao buscar endereco' });
  }
});

router.get('/cep/:cep', async (req, res) => {
  const { lookupCep } = require('../helpers');
  const result = await lookupCep(req.params.cep);
  if (!result) return res.json({ error: 'CEP não encontrado' });
  res.json(result);
});

router.get('/', authMiddleware, async (req, res) => {
  if (req.user.role === 'customer') {
    const { data } = await supabase.from('orders')
      .select('*, stores(name, logo)').eq('customer_id', req.user.id)
      .order('created_at', { ascending: false });
    return res.json((data || []).map(o => ({ ...o, store_name: o.stores?.name, store_logo: o.stores?.logo })));
  }

  if (req.user.role === 'store') {
    const { data: storeData } = await supabase.from('stores').select('id, lat, lng, logo, name').eq('owner_id', req.user.id).single();
    if (!storeData) return res.json([]);
    const { data } = await supabase.from('orders')
      .select('*, users!orders_customer_id_fkey(name, phone), motoboy:users!orders_motoboy_id_fkey(name), order_items(*, products(name))')
      .eq('store_id', storeData.id).order('created_at', { ascending: false });
    return res.json((data || []).map(o => ({
      ...o, customer_name: o.users?.name, customer_phone: o.users?.phone, motoboy_name: o.motoboy?.name,
      store_name: storeData.name, store_lat: storeData.lat, store_lng: storeData.lng, store_logo: storeData.logo
    })));
  }

  if (req.user.role === 'motoboy') {
    const { data } = await supabase.from('orders')
      .select('*, stores(name, address, lat, lng), users!orders_customer_id_fkey(name)')
      .or(`motoboy_id.eq.${req.user.id},and(motoboy_id.is.null,payment_status.eq.paid,status.in.(confirmed,preparing,ready))`)
      .order('created_at', { ascending: false });
    return res.json((data || []).map(o => ({
      ...o, store_name: o.stores?.name, store_address: o.stores?.address,
      store_lat: o.stores?.lat, store_lng: o.stores?.lng,
      customer_name: o.users?.name
    })));
  }

  res.json([]);
});

router.get('/:id', authMiddleware, async (req, res) => {
  const { data: order } = await supabase.from('orders')
    .select('*, stores(name, address, logo, lat, lng), customer:users!orders_customer_id_fkey(name, phone), motoboy:users!orders_motoboy_id_fkey(name)')
    .eq('id', req.params.id).single();

  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  const { data: items } = await supabase.from('order_items')
    .select('*, products(name, size_ml)').eq('order_id', req.params.id);

  res.json({
    ...order,
    store_name: order.stores?.name,
    store_address: order.stores?.address,
    store_logo: order.stores?.logo,
    store_lat: order.stores?.lat,
    store_lng: order.stores?.lng,
    customer_name: order.customer?.name,
    customer_phone: order.customer?.phone,
    motoboy_name: order.motoboy?.name,
    items: (items || []).map(i => ({ ...i, product_name: i.products?.name, size_ml: i.products?.size_ml }))
  });
});

router.patch('/:id/status', authMiddleware, async (req, res) => {
  try {
  const { status } = req.body;
  const validStatuses = ['confirmed', 'preparing', 'ready', 'picked_up', 'in_transit', 'arriving', 'delivered', 'cancelled'];
  if (!validStatuses.includes(status)) {
    return res.status(400).json({ error: 'Status inválido' });
  }

  const { data: order } = await supabase.from('orders').select('*').eq('id', req.params.id).single();
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  if (req.user.role === 'customer') {
    if (order.customer_id !== req.user.id) {
      return res.status(403).json({ error: 'Não autorizado' });
    }
    if (status !== 'cancelled') {
      return res.status(403).json({ error: 'Você só pode cancelar seus pedidos' });
    }
   
  } else if (req.user.role === 'store') {
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

  try {
    await supabase.from('orders').update({ status, updated_at: new Date().toISOString() }).eq('id', req.params.id);
  } catch (err) {
    console.error('[Orders] update error:', err);
    return res.status(500).json({ error: 'Erro ao atualizar pedido' });
  }

  if (status === 'delivered') {
    const motoboyAmount = parseFloat((order.delivery_fee != null ? order.delivery_fee : order.total * 0.2).toFixed(2));
    const storeAmount = parseFloat((order.total - motoboyAmount).toFixed(2));

    // Motoboy: registra e tenta transferir (nunca deixa a entrega falhar por erro de PIX)
    if (order.motoboy_id) {
      await supabase.from('motoboy_earnings').insert({
        id: uuid(), motoboy_id: order.motoboy_id, order_id: req.params.id,
        amount: motoboyAmount, status: 'pending'
      }).catch(() => {});

      try {
        const { data: motoboy } = await supabase.from('users').select('pix_key, name').eq('id', order.motoboy_id).single();
        if (motoboy?.pix_key) {
          const ok = await sendPixTransfer(motoboyAmount, motoboy.pix_key, `Entrega #${req.params.id.slice(0, 8)}`);
          if (ok) {
            await supabase.from('motoboy_earnings').update({ status: 'paid', paid_at: new Date().toISOString() })
              .eq('order_id', req.params.id).eq('motoboy_id', order.motoboy_id);
            await notifyUser(order.motoboy_id, 'Pagamento enviado!', `R$ ${motoboyAmount.toFixed(2)} enviado para sua chave Pix.`, 'payment');
          }
        }
      } catch (pixErr) {
        console.error('[Orders] PIX motoboy error:', pixErr?.message);
      }
    }

    // Loja: registra e tenta transferir (nunca deixa a entrega falhar por erro de PIX)
    await supabase.from('store_earnings').insert({
      id: uuid(), store_id: order.store_id, order_id: req.params.id,
      amount: storeAmount, status: 'pending'
    }).catch(() => {});

    try {
      const { data: store } = await supabase.from('stores').select('owner_id, pix_key').eq('id', order.store_id).single();
      if (store?.pix_key) {
        const ok = await sendPixTransfer(storeAmount, store.pix_key, `Pedido #${req.params.id.slice(0, 8)}`);
        if (ok) {
          await supabase.from('store_earnings').update({ status: 'paid', paid_at: new Date().toISOString() })
            .eq('order_id', req.params.id).eq('store_id', order.store_id);
          if (store.owner_id) await notifyUser(store.owner_id, 'Pagamento enviado!', `R$ ${storeAmount.toFixed(2)} enviado para sua chave Pix.`, 'payment');
        }
      }
      if (store?.owner_id && !store?.pix_key) {
        await notifyUser(store.owner_id, 'Pedido Entregue!', `R$ ${storeAmount.toFixed(2)} a receber — cadastre sua chave Pix para receber automaticamente.`, 'delivery');
      }
    } catch (pixErr) {
      console.error('[Orders] PIX loja error:', pixErr?.message);
    }
  }

  if (status === 'ready') {
    // Auto-atribuir a qualquer motoboy vinculado à loja (parceiro ou funcionário) que esteja online
    const { data: motoboys } = await supabase.from('store_motoboys')
      .select('motoboy_id, motoboy_locations!inner(online, updated_at)')
      .eq('store_id', order.store_id).eq('motoboy_locations.online', 1)
      .order('updated_at', { foreignTable: 'motoboy_locations', ascending: false });

    if (motoboys?.length > 0) {
      const motoboyId = motoboys[0].motoboy_id;
      await supabase.from('orders').update({ motoboy_id: motoboyId, status: 'assigned' }).eq('id', req.params.id);
      const io = getIO();
      if (io) io.to(`user:${motoboyId}`).emit('order_updated', { orderId: req.params.id, status: 'assigned' });
      await notifyUser(motoboyId, '🛵 Nova entrega!', 'Pedido atribuído para você — verifique o app', 'delivery');
    } else {
      // Nenhum motoboy vinculado online → notifica motoboys avulsos que há pedido disponível
      const io = getIO();
      if (io) io.to('role:motoboy').emit('new_available_order', { orderId: req.params.id, storeId: order.store_id });
    }
  }

  const io = getIO();
  if (io) {
    io.to(`order:${req.params.id}`).emit('order_status', { orderId: req.params.id, status });
    // Loja recebe atualizações de qualquer origem (motoboy entregou, cliente cancelou, etc.)
    io.to(`store:${order.store_id}`).emit('order_status', { orderId: req.params.id, status });
    if (order.motoboy_id) {
      io.to(`user:${order.motoboy_id}`).emit('order_updated', { orderId: req.params.id, status });
    }
  }

  res.json({ success: true, status });
  } catch (err) {
    console.error('[Orders] status update error:', err?.message || err);
    res.status(500).json({ error: 'Erro ao atualizar status' });
  }
});

module.exports = router;
