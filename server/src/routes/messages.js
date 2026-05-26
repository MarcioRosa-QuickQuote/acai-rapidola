const { Router } = require('express');
const { v4: uuid } = require('uuid');
const { supabase } = require('../database');
const { authMiddleware } = require('../auth');
const { sanitize } = require('../helpers');

const router = Router();

router.post('/', authMiddleware, async (req, res) => {
  const { store_id, message } = req.body;
  const customerId = req.user.id;
  const customerName = req.user.name || 'Cliente';
  if (!store_id || !message) return res.status(400).json({ error: 'store_id e message são obrigatórios' });
  const cleanMsg = sanitize(message, 1000);
  if (!cleanMsg) return res.status(400).json({ error: 'Mensagem inválida' });

  const { data: store } = await supabase.from('stores').select('id, owner_id').eq('id', store_id).single();
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });

  const id = uuid();
  const { error: insertError } = await supabase.from('messages').insert({
    id, store_id, customer_id: customerId, customer_name: customerName, message: cleanMsg, from_store: 0
  });
  if (insertError) {
    console.error('[Messages] Insert error:', insertError);
    if (insertError.code === '42P01') return res.status(500).json({ error: 'Tabela de mensagens não encontrada. Execute o setup.sql no Supabase.' });
    return res.status(500).json({ error: 'Erro ao enviar mensagem' });
  }

  try {
    const notifId = uuid();
    await supabase.from('notifications').insert({
      id: notifId, user_id: store.owner_id,
      title: 'Nova mensagem',
      body: `${customerName}: ${cleanMsg}`,
      type: 'message'
    });
    const { getIO } = require('../services/socket');
    const io = getIO();
    if (io) {
      for (const [socketId, socket] of io.sockets.sockets) {
        if (socket.userId === store.owner_id) {
          socket.emit('notification', { id: notifId, title: 'Nova mensagem', body: `${customerName}: ${cleanMsg}`, type: 'message' });
        }
      }
    }
  } catch {}

  res.json({ ok: true, id });
});

router.post('/reply', authMiddleware, async (req, res) => {
  const { customer_id, store_id, message } = req.body;
  const storeName = req.user.name || 'Loja';
  if (!customer_id || !store_id || !message) return res.status(400).json({ error: 'customer_id, store_id e message são obrigatórios' });
  const cleanMsg = sanitize(message, 1000);
  if (!cleanMsg) return res.status(400).json({ error: 'Mensagem inválida' });

  const { data: store } = await supabase.from('stores').select('id, owner_id').eq('id', store_id).single();
  if (!store || store.owner_id !== req.user.id) return res.status(403).json({ error: 'Acesso negado' });

  const id = uuid();
  const { error } = await supabase.from('messages').insert({
    id, store_id, customer_id, customer_name: storeName, message: cleanMsg, from_store: 1
  });
  if (error) {
    console.error('[Messages] Reply error:', error);
    return res.status(500).json({ error: 'Erro ao responder' });
  }

  try {
    const notifId = uuid();
    await supabase.from('notifications').insert({
      id: notifId, user_id: customer_id,
      title: 'Resposta da loja',
      body: `${storeName}: ${cleanMsg}`,
      type: 'message'
    });
    const { getIO } = require('../services/socket');
    const io = getIO();
    if (io) {
      for (const [socketId, socket] of io.sockets.sockets) {
        if (socket.userId === customer_id) {
          socket.emit('notification', { id: notifId, title: 'Resposta da loja', body: `${storeName}: ${cleanMsg}`, type: 'message' });
        }
      }
    }
  } catch {}

  res.json({ ok: true, id });
});

router.get('/:storeId', authMiddleware, async (req, res) => {
  const { storeId } = req.params;
  const { data: store } = await supabase.from('stores').select('id, owner_id').eq('id', storeId).single();
  if (!store) return res.status(404).json({ error: 'Loja não encontrada' });
  if (store.owner_id !== req.user.id) return res.status(403).json({ error: 'Acesso negado' });

  const { data } = await supabase.from('messages')
    .select('*')
    .eq('store_id', storeId)
    .order('created_at', { ascending: false })
    .limit(100);
  res.json({ data: data || [] });
});

router.patch('/:id/read', authMiddleware, async (req, res) => {
  const { id } = req.params;
  const { data: msg } = await supabase.from('messages').select('id, store_id').eq('id', id).single();
  if (!msg) return res.status(404).json({ error: 'Mensagem não encontrada' });

  const { data: store } = await supabase.from('stores').select('owner_id').eq('id', msg.store_id).single();
  if (!store || store.owner_id !== req.user.id) return res.status(403).json({ error: 'Acesso negado' });

  await supabase.from('messages').update({ read: 1 }).eq('id', id);
  res.json({ ok: true });
});

module.exports = router;
