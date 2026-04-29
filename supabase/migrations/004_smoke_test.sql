-- ============================================================================
-- PAA - Smoke Test pós-Migration 004
-- ----------------------------------------------------------------------------
-- Roda após aplicar 004_normalize_customer_columns_snake_case.sql para validar:
--   1) Todas as 4 colunas alvo estão em snake_case
--   2) Nenhuma coluna camelCase remanescente em customers
--   3) INSERT canário não falha com PGRST/coluna inexistente
--   4) Trigger updated_at dispara corretamente
--
-- Este script é seguro em produção (INSERT é envolvido em ROLLBACK).
-- ============================================================================

-- ----------------------------------------------------------------------------
-- TEST 1: Listar colunas atuais de customers
-- Esperado: 9 linhas em snake_case (id, channel, channel_user_id, name,
--           email, phone, guru_subscription_id, asaas_customer_id,
--           created_at, updated_at)
-- ----------------------------------------------------------------------------
SELECT column_name, data_type
  FROM information_schema.columns
 WHERE table_schema = 'public' AND table_name = 'customers'
 ORDER BY ordinal_position;

-- ----------------------------------------------------------------------------
-- TEST 2: Confirmar zero colunas camelCase (lowercase artifacts)
-- Esperado: 0 linhas
-- ----------------------------------------------------------------------------
SELECT column_name
  FROM information_schema.columns
 WHERE table_schema = 'public'
   AND table_name = 'customers'
   AND column_name IN ('asaascustomerid', 'gurusubscriptionid', 'createdat', 'updatedat', 'channeluserid');

-- ----------------------------------------------------------------------------
-- TEST 3: INSERT canário + verificação do trigger updated_at
-- ----------------------------------------------------------------------------
BEGIN;

INSERT INTO public.customers (channel, channel_user_id, name)
VALUES ('telegram', '__smoke_test_004__', 'Smoke Test Migration 004')
RETURNING
  id,
  channel,
  channel_user_id,
  name,
  asaas_customer_id,
  guru_subscription_id,
  created_at,
  updated_at;

-- Forçar update pra disparar o trigger
UPDATE public.customers
   SET name = 'Smoke Test Updated'
 WHERE channel_user_id = '__smoke_test_004__'
RETURNING name, created_at, updated_at;
-- Esperado: updated_at > created_at

ROLLBACK;

-- ----------------------------------------------------------------------------
-- TEST 4: Verificar índices recriados
-- Esperado: idx_customers_guru e idx_customers_asaas presentes
-- ----------------------------------------------------------------------------
SELECT indexname, indexdef
  FROM pg_indexes
 WHERE schemaname = 'public'
   AND tablename = 'customers'
 ORDER BY indexname;
