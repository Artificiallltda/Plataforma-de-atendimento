-- ============================================================================
-- PLATAFORMA DE ATENDIMENTO ARTIFICIALl (PAA)
-- Schema SQL - Supabase PostgreSQL
-- Migration: 001_initial_schema
-- Versão: 1.0.0 | Data: 2026-03-29
-- ============================================================================

-- Habilitar extensão UUID
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ============================================================================
-- TABELA: customers
-- Descrição: Perfis de clientes identificados por canal
-- ============================================================================
CREATE TABLE customers (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  channel           TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram', 'web')),
  channelUserId     TEXT NOT NULL,  -- Número do WA ou Telegram ID
  name              TEXT,
  email             TEXT,
  phone             TEXT,
  guruSubscriptionId TEXT,          -- ID da assinatura no GURU
  asaasCustomerId   TEXT,           -- ID do cliente no Asaas
  createdAt         TIMESTAMPTZ DEFAULT now(),
  updatedAt         TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE UNIQUE INDEX idx_customers_channel_user ON customers(channel, channelUserId);
CREATE INDEX idx_customers_guru ON customers(guruSubscriptionId) WHERE guruSubscriptionId IS NOT NULL;
CREATE INDEX idx_customers_asaas ON customers(asaasCustomerId) WHERE asaasCustomerId IS NOT NULL;

-- ============================================================================
-- TABELA: agents (humanos)
-- Descrição: Agentes humanos por setor com status online
-- ============================================================================
CREATE TABLE agents (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  name          TEXT NOT NULL,
  email         TEXT UNIQUE NOT NULL,
  sector        TEXT NOT NULL CHECK (sector IN ('suporte', 'financeiro', 'comercial', 'supervisor')),
  isOnline      BOOLEAN DEFAULT false,
  createdAt     TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_agents_sector ON agents(sector);
CREATE INDEX idx_agents_online ON agents(isOnline);

-- ============================================================================
-- TABELA: tickets
-- Descrição: Tickets de atendimento com rastreamento completo
-- ============================================================================
CREATE TABLE tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customerId        UUID REFERENCES customers(id) ON DELETE CASCADE,
  channel           TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram', 'web')),
  sector            TEXT CHECK (sector IN ('suporte', 'financeiro', 'comercial')),
  intent            TEXT,                      -- Intenção classificada pelo RouterAgent
  status            TEXT DEFAULT 'novo' CHECK (
    status IN ('novo', 'bot_ativo', 'aguardando_humano', 'em_atendimento', 'resolvido')
  ),
  priority          TEXT DEFAULT 'media' CHECK (
    priority IN ('critica', 'alta', 'media', 'baixa')
  ),
  currentAgent      TEXT,                      -- Agente IA ativo no momento
  assignedTo        UUID REFERENCES agents(id),-- Agente humano designado
  csatScore         INT CHECK (csatScore >= 1 AND csatScore <= 5),
  routerConfidence  FLOAT,                     -- Confiança da classificação inicial
  createdAt         TIMESTAMPTZ DEFAULT now(),
  resolvedAt        TIMESTAMPTZ
);

-- Índices para performance e filtros
CREATE INDEX idx_tickets_customer ON tickets(customerId);
CREATE INDEX idx_tickets_status ON tickets(status);
CREATE INDEX idx_tickets_sector ON tickets(sector);
CREATE INDEX idx_tickets_priority ON tickets(priority);
CREATE INDEX idx_tickets_assigned ON tickets(assignedTo);
CREATE INDEX idx_tickets_created ON tickets(createdAt);
CREATE INDEX idx_tickets_resolved ON tickets(resolvedAt) WHERE resolvedAt IS NOT NULL;

-- Restrição: resolvedAt só pode ser setado se status = 'resolvido'
ALTER TABLE tickets ADD CONSTRAINT check_resolved_at 
  CHECK (
    (status = 'resolvido' AND resolvedAt IS NOT NULL) OR
    (status != 'resolvido' AND resolvedAt IS NULL)
  );

-- ============================================================================
-- TABELA: messages
-- Descrição: Todas as mensagens trocadas (entrada e saída)
-- ============================================================================
CREATE TABLE messages (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  externalId    TEXT NOT NULL,        -- ID da mensagem no canal de origem
  channel       TEXT NOT NULL CHECK (channel IN ('whatsapp', 'telegram', 'web')),
  customerId    UUID REFERENCES customers(id) ON DELETE CASCADE,
  ticketId      UUID REFERENCES tickets(id) ON DELETE CASCADE,
  body          TEXT NOT NULL,        -- Texto da mensagem
  mediaUrl      TEXT,                 -- URL do mídia (se houver)
  mediaType     TEXT CHECK (mediaType IN ('audio', 'image', 'document', 'video')),
  sender        TEXT NOT NULL CHECK (sender IN ('customer', 'bot', 'human')),
  senderId      UUID,                 -- ID do agente humano ou NULL se bot/customer
  timestamp     TIMESTAMPTZ DEFAULT now(),
  rawPayload    JSONB                 -- Payload original do canal (para debug)
);

-- Índices para performance
CREATE INDEX idx_messages_customer ON messages(customerId);
CREATE INDEX idx_messages_ticket ON messages(ticketId);
CREATE INDEX idx_messages_timestamp ON messages(timestamp);
CREATE INDEX idx_messages_external ON messages(externalId, channel);
CREATE INDEX idx_messages_raw ON messages USING GIN(rawPayload);

-- ============================================================================
-- TABELA: agent_logs
-- Descrição: Log de auditoria de todas as decisões dos agentes de IA
-- ============================================================================
CREATE TABLE agent_logs (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticketId      UUID REFERENCES tickets(id) ON DELETE CASCADE,
  agentType     TEXT NOT NULL CHECK (
    agentType IN ('router', 'support', 'finance', 'sales', 'escalation', 'feedback')
  ),
  action        TEXT NOT NULL CHECK (
    action IN ('classified', 'responded', 'tool_call', 'handoff', 'escalated', 'collected_feedback')
  ),
  input         JSONB,                -- Prompt/contexto enviado ao agente
  output        JSONB,                -- Resposta/decisão do agente
  toolsUsed     TEXT[],               -- Ferramentas chamadas nesta ação
  confidence    FLOAT CHECK (confidence >= 0 AND confidence <= 1),
  durationMs    INT,                  -- Latência da resposta em milissegundos
  createdAt     TIMESTAMPTZ DEFAULT now()
);

-- Índices para auditoria e analytics
CREATE INDEX idx_agent_logs_ticket ON agent_logs(ticketId);
CREATE INDEX idx_agent_logs_type ON agent_logs(agentType);
CREATE INDEX idx_agent_logs_action ON agent_logs(action);
CREATE INDEX idx_agent_logs_created ON agent_logs(createdAt);
CREATE INDEX idx_agent_logs_input ON agent_logs USING GIN(input);
CREATE INDEX idx_agent_logs_output ON agent_logs USING GIN(output);

-- ============================================================================
-- TABELA: handoffs
-- Descrição: Rastreamento de todos os handoffs entre agentes
-- ============================================================================
CREATE TABLE handoffs (
  id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticketId        UUID REFERENCES tickets(id) ON DELETE CASCADE,
  fromAgent       TEXT NOT NULL,
  toAgent         TEXT NOT NULL,
  reason          TEXT NOT NULL,
  urgency         TEXT CHECK (urgency IN ('low', 'medium', 'high', 'critical')),
  contextSnapshot JSONB,              -- Snapshot do contexto no momento do handoff
  toolResults     JSONB,              -- Resultados de tools executadas
  createdAt       TIMESTAMPTZ DEFAULT now()
);

-- Índices para análise de fluxo
CREATE INDEX idx_handoffs_ticket ON handoffs(ticketId);
CREATE INDEX idx_handoffs_from ON handoffs(fromAgent);
CREATE INDEX idx_handoffs_to ON handoffs(toAgent);
CREATE INDEX idx_handoffs_created ON handoffs(createdAt);

-- ============================================================================
-- TABELA: alerts
-- Descrição: Alertas de crise para o Dashboard
-- ============================================================================
CREATE TABLE alerts (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticketId      UUID REFERENCES tickets(id) ON DELETE CASCADE,
  type          TEXT NOT NULL,  -- 'escalation' | 'timeout' | 'bug_sistemico'
  level         TEXT NOT NULL,  -- 'info' | 'warning' | 'critical'
  message       TEXT NOT NULL,
  acknowledged  BOOLEAN DEFAULT false,
  acknowledgedBy UUID REFERENCES agents(id),
  createdAt     TIMESTAMPTZ DEFAULT now()
);

-- Índices para consultas em tempo real
CREATE INDEX idx_alerts_created ON alerts(createdAt DESC);
CREATE INDEX idx_alerts_level ON alerts(level);
CREATE INDEX idx_alerts_acknowledged ON alerts(acknowledged) WHERE acknowledged = false;

-- ============================================================================
-- TRIGGERS E FUNÇÕES
-- ============================================================================

-- Função: Atualizar updatedAt automaticamente
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updatedAt = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: customers updatedAt
CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

-- Função: Criar ticket automaticamente ao receber primeira mensagem
CREATE OR REPLACE FUNCTION create_ticket_on_first_message()
RETURNS TRIGGER AS $$
DECLARE
  v_ticketId UUID;
BEGIN
  -- Verificar se já existe ticket ativo para este cliente
  SELECT id INTO v_ticketId 
  FROM tickets 
  WHERE customerId = NEW.customerId 
    AND status IN ('novo', 'bot_ativo', 'em_atendimento')
  ORDER BY createdAt DESC 
  LIMIT 1;
  
  -- Se não existe ticket ativo, criar novo
  IF v_ticketId IS NULL THEN
    INSERT INTO tickets (customerId, channel, status)
    VALUES (NEW.customerId, NEW.channel, 'novo')
    RETURNING id INTO v_ticketId;
  END IF;
  
  -- Associar mensagem ao ticket
  NEW.ticketId := v_ticketId;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Trigger: Criar ticket na primeira mensagem do cliente
CREATE TRIGGER create_ticket_on_first_message
  BEFORE INSERT ON messages
  FOR EACH ROW
  WHEN (NEW.ticketId IS NULL)
  EXECUTE FUNCTION create_ticket_on_first_message();

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoffs ENABLE ROW LEVEL SECURITY;
ALTER TABLE alerts ENABLE ROW LEVEL SECURITY;

-- Policy: Agentes só veem tickets do seu setor (ou supervisor vê tudo)
CREATE POLICY agents_see_own_sector ON tickets
  FOR ALL
  USING (
    sector = (SELECT sector FROM agents WHERE email = current_setting('app.current_user_email', true)::text)
    OR
    (SELECT sector FROM agents WHERE agents.email = current_setting('app.current_user_email', true)::text) = 'supervisor'
  );

-- Policy: Agentes veem mensagens apenas dos tickets que têm acesso
CREATE POLICY agents_see_own_ticket_messages ON messages
  FOR ALL
  USING (
    ticketId IN (
      SELECT id FROM tickets WHERE 
        sector = (SELECT sector FROM agents WHERE agents.email = current_setting('app.current_user_email', true)::text)
        OR
        (SELECT sector FROM agents WHERE agents.email = current_setting('app.current_user_email', true)::text) = 'supervisor'
    )
    OR
    sender = 'customer' AND customerId IN (
      SELECT id FROM customers WHERE channelUserId = current_setting('app.current_channel_user_id', true)::text
    )
  );

-- Policy: Agentes veem logs dos tickets que têm acesso
CREATE POLICY agents_see_own_ticket_logs ON agent_logs
  FOR ALL
  USING (
    ticketId IN (
      SELECT id FROM tickets WHERE 
        sector = (SELECT sector FROM agents WHERE agents.email = current_setting('app.current_user_email', true)::text)
        OR
        (SELECT sector FROM agents WHERE agents.email = current_setting('app.current_user_email', true)::text) = 'supervisor'
    )
  );

-- Policy: Agentes veem handoffs dos tickets que têm acesso
CREATE POLICY agents_see_own_ticket_handoffs ON handoffs
  FOR ALL
  USING (
    ticketId IN (
      SELECT id FROM tickets WHERE 
        sector = (SELECT sector FROM agents WHERE agents.email = current_setting('app.current_user_email', true)::text)
        OR
        (SELECT sector FROM agents WHERE agents.email = current_setting('app.current_user_email', true)::text) = 'supervisor'
    )
  );

-- Policy: Agentes veem alerts dos tickets que têm acesso
CREATE POLICY agents_see_own_ticket_alerts ON alerts
  FOR ALL
  USING (
    ticketId IN (
      SELECT id FROM tickets WHERE 
        sector = (SELECT sector FROM agents WHERE agents.email = current_setting('app.current_user_email', true)::text)
        OR
        (SELECT sector FROM agents WHERE agents.email = current_setting('app.current_user_email', true)::text) = 'supervisor'
    )
  );

-- Policy: Clientes veem apenas seus próprios dados (via channelUserId)
CREATE POLICY customers_see_own ON customers
  FOR SELECT
  USING (
    channelUserId = current_setting('app.current_channel_user_id', true)::text
  );

-- ============================================================================
-- VIEWS PARA DASHBOARD
-- ============================================================================

-- View: Tickets em tempo real por setor
CREATE VIEW v_tickets_by_sector AS
SELECT 
  sector,
  status,
  COUNT(*) as count,
  ARRAY_AGG(id) as ticketIds
FROM tickets
GROUP BY sector, status;

-- View: KPIs em tempo real
CREATE VIEW v_kpis_realtime AS
SELECT 
  (SELECT COUNT(*) FROM tickets WHERE status IN ('novo', 'bot_ativo', 'em_atendimento')) as tickets_abertos,
  (SELECT COUNT(*) FROM tickets WHERE priority = 'critica' AND status != 'resolvido') as tickets_criticos,
  (SELECT AVG(EXTRACT(EPOCH FROM (resolvedAt - createdAt))) FROM tickets WHERE resolvedAt IS NOT NULL) as tmr_medio_segundos,
  (SELECT AVG(csatScore) FROM tickets WHERE csatScore IS NOT NULL) as csat_medio,
  (
    CASE 
      WHEN (SELECT COUNT(*) FROM tickets WHERE status = 'resolvido') = 0 THEN 0
      ELSE (SELECT COUNT(*) * 100.0 FROM tickets WHERE status = 'resolvido' AND assignedTo IS NULL) / 
           (SELECT COUNT(*) FROM tickets WHERE status = 'resolvido')
    END
  ) as bot_containment_rate;

-- View: Agentes online com carga atual
CREATE VIEW v_agents_workload AS
SELECT 
  a.id,
  a.name,
  a.sector,
  a.isOnline,
  COUNT(t.id) as tickets_ativos
FROM agents a
LEFT JOIN tickets t ON t.assignedTo = a.id AND t.status != 'resolvido'
GROUP BY a.id, a.name, a.sector, a.isOnline;

-- ============================================================================
-- SEED DATA (Agentes iniciais para teste)
-- ============================================================================

INSERT INTO agents (name, email, sector, isOnline) VALUES
  ('João Suporte', 'joao@artificiall.com', 'suporte', true),
  ('Maria Financeiro', 'maria@artificiall.com', 'financeiro', true),
  ('Pedro Comercial', 'pedro@artificiall.com', 'comercial', false),
  ('Ana Supervisora', 'ana@artificiall.com', 'supervisor', true)
ON CONFLICT (email) DO NOTHING;

-- ============================================================================
-- COMENTÁRIOS DE DOCUMENTAÇÃO
-- ============================================================================

COMMENT ON TABLE customers IS 'Perfis de clientes identificados por canal (WhatsApp, Telegram, Web)';
COMMENT ON TABLE tickets IS 'Tickets de atendimento com rastreamento completo do ciclo de vida';
COMMENT ON TABLE messages IS 'Todas as mensagens trocadas (entrada e saída) com payload bruto para auditoria';
COMMENT ON TABLE agent_logs IS 'Log de auditoria de todas as decisões dos agentes de IA';
COMMENT ON TABLE handoffs IS 'Rastreamento de todos os handoffs entre agentes';
COMMENT ON TABLE alerts IS 'Alertas de crise para o Dashboard (escaladas, timeout, bugs)';

COMMENT ON COLUMN tickets.sector IS 'Setor de atendimento: suporte, financeiro, comercial';
COMMENT ON COLUMN tickets.status IS 'Status do ticket: novo, bot_ativo, aguardando_humano, em_atendimento, resolvido';
COMMENT ON COLUMN tickets.priority IS 'Prioridade: critica, alta, media, baixa';
COMMENT ON COLUMN tickets.currentAgent IS 'Agente IA ativo no momento (router, support, finance, sales, escalation)';
COMMENT ON COLUMN tickets.routerConfidence IS 'Confiança da classificação inicial do RouterAgent (0.0-1.0';
COMMENT ON COLUMN agent_logs.input IS 'Prompt/contexto enviado ao agente (JSONB)';
COMMENT ON COLUMN agent_logs.output IS 'Resposta/decisão do agente (JSONB)';
COMMENT ON COLUMN agent_logs.toolsUsed IS 'Lista de ferramentas chamadas nesta ação';
COMMENT ON COLUMN handoffs.contextSnapshot IS 'Snapshot do contexto completo no momento do handoff';
