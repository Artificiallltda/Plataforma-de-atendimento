-- ============================================================================
-- PLATAFORMA DE ATENDIMENTO ARTIFICIALl (PAA)
-- Migration: 003_fix_agents_and_telegram_sync
-- Objetivo: Corrigir RLS da tabela agents e normalizar colunas para o sincronizador
-- ============================================================================

-- 1. Garantir que a tabela agents existe e tem as colunas corretas
DO $$ 
BEGIN
    IF NOT EXISTS (SELECT FROM pg_tables WHERE schemaname = 'public' AND tablename = 'agents') THEN
        CREATE TABLE agents (
            id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
            name          TEXT NOT NULL,
            email         TEXT UNIQUE NOT NULL,
            sector        TEXT NOT NULL CHECK (sector IN ('suporte', 'financeiro', 'comercial', 'supervisor')),
            isOnline      BOOLEAN DEFAULT false,
            createdAt     TIMESTAMPTZ DEFAULT now()
        );
    END IF;
END $$;

-- 2. Corrigir permissões de RLS para a tabela agents (estava bloqueando o Dashboard)
ALTER TABLE agents ENABLE ROW LEVEL SECURITY;

-- Remover policies antigas se existirem para evitar duplicados
DROP POLICY IF EXISTS "Agentes podem ver seus próprios perfis" ON agents;
DROP POLICY IF EXISTS "Supervisores podem ver todos os agentes" ON agents;

CREATE POLICY "Agentes podem ver seus próprios perfis" ON agents
  FOR SELECT
  USING (auth.jwt() ->> 'email' = email);

CREATE POLICY "Supervisores podem ver todos os agentes" ON agents
  FOR SELECT
  USING (
    (SELECT sector FROM agents WHERE agents.email = auth.jwt() ->> 'email') = 'supervisor'
  );

-- 3. Normalizar nomes de colunas na tabela customers (de camelCase para snake_case para dar match no código)
-- O código do telegram-webhook.ts usa channel_user_id
DO $$ 
BEGIN
    IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name='customers' AND column_name='channeluserid') THEN
        ALTER TABLE customers RENAME COLUMN channelUserId TO channel_user_id;
    END IF;
END $$;

-- 4. Inserir o CEO como supervisor se não existir
INSERT INTO agents (name, email, sector, isOnline)
VALUES ('CEO Artificiall', 'ceo@artificiall.ai', 'supervisor', true)
ON CONFLICT (email) DO UPDATE SET sector = 'supervisor';

-- 5. Atualizar as policies de outras tabelas que usavam camelCase
DROP POLICY IF EXISTS "customers_see_own" ON customers;
CREATE POLICY "customers_see_own" ON customers
  FOR SELECT
  USING (
    channel_user_id = current_setting('app.current_channel_user_id', true)::text
  );
