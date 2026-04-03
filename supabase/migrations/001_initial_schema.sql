-- ============================================================================
-- PLATAFORMA DE ATENDIMENTO ARTIFICIALl (PAA)
-- Schema SQL - Supabase PostgreSQL
-- Migration: 001_initial_schema
-- Versão: 1.0.1 | Data: 2026-04-03
-- Objetivo: Blindagem contra re-execução (IF NOT EXISTS)
-- ============================================================================

-- Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABELA: customers
-- ============================================================================
CREATE TABLE IF NOT EXISTS customers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel           TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram', 'web')),
  channelUserId     TEXT NOT NULL,
  name              TEXT,
  email             TEXT,
  phone             TEXT,
  guruSubscriptionId TEXT,
  asaasCustomerId   TEXT,
  createdAt         TIMESTAMPTZ DEFAULT now(),
  updatedAt         TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_customers_channel_user ON customers(channel, channelUserId);
CREATE INDEX IF NOT EXISTS idx_customers_guru ON customers(guruSubscriptionId) WHERE guruSubscriptionId IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_customers_asaas ON customers(asaasCustomerId) WHERE asaasCustomerId IS NOT NULL;

-- ============================================================================
-- TABELA: agents (humanos)
-- ============================================================================
CREATE TABLE IF NOT EXISTS agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  sector        TEXT NOT NULL CHECK (sector IN ('suporte', 'financeiro', 'comercial', 'supervisor')),
  isOnline      BOOLEAN DEFAULT false,
  createdAt     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agents_sector ON agents(sector);
CREATE INDEX IF NOT EXISTS idx_agents_online ON agents(isOnline);

-- ============================================================================
-- TABELA: tickets
-- ============================================================================
CREATE TABLE IF NOT EXISTS tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customerId        UUID REFERENCES customers(id) ON DELETE CASCADE,
  channel           TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram', 'web')),
  sector            TEXT CHECK (sector IN ('suporte', 'financeiro', 'comercial', 'supervisor')),
  intent            TEXT,
  status            TEXT DEFAULT 'novo' CHECK (
    status IN ('novo', 'bot_ativo', 'aguardando_humano', 'em_atendimento', 'resolvido')
  ),
  priority          TEXT DEFAULT 'media' CHECK (
    priority IN ('critica', 'alta', 'media', 'baixa')
  ),
  currentAgent      TEXT,
  assignedTo        UUID REFERENCES agents(id),
  csatScore         INT CHECK (csatScore >= 1 AND csatScore <= 5),
  routerConfidence  FLOAT,
  createdAt         TIMESTAMPTZ DEFAULT now(),
  resolvedAt        TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_tickets_customer ON tickets(customerId);
CREATE INDEX IF NOT EXISTS idx_tickets_status ON tickets(status);
CREATE INDEX IF NOT EXISTS idx_tickets_sector ON tickets(sector);
CREATE INDEX IF NOT EXISTS idx_tickets_priority ON tickets(priority);
CREATE INDEX IF NOT EXISTS idx_tickets_assigned ON tickets(assignedTo);
CREATE INDEX IF NOT EXISTS idx_tickets_created ON tickets(createdAt);
CREATE INDEX IF NOT EXISTS idx_tickets_resolved ON tickets(resolvedAt) WHERE resolvedAt IS NOT NULL;

-- ============================================================================
-- TABELA: messages
-- ============================================================================
CREATE TABLE IF NOT EXISTS messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  externalId    TEXT NOT NULL,
  channel       TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram', 'web')),
  customerId    UUID REFERENCES customers(id) ON DELETE CASCADE,
  ticketId      UUID REFERENCES tickets(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,
  mediaUrl      TEXT,
  mediaType     TEXT CHECK (mediaType IN ('audio', 'image', 'document', 'video')),
  sender        TEXT NOT NULL CHECK (sender IN ('customer', 'bot', 'human')),
  senderId      UUID,
  timestamp     TIMESTAMPTZ DEFAULT now(),
  rawPayload    JSONB
);

CREATE INDEX IF NOT EXISTS idx_messages_customer ON messages(customerId);
CREATE INDEX IF NOT EXISTS idx_messages_ticket ON messages(ticketId);
CREATE INDEX IF NOT EXISTS idx_messages_timestamp ON messages(timestamp);
CREATE INDEX IF NOT EXISTS idx_messages_external ON messages(externalId, channel);
CREATE INDEX IF NOT EXISTS idx_messages_raw ON messages USING GIN(rawPayload);

-- ============================================================================
-- TABELA: agent_logs
-- ============================================================================
CREATE TABLE IF NOT EXISTS agent_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticketId      UUID REFERENCES tickets(id) ON DELETE CASCADE,
  agentType     TEXT NOT NULL CHECK (
    agentType IN ('router', 'support', 'finance', 'sales', 'escalation', 'feedback')
  ),
  action        TEXT NOT NULL CHECK (
    action IN ('classified', 'responded', 'tool_call', 'handoff', 'escalated', 'collected_feedback')
  ),
  input         JSONB,
  output        JSONB,
  toolsUsed     TEXT[],
  confidence    FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  durationMs    INT,
  createdAt     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_logs_ticket ON agent_logs(ticketId);
CREATE INDEX IF NOT EXISTS idx_agent_logs_type ON agent_logs(agentType);
CREATE INDEX IF NOT EXISTS idx_agent_logs_action ON agent_logs(action);
CREATE INDEX IF NOT EXISTS idx_agent_logs_created ON agent_logs(createdAt);

-- ============================================================================
-- TABELA: handoffs
-- ============================================================================
CREATE TABLE IF NOT EXISTS handoffs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticketId        UUID REFERENCES tickets(id) ON DELETE CASCADE,
  fromAgent       TEXT NOT NULL,
  toAgent         TEXT NOT NULL,
  reason          TEXT NOT NULL,
  urgency         TEXT CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  contextSnapshot JSONB,
  toolResults     JSONB,
  createdAt       TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_handoffs_ticket ON handoffs(ticketId);
CREATE INDEX IF NOT EXISTS idx_handoffs_from ON handoffs(fromAgent);
CREATE INDEX IF NOT EXISTS idx_handoffs_to ON handoffs(toAgent);
CREATE INDEX IF NOT EXISTS idx_handoffs_created ON handoffs(createdAt);

-- ============================================================================
-- TABELA: alerts
-- ============================================================================
CREATE TABLE IF NOT EXISTS alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticketId      UUID REFERENCES tickets(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,
  level         TEXT NOT NULL,
  message       TEXT NOT NULL,
  acknowledged  BOOLEAN DEFAULT false,
  acknowledgedBy UUID REFERENCES agents(id),
  createdAt     TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_alerts_created ON alerts(createdAt DESC);
CREATE INDEX IF NOT EXISTS idx_alerts_level ON alerts(level);
CREATE INDEX IF NOT EXISTS idx_alerts_acknowledged ON alerts(acknowledged) WHERE acknowledged = false;

-- ============================================================================
-- TRIGGERS E FUNÇÕES (Blindagem OR REPLACE)
-- ============================================================================

CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updatedAt = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'customers_updated_at') THEN
    CREATE TRIGGER customers_updated_at
      BEFORE UPDATE ON customers
      FOR EACH ROW
      EXECUTE FUNCTION update_updated_at_column();
  END IF;
END $$;

CREATE OR REPLACE FUNCTION create_ticket_on_first_message()
RETURNS TRIGGER AS $$
DECLARE
  v_ticketId UUID;
BEGIN
  SELECT id INTO v_ticketId FROM tickets 
  WHERE customerId = NEW.customerId AND status IN ('novo', 'bot_ativo', 'em_atendimento')
  ORDER BY createdAt DESC LIMIT 1;
  
  IF v_ticketId IS NULL THEN
    INSERT INTO tickets (customerId, channel, status)
    VALUES (NEW.customerId, NEW.channel, 'novo')
    RETURNING id INTO v_ticketId;
  END IF;
  
  NEW.ticketId := v_ticketId;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_trigger WHERE tgname = 'create_ticket_on_first_message') THEN
    CREATE TRIGGER create_ticket_on_first_message
      BEFORE INSERT ON messages
      FOR EACH ROW
      WHEN (NEW.ticketId IS NULL)
      EXECUTE FUNCTION create_ticket_on_first_message();
  END IF;
END $$;
