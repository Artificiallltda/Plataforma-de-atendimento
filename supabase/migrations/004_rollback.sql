-- ============================================================================
-- PAA - Rollback da Migration 004
-- ----------------------------------------------------------------------------
-- Reverte a normalização snake_case → camelCase em public.customers.
-- USE COM CUIDADO: só rode se precisar voltar para o estado pré-004.
-- Após o rollback, o código da aplicação (que usa snake_case) volta a quebrar
-- com PGRST204 — então só faz sentido reverter se for restaurar uma versão
-- antiga do backend simultaneamente.
-- ============================================================================

BEGIN;

-- 1) Reverter trigger function para a versão camelCase
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW."updatedAt" = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- 2) Reverter renames (ordem inversa)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers'
      AND column_name = 'updated_at'
  ) THEN
    ALTER TABLE public.customers RENAME COLUMN updated_at TO "updatedAt";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers'
      AND column_name = 'created_at'
  ) THEN
    ALTER TABLE public.customers RENAME COLUMN created_at TO "createdAt";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers'
      AND column_name = 'guru_subscription_id'
  ) THEN
    ALTER TABLE public.customers RENAME COLUMN guru_subscription_id TO "guruSubscriptionId";
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'customers'
      AND column_name = 'asaas_customer_id'
  ) THEN
    ALTER TABLE public.customers RENAME COLUMN asaas_customer_id TO "asaasCustomerId";
  END IF;
END $$;

-- 3) Recriar índices condicionalmente
DROP INDEX IF EXISTS idx_customers_guru;
DROP INDEX IF EXISTS idx_customers_asaas;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND LOWER(column_name) = 'gurusubscriptionid'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_customers_guru
             ON public.customers("guruSubscriptionId")
             WHERE "guruSubscriptionId" IS NOT NULL';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public'
      AND table_name = 'customers'
      AND LOWER(column_name) = 'asaascustomerid'
  ) THEN
    EXECUTE 'CREATE INDEX IF NOT EXISTS idx_customers_asaas
             ON public.customers("asaasCustomerId")
             WHERE "asaasCustomerId" IS NOT NULL';
  END IF;
END $$;

-- 4) Reload do schema cache
NOTIFY pgrst, 'reload schema';

COMMIT;
