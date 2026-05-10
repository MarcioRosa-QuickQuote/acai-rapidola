const express = require('express');
const http = require('http');
const cors = require('cors');
const path = require('path');

const { initSocket } = require('./services/socket');

const authRoutes = require('./routes/auth');
const productRoutes = require('./routes/products');
const storeRoutes = require('./routes/stores');
const orderRoutes = require('./routes/orders');
const motoboyRoutes = require('./routes/motoboy');
const paymentRoutes = require('./routes/payment');

require('./database');

const app = express();
const server = http.createServer(app);
initSocket(server);

app.use(cors());
app.use(express.json());

const uploadsPath = path.join(__dirname, '..', 'uploads');
const fs = require('fs');
if (!fs.existsSync(uploadsPath)) fs.mkdirSync(uploadsPath, { recursive: true });
app.use('/uploads', express.static(uploadsPath));

app.use('/api/auth', authRoutes);
app.use('/api/products', productRoutes);
app.use('/api/stores', storeRoutes);
app.use('/api/orders', orderRoutes);
app.use('/api/motoboy', motoboyRoutes);
app.use('/api', paymentRoutes);

const clientDist = path.join(__dirname, '..', '..', 'client', 'dist');
app.use(express.static(clientDist));
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  Açaí Rapidola - Servidor rodando!`);
  console.log(`  Porta: ${PORT}`);
  console.log(`  API: http://localhost:${PORT}/api`);
  console.log(`  WebSocket: ws://localhost:${PORT}`);
  console.log(`========================================\n`);
});
