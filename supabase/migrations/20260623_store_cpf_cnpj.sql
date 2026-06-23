-- Coluna CPF/CNPJ na tabela stores
ALTER TABLE stores ADD COLUMN IF NOT EXISTS cpf_cnpj TEXT DEFAULT '';
