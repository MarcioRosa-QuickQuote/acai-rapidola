-- Entregador approval flow
ALTER TABLE users ADD COLUMN IF NOT EXISTS plate TEXT DEFAULT '';
ALTER TABLE users ADD COLUMN IF NOT EXISTS selfie_url TEXT DEFAULT '';
-- 'approved' por padrão para não afetar usuários existentes
ALTER TABLE users ADD COLUMN IF NOT EXISTS approval_status TEXT DEFAULT 'approved';
ALTER TABLE users ADD COLUMN IF NOT EXISTS rejection_reason TEXT DEFAULT '';

CREATE TABLE IF NOT EXISTS app_settings (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);
INSERT INTO app_settings (key, value) VALUES ('auto_approve_motoboy', 'false') ON CONFLICT DO NOTHING;
