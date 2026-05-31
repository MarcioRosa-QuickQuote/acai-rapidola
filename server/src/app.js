const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');
const rateLimit = require('express-rate-limit');

const isVercel = !!process.env.VERCEL;

const { initSocket } = require('./services/socket');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const storeRoutes = require('./routes/stores');
const orderRoutes = require('./routes/orders');
const motoboyRoutes = require('./routes/motoboy');
const paymentRoutes = require('./routes/payment');
const messageRoutes = require('./routes/messages');
const adminRoutes = require('./routes/admin');

const { supabase } = require('./database');

const app = express();

app.use(cors());
app.use((req, res, next) => {
  res.setHeader('Cross-Origin-Opener-Policy', 'same-origin-allow-popups');
  next();
});
app.use(express.json({ limit: '500kb' }));

const limiterApi = rateLimit({ windowMs: 60000, max: 100, message: { error: 'Muitas requisições. Tente novamente em instantes.' } });
const limiterAuth = rateLimit({ windowMs: 60000, max: 20, message: { error: 'Muitas tentativas. Aguarde um momento.' } });
const limiterWebhook = rateLimit({ windowMs: 60000, max: 60 });

app.use('/api/auth', limiterAuth);
app.use('/api', limiterApi);
app.use('/api/webhook', limiterWebhook);

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stores', storeRoutes);

// Proxy Mapbox Directions — evita CORS e centraliza o token no servidor
app.get('/api/route', (req, res) => {
  const { fLng, fLat, tLng, tLat } = req.query;
  if (!fLng || !fLat || !tLng || !tLat) return res.status(400).json({ error: 'coords missing' });
  const token = process.env.MAPBOX_TOKEN;
  if (!token) return res.status(503).json({ error: 'routing not configured' });
  const https = require('https');
  const url = `https://api.mapbox.com/directions/v5/mapbox/driving/${fLng},${fLat};${tLng},${tLat}?geometries=geojson&overview=full&steps=true&access_token=${token}`;
  https.get(url, resp => {
    let raw = '';
    resp.on('data', c => { raw += c; });
    resp.on('end', () => {
      try { res.json(JSON.parse(raw)); } catch { res.status(502).json({ error: 'routing unavailable' }); }
    });
  }).on('error', () => res.status(502).json({ error: 'routing unavailable' }));
});

app.get('/api/setup', async (req, res) => {
  const bcrypt = require('bcryptjs');
  const { v4: uuid } = require('uuid');

  async function seedProductsForStore(storeId) {
    const products = [
      ['Açai 500ml (Meio Litro)', 'Açai feito da polpa', 25.00, 500, '/a%C3%A7a%C3%AD%20500ml.png'],
      ['Açai 1 Litro', 'Açai feito da polpa', 45.00, 1000, '/a%C3%A7ai%201%20litro.png'],
      ['Farinha de Tapioca', 'Acompanhamento tradicional — farinha de tapioca', 5.00, 100, '/farinha%20de%20tapioca.png'],
      ['Farinha D\'água', 'Farinha d\'água típica do Pará', 6.00, 100, '/Farinha%20dagua.png'],
    ];
    await supabase.from('products').insert(
      products.map(([name, description, price, size_ml, image]) => ({
        id: uuid(), store_id: storeId, name, description, price, size_ml, image
      }))
    );
  }

  const { data: existing } = await supabase.from('users').select('id').eq('phone', 'admin').single();
  const force = req.query.force === '1';

  if (existing && force) {
    const { data: store } = await supabase.from('stores').select('id').eq('owner_id', existing.id).single();
    if (store) {
      await supabase.from('products').delete().eq('store_id', store.id);
      await seedProductsForStore(store.id);
      return res.json({ ok: true, message: 'Produtos recriados com imagens!' });
    }
    return res.json({ ok: false, message: 'Loja não encontrada' });
  }

  if (existing) return res.json({ ok: true, message: 'Já configurado. Use ?force=1 para recriar produtos.' });

  const adminId = uuid();
  const storeId = uuid();
  const motoboyId = uuid();
  const customerId = uuid();
  const hash = bcrypt.hashSync('123456', 10);

  await supabase.from('users').insert([
    { id: adminId, name: 'Dono da Loja', phone: 'admin', password_hash: hash, role: 'store' },
    { id: motoboyId, name: 'Joao Motoboy', phone: 'motoboy', password_hash: hash, role: 'motoboy' },
    { id: customerId, name: 'Maria Cliente', phone: 'cliente', password_hash: hash, role: 'customer' }
  ]);

  await supabase.from('stores').insert({
    id: storeId, name: 'Açaí do Chefe', owner_id: adminId,
    address: 'Rua do Acai, 100 - Centro, Sao Paulo',
    lat: -23.5505, lng: -46.6333
  });

  await supabase.from('motoboy_locations').upsert(
    { motoboy_id: motoboyId, lat: -23.5510, lng: -46.6340, online: 1 },
    { onConflict: 'motoboy_id' }
  );

  await seedProductsForStore(storeId);

  res.json({ ok: true, message: 'Configurado! admin/123456, motoboy/123456, cliente/123456' });
});
app.use('/api/orders', orderRoutes);
app.use('/api/motoboy', motoboyRoutes);
app.use('/api', paymentRoutes);
app.use('/api/messages', messageRoutes);
app.use('/api/admin', adminRoutes);

app.use((err, req, res, next) => {
  console.error('[Server] Erro:', err?.message || err);
  const msg = err?.type === 'entity.parse.failed' ? 'Formato de dados inválido. Envie JSON válido.' : err?.message?.includes('rate limit') ? 'Muitas requisições.' : null;
  res.status(err?.status || 500).json({ error: msg || 'Erro interno. Tente novamente.' });
});

if (!isVercel) {
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  const publicDir = path.join(__dirname, '..', '..', 'public');
  app.use(express.static(clientDist));
  app.use(express.static(publicDir));
  // Digital Asset Links para TWA Android (Play Store)
  app.get('/.well-known/assetlinks.json', (req, res) => {
    res.setHeader('Content-Type', 'application/json');
    res.sendFile(path.join(clientDist, '.well-known', 'assetlinks.json'));
  });
  app.get('*', (req, res) => {
    res.sendFile(path.join(clientDist, 'index.html'));
  });
}

function createServer(app) {
  const server = http.createServer(app);
  initSocket(server);
  return server;
}

module.exports = { app, createServer, isVercel };
