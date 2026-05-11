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

require('./database');

const app = express();

app.use(cors());
app.use(express.json());

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stores', storeRoutes);
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
