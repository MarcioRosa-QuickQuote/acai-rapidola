const { Router } = require('express');
const { v4: uuid } = require('uuid');
const { supabase } = require('../database');
const { authMiddleware } = require('../auth');
const mercadopago = require('mercadopago');

const router = Router();

const MERCADO_PAGO_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
if (MERCADO_PAGO_TOKEN) {
  mercadopago.configure({ access_token: MERCADO_PAGO_TOKEN });
}

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
      if (socket.userId === userId) socket.emit('notification', { id, title, body, type });
    }
  }
}

function buildAppUrl(req, path) {
  const base = process.env.APP_URL || `${req.protocol}://${req.get('host')}`;
  return `${base}${path}`;
}

async function confirmOrderPayment(orderId, storeId) {
  await supabase.from('orders').update({
    payment_status: 'paid', status: 'confirmed', updated_at: new Date().toISOString()
  }).eq('id', orderId).neq('payment_status', 'paid');

  await supabase.from('orders').update({ status: 'confirmed' })
    .eq('id', orderId).eq('status', 'pending');

  const { data: store } = await supabase.from('stores').select('owner_id').eq('id', storeId).single();
  if (store) {
    await notifyUser(store.owner_id, 'Pagamento Confirmado!', `Pedido #${orderId.slice(0,8)} pago.`, 'payment');
  }

  const io = getIO();
  if (io) {
    io.to(`order:${orderId}`).emit('payment_confirmed', { orderId });
    if (storeId) io.to(`store:${storeId}`).emit('order_paid', { orderId });
  }
}

router.get('/config', (req, res) => {
  res.json({ mp_public_key: process.env.MERCADO_PAGO_PUBLIC_KEY || '' });
});

router.get('/notifications', authMiddleware, async (req, res) => {
  const { data } = await supabase.from('notifications')
    .select('*').eq('user_id', req.user.id).order('created_at', { ascending: false }).limit(50);
  res.json(data || []);
});

router.patch('/notifications/:id/read', authMiddleware, async (req, res) => {
  await supabase.from('notifications').update({ read: 1 })
    .eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ success: true });
});

router.post('/create-preference', authMiddleware, async (req, res) => {
  const { order_id } = req.body;
  if (!order_id) return res.status(400).json({ error: 'ID do pedido é obrigatório' });

  const { data: order } = await supabase.from('orders').select('*').eq('id', order_id).single();
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.payment_status === 'paid') return res.status(400).json({ error: 'Pedido já foi pago' });

  if (!MERCADO_PAGO_TOKEN) {
    return res.status(500).json({ error: 'Gateway de pagamento não configurado' });
  }

  const paymentId = uuid();
  await supabase.from('orders').update({ payment_id: paymentId }).eq('id', order_id);

  const preference = {
    items: [{
      id: order_id.slice(0, 8),
      title: `Pedido Pé de Açaí #${order_id.slice(0, 8)}`,
      description: `Açaí delivery`,
      quantity: 1, unit_price: parseFloat(order.total.toFixed(2)),
      currency_id: 'BRL'
    }],
    external_reference: order_id,
    notification_url: buildAppUrl(req, '/api/webhook'),
    back_urls: {
      success: buildAppUrl(req, `/customer/tracking/${order_id}`),
      failure: buildAppUrl(req, `/customer/payment/${order_id}`),
      pending: buildAppUrl(req, `/customer/payment/${order_id}`)
    },
    auto_return: 'approved',
    payment_methods: { installments: 1, default_payment_method_id: 'pix' }
  };

  try {
    const response = await mercadopago.preferences.create(preference);
    res.json({
      init_point: response.body.init_point,
      sandbox_init_point: response.body.sandbox_init_point,
      preference_id: response.body.id
    });
  } catch (err) {
    console.error('[MP] Erro preferência:', err);
    res.status(500).json({ error: 'Erro ao criar pagamento' });
  }
});

router.post('/webhook', async (req, res) => {
  const signature = req.headers['x-signature'];
  const webhookSecret = process.env.MP_WEBHOOK_SECRET;

  if (webhookSecret && signature) {
    const crypto = require('crypto');
    const expected = crypto.createHmac('sha256', webhookSecret).update(JSON.stringify(req.body)).digest('hex');
    if (signature !== expected) return res.sendStatus(403);
  }

  const { type, data } = req.body;
  if (type === 'payment' && data?.id) {
    try {
      const paymentResp = await mercadopago.payment.findById(data.id);
      const payment = paymentResp.body;
      if (payment.status === 'approved') {
        const { data: order } = await supabase.from('orders')
          .select('id, store_id').eq('id', payment.external_reference).single();
        if (order) await confirmOrderPayment(order.id, order.store_id);
      }
      console.log(`[MP] Webhook payment ${data.id}: status=${payment.status}`);
    } catch (err) {
      console.error('[MP] Webhook error:', err);
    }
  }
  res.sendStatus(200);
});

router.post('/pix/qrcode', authMiddleware, async (req, res) => {
  const { order_id } = req.body;
  const { data: order } = await supabase.from('orders').select('*').eq('id', order_id).single();
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.payment_status === 'paid') return res.status(400).json({ error: 'Pedido já foi pago' });

  res.json({ pix_id: uuid(), pix_code: 'SIMULADO', total: order.total, expires_in: 300 });
});

router.post('/pix/confirm', authMiddleware, async (req, res) => {
  const { order_id } = req.body;
  const { data: order } = await supabase.from('orders').select('*').eq('id', order_id).single();
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });

  await confirmOrderPayment(order_id, order.store_id);
  res.json({ success: true, status: 'paid' });
});

router.post('/process-card-payment', authMiddleware, async (req, res) => {
  const { order_id, token, payment_method_id, installments, issuer_id, payer_email, identification_type, identification_number, save_card } = req.body;
  if (!order_id || !token || !payment_method_id) {
    return res.status(400).json({ error: 'Dados do pagamento incompletos' });
  }

  const { data: order } = await supabase.from('orders').select('*').eq('id', order_id).single();
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.payment_status === 'paid') return res.status(400).json({ error: 'Pedido já foi pago' });
  if (!MERCADO_PAGO_TOKEN) return res.status(500).json({ error: 'Gateway não configurado' });

  try {
    const paymentResp = await mercadopago.payment.create({
      transaction_amount: parseFloat(order.total.toFixed(2)),
      token, description: `Pedido Pé de Açaí #${order_id.slice(0, 8)}`,
      installments: parseInt(installments) || 1, payment_method_id, issuer_id,
      payer: {
        email: payer_email || `cliente_${req.user.id}@pedeacai.app`,
        ...(identification_type && identification_number ? { identification: { type: identification_type, number: identification_number } } : {})
      },
      external_reference: order_id,
      notification_url: buildAppUrl(req, '/api/webhook')
    });



    const payment = paymentResp.body;
    if (payment.status === 'approved') {
      await confirmOrderPayment(order_id, order.store_id);
      await supabase.from('orders').update({ payment_id: String(payment.id) }).eq('id', order_id);
    }

    if (save_card && payment.status === 'approved' && payer_email) {
      try {
        const mpCustomerId = `user_${req.user.id}`;
        const custResp = await mercadopago.customers.search({ email: payer_email });
        const cust = custResp.body.results?.find(c => c.email === payer_email);
        const customerId = cust?.id || (await mercadopago.customers.create({ email: payer_email, id: mpCustomerId })).body.id;
        await mercadopago.card.create({ customer_id: customerId, token });
      } catch (e) { console.error('[MP] Save card error:', e.message); }
    }

    res.json({ status: payment.status, status_detail: payment.status_detail, payment_id: payment.id });
  } catch (err) {
    console.error('[MP] Card payment error:', err);
    res.status(500).json({ error: 'Erro ao processar pagamento' });
  }
});

router.get('/saved-cards', authMiddleware, async (req, res) => {
  if (!MERCADO_PAGO_TOKEN) return res.json([]);
  try {
    const email = `cliente_${req.user.id}@pedeacai.app`;
    const custResp = await mercadopago.customers.search({ email });
    const cust = custResp.body.results?.find(c => c.email === email);
    if (!cust) return res.json([]);
    const cardResp = await mercadopago.card.all(cust.id);
    res.json(cardResp.body || []);
  } catch (e) { res.json([]); }
});

router.post('/pay-with-saved-card', authMiddleware, async (req, res) => {
  const { order_id, card_id } = req.body;
  if (!order_id || !card_id) return res.status(400).json({ error: 'Dados incompletos' });

  const { data: order } = await supabase.from('orders').select('*').eq('id', order_id).single();
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.payment_status === 'paid') return res.status(400).json({ error: 'Pedido já foi pago' });
  if (!MERCADO_PAGO_TOKEN) return res.status(500).json({ error: 'Gateway não configurado' });

  try {
    const email = `cliente_${req.user.id}@pedeacai.app`;
    const custResp = await mercadopago.customers.search({ email });
    const cust = custResp.body.results?.find(c => c.email === email);
    const customerId = cust?.id || (await mercadopago.customers.create({ email, id: `user_${req.user.id}` })).body.id;

    const paymentResp = await mercadopago.payment.create({
      transaction_amount: parseFloat(order.total.toFixed(2)),
      description: `Pedido Pé de Açaí #${order_id.slice(0, 8)}`,
      installments: 1, payment_method_id: 'visa',
      payer: { email, type: 'customer', id: customerId },
      token: card_id, external_reference: order_id,
      notification_url: buildAppUrl(req, '/api/webhook')
    });

    const payment = paymentResp.body;
    if (payment.status === 'approved') {
      await confirmOrderPayment(order_id, order.store_id);
      await supabase.from('orders').update({ payment_id: String(payment.id) }).eq('id', order_id);
    }

    res.json({ status: payment.status, status_detail: payment.status_detail, payment_id: payment.id });
  } catch (err) {
    console.error('[MP] Saved card payment error:', err);
    res.status(500).json({ error: 'Erro ao processar pagamento' });
  }
});

module.exports = router;
