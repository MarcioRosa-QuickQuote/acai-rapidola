-- ============================================================
-- MIGRAÇÃO: Admin + Assinaturas Premium
-- Rodar no Supabase SQL Editor (uma vez)
-- https://bfjpvexbcjtyidhqokuo.supabase.co
-- ============================================================

-- 1. Adicionar role 'admin' à constraint de usuários
ALTER TABLE users DROP CONSTRAINT IF EXISTS users_role_check;
ALTER TABLE users ADD CONSTRAINT users_role_check
  CHECK(role IN ('customer', 'store', 'motoboy', 'admin'));

-- 2. Garantir campo 'plan' na tabela stores
ALTER TABLE stores ADD COLUMN IF NOT EXISTS plan TEXT DEFAULT 'basico';

-- 3. Garantir campo 'premium_until' na tabela stores
ALTER TABLE stores ADD COLUMN IF NOT EXISTS premium_until TIMESTAMPTZ DEFAULT NULL;

-- 4. Criar tabela de logs de assinatura
CREATE TABLE IF NOT EXISTS subscription_logs (
  id TEXT PRIMARY KEY DEFAULT gen_random_uuid()::text,
  store_id TEXT NOT NULL REFERENCES stores(id),
  admin_id TEXT NOT NULL REFERENCES users(id),
  action TEXT NOT NULL,
  -- 'grant_premium' | 'revoke_premium' | 'set_permanent_premium' | 'activate' | 'deactivate'
  days INTEGER DEFAULT NULL,
  note TEXT DEFAULT '',
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- 5. (Opcional) Inicializar plan = 'basico' para lojas que ainda não têm
UPDATE stores SET plan = 'basico' WHERE plan IS NULL;

-- ============================================================
-- APÓS rodar o SQL, crie o usuário admin via API:
--
--   POST /api/admin/setup
--   Body: { "secret": "<ADMIN_SETUP_SECRET>", "name": "Marcio Admin",
--           "phone": "SEU_TELEFONE", "password": "SUA_SENHA" }
--
-- Onde ADMIN_SETUP_SECRET é a variável de ambiente que você
-- definiu no Render (Settings → Environment Variables).
-- ============================================================
