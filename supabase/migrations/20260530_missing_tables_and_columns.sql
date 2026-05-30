-- Tabelas de ganhos (usadas pelo backend ao marcar pedido como entregue)
CREATE TABLE IF NOT EXISTS motoboy_earnings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  motoboy_id TEXT NOT NULL REFERENCES users(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS store_earnings (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES stores(id),
  order_id TEXT NOT NULL REFERENCES orders(id),
  amount REAL NOT NULL,
  status TEXT NOT NULL DEFAULT 'pending' CHECK(status IN ('pending','paid','cancelled')),
  paid_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Colunas faltando na tabela users
ALTER TABLE users ADD COLUMN IF NOT EXISTS email TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS cpf TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS vehicle_type TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS whatsapp TEXT DEFAULT '';

-- Coluna delivery_fee na tabela orders
ALTER TABLE orders ADD COLUMN IF NOT EXISTS delivery_fee REAL DEFAULT 0;

-- Coluna pix_key nas lojas
ALTER TABLE stores ADD COLUMN IF NOT EXISTS pix_key TEXT DEFAULT '';

-- Colunas extras de stores
ALTER TABLE stores ADD COLUMN IF NOT EXISTS description TEXT DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS phone TEXT DEFAULT '';
ALTER TABLE stores ADD COLUMN IF NOT EXISTS banner TEXT DEFAULT '';
