-- Copie e cole este script no SQL Editor do Supabase (SQL Editor -> New Query)
-- https://bfjpvexbcjtyidhqokuo.supabase.co

CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  phone TEXT UNIQUE NOT NULL,
  password_hash TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('customer','store','motoboy')),
  address TEXT DEFAULT '',
  lat REAL DEFAULT NULL,
  lng REAL DEFAULT NULL,
  photo_url TEXT DEFAULT '',
  pix_key TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS stores (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  name TEXT NOT NULL,
  owner_id TEXT NOT NULL REFERENCES users(id),
  address TEXT NOT NULL,
  lat REAL NOT NULL DEFAULT -23.5505,
  lng REAL NOT NULL DEFAULT -46.6333,
  open INTEGER NOT NULL DEFAULT 1,
  subscription_active INTEGER NOT NULL DEFAULT 1,
  logo TEXT DEFAULT '',
  color_primary TEXT DEFAULT '#6A1B9A',
  color_secondary TEXT DEFAULT '#4A148C',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS products (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES stores(id),
  name TEXT NOT NULL,
  description TEXT DEFAULT '',
  price REAL NOT NULL,
  size_ml INTEGER NOT NULL,
  image TEXT DEFAULT '',
  active INTEGER DEFAULT 1
);

CREATE TABLE IF NOT EXISTS orders (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  customer_id TEXT NOT NULL REFERENCES users(id),
  store_id TEXT NOT NULL REFERENCES stores(id),
  motoboy_id TEXT REFERENCES users(id),
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
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  estimated_delivery INTEGER
);

CREATE TABLE IF NOT EXISTS order_items (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  order_id TEXT NOT NULL REFERENCES orders(id),
  product_id TEXT NOT NULL REFERENCES products(id),
  quantity INTEGER NOT NULL DEFAULT 1,
  unit_price REAL NOT NULL
);

CREATE TABLE IF NOT EXISTS motoboy_locations (
  motoboy_id TEXT PRIMARY KEY REFERENCES users(id),
  lat REAL NOT NULL,
  lng REAL NOT NULL,
  online INTEGER DEFAULT 1,
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS delivery_routes (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  motoboy_id TEXT NOT NULL REFERENCES users(id),
  route_order TEXT NOT NULL,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS notifications (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  user_id TEXT NOT NULL REFERENCES users(id),
  title TEXT NOT NULL,
  body TEXT NOT NULL,
  type TEXT DEFAULT 'info',
  read INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_motoboys (
  store_id TEXT NOT NULL REFERENCES stores(id),
  motoboy_id TEXT NOT NULL REFERENCES users(id),
  employee INTEGER DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  PRIMARY KEY (store_id, motoboy_id)
);

CREATE TABLE IF NOT EXISTS store_invites (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES stores(id),
  phone TEXT NOT NULL,
  token TEXT UNIQUE NOT NULL,
  used INTEGER DEFAULT 0,
  motoboy_id TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Storage bucket para uploads
INSERT INTO storage.buckets (id, name, public)
VALUES ('uploads', 'uploads', true)
ON CONFLICT (id) DO NOTHING;

-- Política pública para leitura de uploads
CREATE POLICY IF NOT EXISTS "Public uploads" ON storage.objects
  FOR SELECT USING (bucket_id = 'uploads');

-- Política para inserção autenticada
CREATE POLICY IF NOT EXISTS "Auth insert uploads" ON storage.objects
  FOR INSERT WITH CHECK (bucket_id = 'uploads');

-- Colunas adicionadas posteriormente (rodar se necessario):
CREATE TABLE IF NOT EXISTS password_reset_codes (
  phone TEXT PRIMARY KEY,
  code TEXT NOT NULL,
  expires TIMESTAMPTZ NOT NULL,
  used INTEGER NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ DEFAULT NOW()
);
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS pix_key TEXT DEFAULT '';
-- ALTER TABLE stores ADD COLUMN IF NOT EXISTS pix_key TEXT DEFAULT '';
-- ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp TEXT DEFAULT '';
