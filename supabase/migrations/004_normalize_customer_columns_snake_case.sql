-- ============================================================================
-- PLATAFORMA DE ATENDIMENTO ARTIFICIALl (PAA)
-- Migration: 004_normalize_customer_columns_snake_case
-- Data: 2026-04-29
-- ----------------------------------------------------------------------------
-- Objetivo:
--   Corrigir bug PGRST204 em createCustomer. A migration 003 renomeou somente
--   channelUserId → channel_user_id na tabela `customers`. As colunas restantes
--   (asaasCustomerId, guruSubscriptionId, createdAt, updatedAt) seguiram em
--   camelCase (que o Postgres armazena em lowercase: asaascustomerid, etc.),
--   enquanto o código da aplicação usa snake_case. INSERTs via PostgREST
--   falham com:
--       PGRST204 — Could not find the 'asaas_customer_id' column of 'customers'
--
-- Escopo: APENAS tabela customers + função update_updated_at_column().
--   Outras tabelas em camelCase (tickets, messages, handoffs, alerts,
--   agent_logs, agents) NÃO são tocadas aqui — fora de escopo deste fix.
--
-- Idempotente: usa IF EXISTS no information_schema (column_name é lowercase
--              após folding do Postgres em identifiers não-quoted).
-- Reversível: ver 004_rollback.sql.
-- ============================================================================

BEGIN;

-- ----------------------------------------------------------------------------
-- 1) Renomear colunas legadas para snake_case
-- ----------------------------------------------------------------------------

-- Comparação case-insensitive (LOWER) cobre tanto identifiers quoted que
-- preservam case (asaasCustomerId) quanto unquoted que sofrem folding
-- (asaascustomerid).

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND LOWER(column_name) = 'asaascustomerid'
  ) THEN
    ALTER TABLE public.customers RENAME COLUMN "asaasCustomerId" TO asaas_customer_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND LOWER(column_name) = 'gurusubscriptionid'
  ) THEN
    ALTER TABLE public.customers RENAME COLUMN "guruSubscriptionId" TO guru_subscription_id;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND LOWER(column_name) = 'createdat'
  ) THEN
    ALTER TABLE public.customers RENAME COLUMN "createdAt" TO created_at;
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND LOWER(column_name) = 'updatedat'
  ) THEN
    ALTER TABLE public.customers RENAME COLUMN "updatedAt" TO updated_at;
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 2) Recriar índices condicionalmente (apenas se a coluna alvo existir)
--    Em ambientes onde a 003 já cobriu parte das renomeações ou onde a
--    coluna nunca foi criada, pulamos o índice silenciosamente.
-- ----------------------------------------------------------------------------

DROP INDEX IF EXISTS idx_customers_guru;
DROP INDEX IF EXISTS idx_customers_asaas;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'guru_subscription_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_customers_guru
             ON public.customers(guru_subscription_id)
             WHERE guru_subscription_id IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND column_name = 'asaas_customer_id'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_customers_asaas
             ON public.customers(asaas_customer_id)
             WHERE asaas_customer_id IS NOT NULL';
  END IF;
END $$;

-- ----------------------------------------------------------------------------
-- 3) Substituir trigger function update_updated_at_column()
--    A versão antiga (migration 001, linha 172) usa NEW.updatedAt, que vai
--    quebrar em runtime após o RENAME. CREATE OR REPLACE atualiza in-place
--    sem precisar dropar o trigger customers_updated_at.
--
--    Atenção: essa função é GENÉRICA e poderia ser usada por outras tabelas.
--    Verificação: no schema atual, só `customers` tem essa coluna em
--    camelCase + trigger nessa função. Se no futuro outra tabela usar a
--    mesma função antes de ser normalizada, vai quebrar. Documentar.
-- ----------------------------------------------------------------------------

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- ----------------------------------------------------------------------------
-- 4) Forçar reload do schema cache do PostgREST (canal oficial Supabase)
-- ----------------------------------------------------------------------------

NOTIFY pgrst, 'reload schema';

COMMIT;
