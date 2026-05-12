const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

const isVercel = !!process.env.VERCEL;

const { initSocket } = require('./services/socket');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const storeRoutes = require('./routes/stores');
const orderRoutes = require('./routes/orders');
const motoboyRoutes = require('./routes/motoboy');
const paymentRoutes = require('./routes/payment');

const { supabase } = require('./database');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stores', storeRoutes);

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
    return res.json({ ok: false, message: 'Loja nao encontrada' });
  }

  if (existing) return res.json({ ok: true, message: 'Ja configurado. Use ?force=1 para recriar produtos.' });

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

if (!isVercel) {
  const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
  app.use(express.static(clientDist));
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
