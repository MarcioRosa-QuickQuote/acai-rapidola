const { Router } = require('express');
const { v4: uuid } = require('uuid');
const { supabase } = require('../database');
const { authMiddleware } = require('../auth');
const { MercadoPagoConfig, Preference, Payment, Customer, Card } = require('mercadopago');

const router = Router();

const MERCADO_PAGO_TOKEN = process.env.MERCADO_PAGO_ACCESS_TOKEN;
let mpClient = null;
if (MERCADO_PAGO_TOKEN) {
  mpClient = new MercadoPagoConfig({ accessToken: MERCADO_PAGO_TOKEN });
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
  await supabase.from('notifications').update({ read: 1 }).eq('id', req.params.id).eq('user_id', req.user.id);
  res.json({ success: true });
});

router.post('/create-preference', authMiddleware, async (req, res) => {
  const { order_id } = req.body;
  if (!order_id) return res.status(400).json({ error: 'ID do pedido obrigatorio' });

  const { data: order } = await supabase.from('orders').select('*').eq('id', order_id).single();
  if (!order) return res.status(404).json({ error: 'Pedido nao encontrado' });
  if (order.payment_status === 'paid') return res.status(400).json({ error: 'Pedido ja foi pago' });
  if (!mpClient) return res.status(500).json({ error: 'Gateway nao configurado' });

  const paymentId = uuid();
  await supabase.from('orders').update({ payment_id: paymentId }).eq('id', order_id);

  try {
    const preference = new Preference(mpClient);
    const result = await preference.create({
      body: {
        items: [{
          id: order_id.slice(0, 8),
          title: `Pedido Pe de Acai #${order_id.slice(0, 8)}`,
          description: `Acai delivery`,
          quantity: 1, unit_price: parseFloat(order.total.toFixed(2)),
          currency_id: 'BRL'
        }],
        external_reference: order_id,
        notification_url: buildAppUrl(req, '/api/webhook'),
        back_urls: {
          success: buildAppUrl(req, `/customer/tracking/${order_id}`),
          failure: buildAppUrl(req, `/customer`),
          pending: buildAppUrl(req, `/customer`)
        },
        auto_return: 'approved'
      }
    });
    res.json({
      init_point: result.init_point,
      sandbox_init_point: result.sandbox_init_point,
      preference_id: result.id
    });
  } catch (err) {
    console.error('[MP] Erro preferencia:', err);
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
  if (type === 'payment' && data?.id && mpClient) {
    try {
      const paymentApi = new Payment(mpClient);
      const payment = await paymentApi.get({ id: data.id });
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
  if (!order) return res.status(404).json({ error: 'Pedido nao encontrado' });
  if (order.payment_status === 'paid') return res.status(400).json({ error: 'Pedido ja foi pago' });
  res.json({ pix_id: uuid(), pix_code: 'SIMULADO', total: order.total, expires_in: 300 });
});

router.post('/pix/confirm', authMiddleware, async (req, res) => {
  const { order_id } = req.body;
  const { data: order } = await supabase.from('orders').select('*').eq('id', order_id).single();
  if (!order) return res.status(404).json({ error: 'Pedido nao encontrado' });
  await confirmOrderPayment(order_id, order.store_id);
  res.json({ success: true, status: 'paid' });
});

router.post('/process-card-payment', authMiddleware, async (req, res) => {
  const { order_id, token, payment_method_id, installments, issuer_id, payer_email, identification_type, identification_number, save_card } = req.body;
  if (!order_id || !token || !payment_method_id) return res.status(400).json({ error: 'Dados incompletos' });

  const { data: order } = await supabase.from('orders').select('*').eq('id', order_id).single();
  if (!order) return res.status(404).json({ error: 'Pedido nao encontrado' });
  if (order.payment_status === 'paid') return res.status(400).json({ error: 'Pedido ja foi pago' });
  if (!mpClient) return res.status(500).json({ error: 'Gateway nao configurado' });

  try {
    const paymentApi = new Payment(mpClient);
    const payment = await paymentApi.create({
      body: {
        transaction_amount: parseFloat(order.total.toFixed(2)),
        token, description: `Pedido Pe de Acai #${order_id.slice(0, 8)}`,
        installments: parseInt(installments) || 1, payment_method_id, issuer_id,
        payer: {
          email: payer_email || `cliente_${req.user.id}@pedeacai.app`,
          ...(identification_type && identification_number ? { identification: { type: identification_type, number: identification_number } } : {})
        },
        external_reference: order_id,
        notification_url: buildAppUrl(req, '/api/webhook')
      }
    });

    if (payment.status === 'approved') {
      await confirmOrderPayment(order_id, order.store_id);
      await supabase.from('orders').update({ payment_id: String(payment.id) }).eq('id', order_id);
    }

    if (save_card && payment.status === 'approved' && payer_email) {
      try {
        const customerApi = new Customer(mpClient);
        const mpCustomerId = `user_${req.user.id}`;
        const custResult = await customerApi.search({ search: payer_email }).catch(() => ({ total: 0 }));
        const cust = custResult.total > 0 ? custResult : await customerApi.create({
          body: { email: payer_email }
        }).catch(() => null);
        if (cust) {
          const cardApi = new Card(mpClient);
          await cardApi.create({ customer_id: cust.id || cust, body: { token } });
        }
      } catch (e) { console.error('[MP] Save card error:', e.message); }
    }

    res.json({ status: payment.status, status_detail: payment.status_detail, payment_id: payment.id });
  } catch (err) {
    console.error('[MP] Card payment error:', err);
    res.status(500).json({ error: 'Erro ao processar pagamento' });
  }
});

router.get('/saved-cards', authMiddleware, async (req, res) => {
  if (!mpClient) return res.json([]);
  try {
    const email = `cliente_${req.user.id}@pedeacai.app`;
    const customerApi = new Customer(mpClient);
    const custResult = await customerApi.search({ search: email }).catch(() => ({ total: 0 }));
    if (custResult.total === 0) return res.json([]);
    const cardApi = new Card(mpClient);
    const cards = await cardApi.all({ customer_id: custResult.results?.[0]?.id || custResult.id });
    res.json(Array.isArray(cards) ? cards : (cards.body || []));
  } catch (e) { res.json([]); }
});

router.post('/pay-with-saved-card', authMiddleware, async (req, res) => {
  const { order_id, card_id } = req.body;
  if (!order_id || !card_id) return res.status(400).json({ error: 'Dados incompletos' });

  const { data: order } = await supabase.from('orders').select('*').eq('id', order_id).single();
  if (!order) return res.status(404).json({ error: 'Pedido nao encontrado' });
  if (order.payment_status === 'paid') return res.status(400).json({ error: 'Pedido ja foi pago' });
  if (!mpClient) return res.status(500).json({ error: 'Gateway nao configurado' });

  try {
    const email = `cliente_${req.user.id}@pedeacai.app`;
    const customerApi = new Customer(mpClient);
    const custResult = await customerApi.search({ search: email }).catch(() => ({ total: 0 }));
    const customerId = custResult.total > 0 ? (custResult.results?.[0]?.id || custResult.id) : null;
    if (!customerId) return res.status(500).json({ error: 'Erro ao buscar cliente' });

    const paymentApi = new Payment(mpClient);
    const payment = await paymentApi.create({
      body: {
        transaction_amount: parseFloat(order.total.toFixed(2)),
        description: `Pedido Pe de Acai #${order_id.slice(0, 8)}`,
        installments: 1, payment_method_id: 'visa',
        payer: { email, type: 'customer', id: customerId },
        token: card_id, external_reference: order_id,
        notification_url: buildAppUrl(req, '/api/webhook')
      }
    });

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
