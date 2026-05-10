const Database = require('better-sqlite3');
const path = require('path');
const bcrypt = require('bcryptjs');
const { v4: uuid } = require('uuid');
const fs = require('fs');

const isVercel = !!process.env.VERCEL;

const dataDir = isVercel
  ? '/tmp/data'
  : path.join(__dirname, '..', 'data');

const DB_PATH = path.join(dataDir, 'acai.db');

if (!fs.existsSync(dataDir)) fs.mkdirSync(dataDir, { recursive: true });

const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

function init() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS users (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      phone TEXT UNIQUE NOT NULL,
      password_hash TEXT NOT NULL,
      role TEXT NOT NULL CHECK(role IN ('customer','store','motoboy')),
      address TEXT DEFAULT '',
      lat REAL DEFAULT NULL,
      lng REAL DEFAULT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS stores (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      owner_id TEXT NOT NULL,
      address TEXT NOT NULL,
      lat REAL NOT NULL DEFAULT -23.5505,
      lng REAL NOT NULL DEFAULT -46.6333,
      open INTEGER NOT NULL DEFAULT 1,
      subscription_active INTEGER NOT NULL DEFAULT 1,
      logo TEXT DEFAULT '',
      color_primary TEXT DEFAULT '#6A1B9A',
      color_secondary TEXT DEFAULT '#4A148C',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (owner_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      store_id TEXT NOT NULL,
      name TEXT NOT NULL,
      description TEXT DEFAULT '',
      price REAL NOT NULL,
      size_ml INTEGER NOT NULL,
      image TEXT DEFAULT '',
      active INTEGER DEFAULT 1,
      FOREIGN KEY (store_id) REFERENCES stores(id)
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      customer_id TEXT NOT NULL,
      store_id TEXT NOT NULL,
      motoboy_id TEXT,
      status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN (
        'pending','confirmed','preparing','ready','assigned',
        'picked_up','in_transit','arriving','delivered','cancelled'
      )),
      total REAL NOT NULL,
      payment_status TEXT NOT NULL DEFAULT 'pending' CHECK(payment_status IN ('pending','paid','refunded')),
      payment_id TEXT,
      customer_address TEXT NOT NULL,
      customer_lat REAL DEFAULT -23.55,
      customer_lng REAL DEFAULT -46.63,
      notes TEXT DEFAULT '',
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      estimated_delivery INTEGER,
      FOREIGN KEY (customer_id) REFERENCES users(id),
      FOREIGN KEY (store_id) REFERENCES stores(id),
      FOREIGN KEY (motoboy_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS order_items (
      id TEXT PRIMARY KEY,
      order_id TEXT NOT NULL,
      product_id TEXT NOT NULL,
      quantity INTEGER NOT NULL DEFAULT 1,
      unit_price REAL NOT NULL,
      FOREIGN KEY (order_id) REFERENCES orders(id),
      FOREIGN KEY (product_id) REFERENCES products(id)
    );

    CREATE TABLE IF NOT EXISTS motoboy_locations (
      motoboy_id TEXT PRIMARY KEY,
      lat REAL NOT NULL,
      lng REAL NOT NULL,
      online INTEGER DEFAULT 1,
      updated_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (motoboy_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS delivery_routes (
      id TEXT PRIMARY KEY,
      motoboy_id TEXT NOT NULL,
      route_order TEXT NOT NULL,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (motoboy_id) REFERENCES users(id)
    );

    CREATE TABLE IF NOT EXISTS notifications (
      id TEXT PRIMARY KEY,
      user_id TEXT NOT NULL,
      title TEXT NOT NULL,
      body TEXT NOT NULL,
      type TEXT DEFAULT 'info',
      read INTEGER DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      FOREIGN KEY (user_id) REFERENCES users(id)
    );
  `);
}

function seed() {
  const adminExists = db.prepare('SELECT id FROM users WHERE phone = ?').get('admin');
  if (adminExists) return;

  const adminId = uuid();
  const storeId = uuid();
  const motoboyId = uuid();
  const customerId = uuid();
  const hash = bcrypt.hashSync('123456', 10);

  const insertUser = db.prepare(
    'INSERT INTO users (id, name, phone, password_hash, role) VALUES (?, ?, ?, ?, ?)'
  );

  insertUser.run(adminId, 'Loja Central do Açaí', 'admin', hash, 'store');
  insertUser.run(motoboyId, 'João Motoboy', 'motoboy', hash, 'motoboy');
  insertUser.run(customerId, 'Maria Cliente', 'cliente', hash, 'customer');

  db.prepare(
    'INSERT INTO stores (id, name, owner_id, address, lat, lng) VALUES (?, ?, ?, ?, ?, ?)'
  ).run(storeId, 'Açaí Central', adminId, 'Rua do Açaí, 100 - Centro, São Paulo', -23.5505, -46.6333);

  const products = [
    ['Açaí 300ml Tradicional', 'Açaí puro batido com xarope de guaraná', 15.00, 300],
    ['Açaí 500ml Tradicional', 'Açaí puro batido com xarope de guaraná', 22.00, 500],
    ['Açaí 700ml Tradicional', 'Açaí puro batido com xarope de guaraná', 28.00, 700],
    ['Açaí 300ml Premium', 'Açaí com banana, granola e leite condensado', 20.00, 300],
    ['Açaí 500ml Premium', 'Açaí com banana, granola e leite condensado', 28.00, 500],
    ['Açaí 700ml Premium', 'Açaí com banana, granola e leite condensado', 35.00, 700],
    ['Copo 400ml Energia', 'Açaí com guaraná em pó, paçoca e mel', 25.00, 400],
    ['Copo 500ml Proteína', 'Açaí com whey protein, banana e pasta de amendoim', 32.00, 500],
    ['Açaí na Tigela P', 'Açaí com morango, banana, granola e leite em pó', 18.00, 300],
    ['Açaí na Tigela G', 'Açaí com morango, banana, granola e leite em pó', 26.00, 500],
  ];

  const insertProduct = db.prepare(
    'INSERT INTO products (id, store_id, name, description, price, size_ml) VALUES (?, ?, ?, ?, ?, ?)'
  );

  for (const [name, desc, price, size] of products) {
    insertProduct.run(uuid(), storeId, name, desc, price, size);
  }

  db.prepare(
    'INSERT INTO motoboy_locations (motoboy_id, lat, lng, online) VALUES (?, ?, ?, ?)'
  ).run(motoboyId, -23.5510, -46.6340, 1);

  console.log('[DB] Dados de exemplo inseridos.');
  console.log('[DB] Usuários:');
  console.log('  Loja:  admin / 123456');
  console.log('  Motoboy: motoboy / 123456');
  console.log('  Cliente: cliente / 123456');
}

function migrate() {
  const cols = db.prepare("PRAGMA table_info('users')").all().map(c => c.name);
  if (!cols.includes('address')) {
    db.exec("ALTER TABLE users ADD COLUMN address TEXT DEFAULT ''");
    db.exec('ALTER TABLE users ADD COLUMN lat REAL DEFAULT NULL');
    db.exec('ALTER TABLE users ADD COLUMN lng REAL DEFAULT NULL');
    console.log('[DB] Migração: colunas address/lat/lng adicionadas à users.');
  }
}

init();
migrate();
seed();

module.exports = db;
