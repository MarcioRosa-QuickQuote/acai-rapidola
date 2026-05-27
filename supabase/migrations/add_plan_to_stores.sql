-- Adicionar campo de plano de assinatura na tabela stores
-- Execute este SQL no Supabase SQL Editor

ALTER TABLE stores ADD COLUMN IF NOT EXISTS plan TEXT NOT NULL DEFAULT 'basico';

-- Para ativar Premium manualmente em uma loja:
-- UPDATE stores SET plan = 'premium' WHERE id = '<store_id>';
