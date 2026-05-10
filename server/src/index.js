const { app, createServer } = require('./app');

const server = createServer(app);

const PORT = process.env.PORT || 3001;
server.listen(PORT, '0.0.0.0', () => {
  console.log(`\n========================================`);
  console.log(`  Açaí Rapidola - Servidor rodando!`);
  console.log(`  Porta: ${PORT}`);
  console.log(`  API: http://localhost:${PORT}/api`);
  console.log(`  WebSocket: ws://localhost:${PORT}`);
  console.log(`========================================\n`);
});
