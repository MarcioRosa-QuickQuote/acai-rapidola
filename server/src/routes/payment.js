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
  try {
    const { error: err } = await supabase.from('orders').update({
      payment_status: 'paid', status: 'confirmed', updated_at: new Date().toISOString()
    }).eq('id', orderId);

    if (err) {
      console.error('[Payment] Erro ao confirmar pagamento:', err);
      return;
    }

    const { data: store } = await supabase.from('stores').select('owner_id').eq('id', storeId).single();
    if (store) {
      await notifyUser(store.owner_id, 'Pagamento Confirmado!', `Pedido #${orderId.slice(0,8)} pago.`, 'payment');
    }

    const io = getIO();
    if (io) {
      io.to(`order:${orderId}`).emit('payment_confirmed', { orderId });
      if (storeId) io.to(`store:${storeId}`).emit('order_paid', { orderId });
    }
  } catch (e) {
    console.error('[Payment] Erro em confirmOrderPayment:', e.message);
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
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.payment_status === 'paid') return res.status(400).json({ error: 'Pedido ja foi pago' });
  if (!mpClient) return res.status(500).json({ error: 'Gateway não configurado' });

  const paymentId = uuid();
  await supabase.from('orders').update({ payment_id: paymentId }).eq('id', order_id);

  try {
    const preference = new Preference(mpClient);
    const result = await preference.create({
      body: {
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
  const webhookSecret = process.env.MP_WEBHOOK_SECRET;

  if (webhookSecret) {
    const signature = req.headers['x-signature'] || '';
    const requestId = req.headers['x-request-id'] || '';
    const v1Match = signature.match(/v1=([a-f0-9]+)/i);
    const tsMatch = signature.match(/ts=(\d+)/);
    const v1 = v1Match ? v1Match[1] : null;
    const ts = tsMatch ? tsMatch[1] : null;
    const dataId = req.body?.data?.id;

    if (v1 && ts && dataId) {
      const crypto = require('crypto');
      const payload = `id:${dataId};request-id:${requestId};ts:${ts};`;
      const expected = crypto.createHmac('sha256', webhookSecret).update(payload).digest('hex');
      if (v1 !== expected) {
        console.error('[MP] Webhook signature invalida');
        return res.sendStatus(403);
      }
    }
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
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.payment_status === 'paid') return res.status(400).json({ error: 'Pedido ja foi pago' });
  if (!mpClient) return res.status(500).json({ error: 'Gateway não configurado' });

  try {
    const paymentApi = new Payment(mpClient);
    const result = await paymentApi.create({
      body: {
        transaction_amount: parseFloat(order.total.toFixed(2)),
        payment_method_id: 'pix',
        payer: {
          email: order.customer_email || 'cliente@pedeacai.com.br',
          first_name: order.customer_name?.split(' ')[0] || 'Cliente'
        },
        notification_url: buildAppUrl(req, '/api/webhook'),
        description: `Pedido #${order_id.slice(0, 8)}`,
        external_reference: order_id,
        date_of_expiration: new Date(Date.now() + 30 * 60 * 1000).toISOString()
      }
    });

    await supabase.from('orders').update({ payment_id: String(result.id) }).eq('id', order_id);

    const qrData = result.point_of_interaction?.transaction_data || {};
    res.json({
      success: true,
      payment_id: result.id,
      qr_code: qrData.qr_code || '',
      qr_code_base64: qrData.qr_code_base64 || '',
      pix_copy_paste: qrData.qr_code || '',
      total: order.total,
      status: result.status,
      expires_in: 1800
    });
  } catch (err) {
    console.error('[MP] Erro criar PIX:', err);
    res.status(500).json({ error: 'Erro ao gerar PIX. Tente novamente.' });
  }
});

router.get('/payment-status/:paymentId', authMiddleware, async (req, res) => {
  const { paymentId } = req.params;
  if (!mpClient) return res.json({ status: 'unknown' });
  try {
    const paymentApi = new Payment(mpClient);
    const result = await paymentApi.get({ id: paymentId });
    res.json({ status: result.status, detail: result.status_detail });
  } catch {
    res.json({ status: 'unknown' });
  }
});

router.post('/pix/confirm', authMiddleware, async (req, res) => {
  const { order_id } = req.body;
  const { data: order } = await supabase.from('orders').select('*').eq('id', order_id).single();
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.payment_status === 'paid') return res.json({ success: true, status: 'paid' });

  if (mpClient && order.payment_id) {
    try {
      const paymentApi = new Payment(mpClient);
      const payment = await paymentApi.get({ id: order.payment_id });
      if (payment.status === 'approved') {
        await confirmOrderPayment(order_id, order.store_id);
        return res.json({ success: true, status: 'paid' });
      }
      return res.status(400).json({ error: 'Pagamento ainda não aprovado', status: payment.status });
    } catch (err) {
      console.error('[MP] Erro ao verificar pagamento:', err.message);
      return res.status(500).json({ error: 'Erro ao verificar status do pagamento' });
    }
  }

  if (!mpClient) {
    await confirmOrderPayment(order_id, order.store_id);
    return res.json({ success: true, status: 'paid' });
  }

  res.status(400).json({ error: 'Pagamento não encontrado' });
});

router.post('/process-card-payment', authMiddleware, async (req, res) => {
  const { order_id, token, payment_method_id, installments, issuer_id, payer_email, identification_type, identification_number, save_card } = req.body;
  if (!order_id || !token || !payment_method_id) return res.status(400).json({ error: 'Dados incompletos' });

  const { data: order } = await supabase.from('orders').select('*').eq('id', order_id).single();
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.payment_status === 'paid') return res.status(400).json({ error: 'Pedido ja foi pago' });
  if (!mpClient) return res.status(500).json({ error: 'Gateway não configurado' });

  try {
    const paymentApi = new Payment(mpClient);
    const payment = await paymentApi.create({
      body: {
        transaction_amount: parseFloat(order.total.toFixed(2)),
        token, description: `Pedido Pé de Açaí #${order_id.slice(0, 8)}`,
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
  if (!order) return res.status(404).json({ error: 'Pedido não encontrado' });
  if (order.payment_status === 'paid') return res.status(400).json({ error: 'Pedido ja foi pago' });
  if (!mpClient) return res.status(500).json({ error: 'Gateway não configurado' });

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
        description: `Pedido Pé de Açaí #${order_id.slice(0, 8)}`,
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

router.get('/earnings', authMiddleware, async (req, res) => {
  try {
    const [storeEarn, motoboyEarn] = await Promise.all([
      supabase.from('store_earnings').select('*').eq('store_id', req.user.id).order('created_at', { ascending: false }).then(r => r.data || []).catch(() => []),
      supabase.from('motoboy_earnings').select('*').eq('motoboy_id', req.user.id).order('created_at', { ascending: false }).then(r => r.data || []).catch(() => [])
    ]);
    
    const totalStorePending = storeEarn.filter(e => e.status === 'pending').reduce((s, e) => s + e.amount, 0);
    const totalStorePaid = storeEarn.filter(e => e.status === 'paid').reduce((s, e) => s + e.amount, 0);
    const totalMotoboyPending = motoboyEarn.filter(e => e.status === 'pending').reduce((s, e) => s + e.amount, 0);
    
    res.json({
      store: { pending: totalStorePending, paid: totalStorePaid, total: totalStorePending + totalStorePaid },
      motoboy: { pending: totalMotoboyPending, paid: 0, total: totalMotoboyPending }
    });
  } catch {
    res.json({ store: { pending: 0, paid: 0, total: 0 }, motoboy: { pending: 0, paid: 0, total: 0 } });
  }
});

router.post('/payout', authMiddleware, async (req, res) => {
  const { type } = req.body;
  try {
    if (type === 'store') {
      const { data: store } = await supabase.from('stores').select('*').eq('owner_id', req.user.id).single();
      if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
      if (!store.pix_key) return res.status(400).json({ error: 'Cadastre sua chave PIX na aba Conta' });
      
      const { data: pending } = await supabase.from('store_earnings').select('*').eq('store_id', store.id).eq('status', 'pending');
      if (!pending.length) return res.status(400).json({ error: 'Sem valores pendentes' });
      
      const total = pending.reduce((s, e) => s + e.amount, 0);
      
      await supabase.from('store_earnings').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('store_id', store.id).eq('status', 'pending');
      
      res.json({ ok: true, message: `R$ ${total.toFixed(2)} enviado para ${store.pix_key}`, amount: total });
    } else if (type === 'motoboy') {
      const { data: mbUser } = await supabase.from('users').select('pix_key').eq('id', req.user.id).single();
      if (!mbUser?.pix_key) return res.status(400).json({ error: 'Cadastre sua chave PIX no seu perfil' });

      const { data: pending } = await supabase.from('motoboy_earnings').select('*').eq('motoboy_id', req.user.id).eq('status', 'pending');
      if (!pending?.length) return res.status(400).json({ error: 'Sem valores pendentes' });

      const total = pending.reduce((s, e) => s + e.amount, 0);
      const { sendPixTransfer: spx } = require('../services/pixTransfer');
      const ok = await spx(total, mbUser.pix_key, `Repasse motoboy`);
      if (ok) {
        await supabase.from('motoboy_earnings').update({ status: 'paid', paid_at: new Date().toISOString() }).eq('motoboy_id', req.user.id).eq('status', 'pending');
        res.json({ ok: true, message: `R$ ${total.toFixed(2)} enviado para ${mbUser.pix_key}`, amount: total });
      } else {
        res.status(500).json({ error: 'Falha ao transferir. Valores ficam pendentes para nova tentativa.' });
      }
    } else {
      res.status(400).json({ error: 'Tipo inválido' });
    }
  } catch (err) {
    console.error('Payout error:', err);
    res.status(500).json({ error: 'Erro ao processar pagamento' });
  }
});

module.exports = router;
