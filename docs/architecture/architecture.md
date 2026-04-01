# Arquitetura — Plataforma de Atendimento Artificiall (PAA)

> **Versão:** 1.0.0 | **Status:** Draft | **Data:** 2026-03-29
> **Autor:** Aria (Architect Agent) | **Revisão:** @aiox-master

---

## 1. Visão Geral da Arquitetura

### 1.1 Contexto do Sistema

A PAA é um sistema **Multi-Agent System (MAS)** omnichannel que unifica atendimento de WhatsApp, Telegram e Chat Web em uma única plataforma, com 6 agentes de IA especializados que colaboram via protocolo de handoff.

### 1.2 Princípios Arquiteturais

| Princípio | Descrição |
|-----------|-----------|
| **CLI First** | Nenhuma UI toma decisão. Tudo executável via CLI |
| **Agentes Autônomos** | Cada agente resolve máximo possível sem intervenção humana |
| **Handoff Orquestrado** | RouterAgent centraliza todo roteamento entre agentes |
| **Observabilidade Total** | Cada decisão de IA logada com timestamp e confidence |
| **Realtime First** | Dashboard atualiza em tempo real via Supabase Realtime |
| **Segurança em Camadas** | RLS no DB, autenticação por setor, auditoria completa |

---

## 2. Arquitetura de Alto Nível

```
┌─────────────────────────────────────────────────────────────────────────┐
│                         CANAIS DE ENTRADA                                │
│  ┌──────────────┐  ┌──────────────┐  ┌──────────────┐                  │
│  │  WhatsApp    │  │   Telegram   │  │  Chat Web    │                  │
│  │  Cloud API   │  │     Bot      │  │   Widget     │                  │
│  └──────┬───────┘  └──────┬───────┘  └──────┬───────┘                  │
│         │                 │                 │                           │
│         └─────────────────┴─────────────────┘                           │
│                           │                                             │
│                           ▼                                             │
│         ┌─────────────────────────────────┐                             │
│         │     API Gateway (Node.js)       │                             │
│         │         Fastify                 │                             │
│         │  - Webhook Handler (WA/Telegram)│                             │
│         │  - Message Normalizer           │                             │
│         │  - Customer Identifier          │                             │
│         └──────────────┬──────────────────┘                             │
│                       │                                                 │
│                       ▼                                                 │
│         ┌─────────────────────────────────┐                             │
│         │      🧠 RouterAgent (IA)        │                             │
│         │    Gemini 2.0 Flash (< 1s)      │                             │
│         │  - Classifica intenção          │                             │
│         │  - Roteia por setor             │                             │
│         │  - Recupera histórico           │                             │
│         └──┬──────────────┬───────────────┼──────────┐                  │
│            │              │               │          │                  │
│            ▼              ▼               ▼          ▼                  │
│   ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐      │
│   │  🔧 Support │ │  💰 Finance │ │  🤝 Sales   │ │  🚨 Escal.  │      │
│   │   Agent     │ │   Agent     │ │   Agent     │ │   Agent     │      │
│   │ Gemini 1.5  │ │ Gemini 2.0  │ │ Gemini 1.5  │ │ Sentimento  │      │
│   │   Pro       │ │   Flash     │ │   Pro       │ │  (< 100ms)  │      │
│   └──────┬──────┘ └──────┬──────┘ └──────┬──────┘ └──────┬──────┘      │
│          │               │               │              │              │
│          └───────────────┴───────────────┴──────────────┘              │
│                              │                                          │
│                              ▼                                          │
│                   ┌─────────────────────┐                               │
│                   │  ⭐ FeedbackAgent   │                               │
│                   │   (pós-resolução)   │                               │
│                   └──────────┬──────────┘                               │
│                              │                                          │
│                              ▼                                          │
│         ┌─────────────────────────────────┐                             │
│         │      Supabase (PostgreSQL)      │                             │
│         │  - tickets                      │                             │
│         │  - customers                    │                             │
│         │  - messages                     │                             │
│         │  - agent_logs                   │                             │
│         │  - agents (humanos)             │                             │
│         └─────────────────────────────────┘                             │
│                                                                         │
│         ┌─────────────────────────────────┐                             │
│         │      Dashboard (Next.js 14)     │                             │
│         │  - Fila de tickets (Realtime)   │                             │
│         │  - Chat inbox                   │                             │
│         │  - Painel do supervisor         │                             │
│         │  - KPIs em tempo real           │                             │
│         └─────────────────────────────────┘                             │
└─────────────────────────────────────────────────────────────────────────┘
```

---

## 3. Protocolo de Handoff entre Agentes

### 3.1 Visão Geral do Fluxo

```
Cliente → Gateway → RouterAgent → Agente Especialista → [EscalationAgent] → FeedbackAgent → Supabase
```

### 3.2 Estrutura do Handoff

```typescript
interface AgentHandoff {
  // Identificação
  handoffId: string;           // UUID único do handoff
  ticketId: string;            // Ticket em andamento
  timestamp: Date;             // Momento do handoff
  
  // Origem e Destino
  from: AgentType;             // Agente que está transferindo
  to: AgentType;               // Agente que vai receber
  
  // Contexto da Conversa
  context: Message[];          // Histórico completo (últimas 10 mensagens)
  customerProfile: Customer;   // Perfil enriquecido do cliente
  
  // Classificação
  sector: 'suporte' | 'financeiro' | 'comercial';
  intent: string;              // Intenção detectada
  confidence: number;          // 0.0 a 1.0
  urgency: 'low' | 'medium' | 'high' | 'critical';
  
  // Ferramentas Executadas
  toolResults?: ToolResult[];  // Resultados de tools já chamadas
  
  // Metadados
  channel: 'whatsapp' | 'telegram' | 'web';
  language: string;            // 'pt-BR' padrão
}

type AgentType = 'router' | 'support' | 'finance' | 'sales' | 'escalation' | 'human' | 'feedback';
```

### 3.3 Sequência de Handoff (Diagrama)

```
┌──────┐    ┌─────────────┐    ┌───────────────┐    ┌───────────────┐    ┌──────────┐
│Cliente│    │Gateway/Router│    │SupportAgent   │    │EscalationAgent│    │  Humano  │
└──┬───┘    └──────┬───────┘    └───────┬───────┘    └───────┬───────┘    └────┬─────┘
   │               │                     │                    │                 │
   │ "não consigo  │                     │                    │                 │
   │  acessar"     │                     │                    │                 │
   │──────────────>│                     │                    │                 │
   │               │                     │                    │                 │
   │               │ Cria ticket         │                    │                 │
   │               │ Classifica intenção │                    │                 │
   │               │ confidence = 0.92   │                    │                 │
   │               │                     │                    │                 │
   │               │ HANDOFF:            │                    │                 │
   │               │ {sector: suporte,   │                    │                 │
   │               │  intent: erro_acesso,                    │                 │
   │               │  to: supportAgent}   │                    │                 │
   │               │────────────────────>│                    │                 │
   │               │                     │                    │                 │
   │               │                     │ checkUserStatus()  │                 │
   │               │                     │ getKnowledgeBase() │                 │
   │               │                     │                    │                 │
   │               │                     │ Responde cliente   │                 │
   │<────────────────────────────────────│                    │                 │
   │               │                     │                    │                 │
   │ "ainda não    │                     │                    │                 │
   │  funciona"    │                     │                    │                 │
   │──────────────>│                     │                    │                 │
   │               │                     │                    │                 │
   │               │                     │ 3ª tentativa       │                 │
   │               │                     │ sem sucesso →      │                 │
   │               │                     │                    │                 │
   │               │                     │ HANDOFF:           │                 │
   │               │                     │ {reason: retry>3,  │                 │
   │               │                     │  urgency: high,    │                 │
   │               │                     │  to: escalation}   │                 │
   │               │                     │───────────────────>│                 │
   │               │                     │                    │                 │
   │               │                     │                    │ Analisa         │
   │               │                     │                    │ sentimento      │
   │               │                     │                    │ score: -0.7     │
   │               │                     │                    │                 │
   │               │                     │                    │ ALERTA CRÍTICO  │
   │               │                     │                    │ Notifica humano │
   │               │                     │                    │─────────────────>│
   │               │                     │                    │                 │
   │               │                     │                    │                 │
   │<──────────────────────────────────────────────────────────────────────────│
   │               │                     │                    │                 │
   │ "Olá Ana, sou  │                     │                    │                 │
   │  João do sup.  │                     │                    │                 │
   │───────────────<│                     │                    │                 │
```

### 3.4 Regras de Handoff

| Regra | Descrição |
|-------|-----------|
| **Orquestração Central** | RouterAgent orquestra TODO handoff. Agentes NUNCA se chamam diretamente |
| **Confidence Threshold** | Se confidence < 0.75, RouterAgent pergunta setor ao cliente |
| **Retry Limit** | Após 3 tentativas sem sucesso → EscalationAgent |
| **Sentimento Negativo** | Score < -0.6 → EscalationAgent imediato |
| **Timeout** | 10 minutos sem resposta do bot → EscalationAgent |
| **Enterprise** | Cliente Enterprise → Escalação imediata para humano |
| **Bug Sistêmico** | Mesmo erro em > 3 tickets/hora → EscalationAgent + createTechnicalTicket() |

### 3.5 Integração com Cloud Artificiall

```
┌──────────────────────────────────────────────────────────────┐
│                    Cloud Artificiall                          │
│                                                               │
│  ┌─────────────────┐    ┌─────────────────┐                  │
│  │  ChefIA (Bot)   │    │  PAA (MAS)      │                  │
│  │  Telegram Bot   │    │  Omnichannel    │                  │
│  └────────┬────────┘    └────────┬────────┘                  │
│           │                      │                            │
│           └──────────┬───────────┘                            │
│                      │                                        │
│                      ▼                                        │
│         ┌─────────────────────────┐                           │
│         │   Shared Services       │                           │
│         │  - Supabase (DB único)  │                           │
│         │  - Redis (sessões)      │                           │
│         │  - LangChain.js         │                           │
│         │  - WhatsApp Cloud API   │                           │
│         └─────────────────────────┘                           │
│                                                               │
│  ┌─────────────────┐    ┌─────────────────┐                  │
│  │  GURU (SaaS)    │    │  Asaas (Fintech)│                  │
│  │  Assinaturas    │◄──►│  Pagamentos     │                  │
│  └─────────────────┘    └─────────────────┘                  │
│           ▲                      ▲                            │
│           │                      │                            │
│           └──────────┬───────────┘                            │
│                      │                                        │
│                      ▼                                        │
│         ┌─────────────────────────┐                           │
│         │   FinanceAgent          │                           │
│         │  - checkSubscription()  │                           │
│         │  - getInvoice()         │                           │
│         │  - applyRetentionCoupon()│                          │
│         └─────────────────────────┘                           │
└──────────────────────────────────────────────────────────────┘
```

**Pontos de Integração:**

| Serviço | Uso na PAA | Agente Responsável |
|---------|------------|-------------------|
| **GURU API** | Verificar assinatura, gerar checkout, aplicar cupom | FinanceAgent, SalesAgent |
| **Asaas API** | Consultar faturas, reenviar boleto, processar estorno | FinanceAgent |
| **ChefIA Bot** | Reutilizar configuração Telegram existente | Gateway |
| **Supabase** | DB unificado para ChefIA + PAA | Todos agentes |
| **Redis** | Sessões de curto prazo, memória de agentes | RouterAgent |

---

## 4. Modelo de Dados

### 4.1 Diagrama de Entidades

```
┌─────────────────────────────────────────────────────────────────┐
│                         SUPABASE (PostgreSQL)                    │
└─────────────────────────────────────────────────────────────────┘

┌──────────────────┐       ┌──────────────────┐       ┌──────────────────┐
│    customers     │       │     tickets      │       │     agents       │
├──────────────────┤       ├──────────────────┤       ├──────────────────┤
│ id (PK)          │◄──────│ customer_id (FK) │       │ id (PK)          │
│ channel          │       │ id (PK)          │       │ name             │
│ channelUserId    │       │ channel          │       │ email            │
│ name             │       │ sector           │       │ sector           │
│ email            │       │ intent           │       │ is_online        │
│ phone            │       │ status           │       │ created_at       │
│ guruSubId        │       │ priority         │       └──────────────────┘
│ asaasCustomerId  │       │ current_agent    │              │
│ created_at       │       │ assigned_to (FK) │──────────────┘
│ updated_at       │       │ csat_score       │
└──────────────────┘       │ router_confidence│
           │               │ created_at       │       ┌──────────────────┐
           │               │ resolved_at      │       │    messages      │
           │               └──────────────────┘       ├──────────────────┤
           │                        │                 │ id (PK)          │
           │                        │                 │ externalId       │
           │                        ▼                 │ channel          │
           │               ┌──────────────────┐       │ customer_id (FK) │
           │               │   agent_logs     │       │ ticket_id (FK)   │
           │              ├──────────────────┤       │ body             │
           └──────────────│ ticket_id (FK)   │       │ mediaUrl         │
                          │ id (PK)          │       │ mediaType        │
                          │ agent_type       │       │ timestamp        │
                          │ action           │       │ rawPayload       │
                          │ input (JSONB)    │       └──────────────────┘
                          │ output (JSONB)   │
                          │ tools_used       │
                          │ confidence       │
                          │ duration_ms      │
                          │ created_at       │
                          └──────────────────┘
```

### 4.2 Schema SQL Completo

```sql
-- ============================================================================
-- PLATAFORMA DE ATENDIMENTO ARTIFICIALl (PAA)
-- Schema SQL - Supabase PostgreSQL
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
  channelUserId     TEXT NOT NULL,  -- Número WA ou Telegram ID
  name              TEXT,
  email             TEXT,
  phone             TEXT,
  guruSubscriptionId TEXT,          -- ID da assinatura no GURU
  asaasCustomerId   TEXT,           -- ID do cliente no Asaas
  createdAt         TIMESTAMPTZ DEFAULT now(),
  updatedAt         TIMESTAMPTZ DEFAULT now(),
  
  -- Índices para performance
  UNIQUE (channel, channelUserId),
  INDEX idx_customers_guru (guruSubscriptionId),
  INDEX idx_customers_asaas (asaasCustomerId)
);

-- Trigger para updatedAt
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
  NEW.updatedAt = now();
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER customers_updated_at
  BEFORE UPDATE ON customers
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();

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
  createdAt     TIMESTAMPTZ DEFAULT now(),
  
  UNIQUE (email),
  INDEX idx_agents_sector (sector),
  INDEX idx_agents_online (isOnline)
);

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
  resolvedAt        TIMESTAMPTZ,
  
  -- Índices para performance e filtros
  INDEX idx_tickets_customer (customerId),
  INDEX idx_tickets_status (status),
  INDEX idx_tickets_sector (sector),
  INDEX idx_tickets_priority (priority),
  INDEX idx_tickets_assigned (assignedTo),
  INDEX idx_tickets_created (createdAt),
  
  -- Restrição: resolvedAt só pode ser setado se status = 'resolvido'
  CONSTRAINT check_resolved_at CHECK (
    (status = 'resolvido' AND resolvedAt IS NOT NULL) OR
    (status != 'resolvido' AND resolvedAt IS NULL)
  )
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
  mediaType     TEXT CHECK (mediaType IN ('audio', 'image', 'document')),
  sender        TEXT NOT NULL CHECK (sender IN ('customer', 'bot', 'human')),
  senderId      UUID,                 -- ID do agente humano ou NULL se bot/customer
  timestamp     TIMESTAMPTZ DEFAULT now(),
  rawPayload    JSONB,                -- Payload original do canal (para debug)
  
  -- Índices para performance
  INDEX idx_messages_customer (customerId),
  INDEX idx_messages_ticket (ticketId),
  INDEX idx_messages_timestamp (timestamp),
  INDEX idx_messages_external (externalId, channel)
);

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
  createdAt     TIMESTAMPTZ DEFAULT now(),
  
  -- Índices para auditoria e analytics
  INDEX idx_agent_logs_ticket (ticketId),
  INDEX idx_agent_logs_type (agentType),
  INDEX idx_agent_logs_action (action),
  INDEX idx_agent_logs_created (createdAt)
);

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
  createdAt       TIMESTAMPTZ DEFAULT now(),
  
  -- Índices para análise de fluxo
  INDEX idx_handoffs_ticket (ticketId),
  INDEX idx_handoffs_from (fromAgent),
  INDEX idx_handoffs_to (toAgent),
  INDEX idx_handoffs_created (createdAt)
);

-- ============================================================================
-- ROW LEVEL SECURITY (RLS)
-- ============================================================================

-- Habilitar RLS em todas as tabelas
ALTER TABLE customers ENABLE ROW LEVEL SECURITY;
ALTER TABLE tickets ENABLE ROW LEVEL SECURITY;
ALTER TABLE messages ENABLE ROW LEVEL SECURITY;
ALTER TABLE agent_logs ENABLE ROW LEVEL SECURITY;
ALTER TABLE handoffs ENABLE ROW LEVEL SECURITY;

-- Policy: Agentes só veem tickets do seu setor
CREATE POLICY agents_see_own_sector ON tickets
  FOR ALL
  USING (
    sector = (SELECT sector FROM agents WHERE email = current_setting('app.current_user_email')::text)
    OR
    (SELECT sector FROM agents WHERE email = current_setting('app.current_user_email')::text) = 'supervisor'
  );

-- Policy: Agentes veem mensagens apenas dos tickets que têm acesso
CREATE POLICY agents_see_own_ticket_messages ON messages
  FOR ALL
  USING (
    ticketId IN (
      SELECT id FROM tickets WHERE 
        sector = (SELECT sector FROM agents WHERE email = current_setting('app.current_user_email')::text)
        OR
        (SELECT sector FROM agents WHERE email = current_setting('app.current_user_email')::text) = 'supervisor'
    )
  );

-- ============================================================================
-- FUNÇÕES E TRIGGERS
-- ============================================================================

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

-- Função: Atualizar status do ticket quando resolvido
CREATE OR REPLACE FUNCTION update_ticket_status_on_resolve()
RETURNS TRIGGER AS $$
BEGIN
  UPDATE tickets 
  SET status = 'resolvido', 
      resolvedAt = now()
  WHERE id = NEW.ticketId;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

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
  (SELECT COUNT(*) * 100.0 / NULLIF((SELECT COUNT(*) FROM tickets WHERE status = 'resolvido'), 0) 
   FROM tickets WHERE status = 'resolvido' AND assignedTo IS NULL) as bot_containment_rate;

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
```

---

## 5. NFRs e Metas Técnicas

### 5.1 Requisitos Não Funcionais

| ID | Requisito | Meta | Estratégia de Atendimento |
|----|-----------|------|---------------------------|
| **NFR-01** | Disponibilidade | 99.5% uptime/mês | Railway com auto-healing + Supabase HA |
| **NFR-02** | Latência RouterAgent | < 3s | Gemini 2.0 Flash + Redis cache |
| **NFR-03** | Notificação humano | < 5s | Supabase Realtime + Push Telegram |
| **NFR-04** | LGPD | Anonimização 90 dias | Job cron + pseudonimização |
| **NFR-05** | Escalabilidade | 1000 tickets simultâneos | Connection pooling + rate limiting |
| **NFR-06** | Observabilidade | 100% decisões logadas | agent_logs com durationMs |

### 5.2 Metas de Performance

```typescript
// Limites de latência por componente
const LATENCY_BUDGETS = {
  gateway_webhook: 500,        // ms - Receber webhook → publicar fila
  router_classification: 1000, // ms - Gemini 2.0 Flash
  agent_response: 2000,        // ms - Agente especializado
  dashboard_realtime: 3000,    // ms - Ticket aparece na UI
  notification_push: 5000,     // ms - Notificação humano
};

// Total budget: < 10s do recebimento à resposta
```

---

## 6. Estratégia de Implantação

### 6.1 Ambiente

| Ambiente | URL | Uso |
|----------|-----|-----|
| **Production** | `paa-api.railway.app` | API Gateway + Agentes |
| **Dashboard** | `paa-dashboard.vercel.app` | Next.js Dashboard |
| **Database** | Supabase Cloud | PostgreSQL + Realtime |
| **Redis** | Railway Redis | Sessões + cache |

### 6.2 Variáveis de Ambiente (`.env`)

```bash
# API Gateway
PORT=3000
NODE_ENV=production

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# WhatsApp Cloud API (360Dialog)
WHATSAPP_API_KEY=xxx
WHATSAPP_PHONE_ID=xxx

# Telegram Bot
TELEGRAM_BOT_TOKEN=xxx

# IA (Google AI Studio)
GOOGLE_AI_API_KEY=xxx
GEMINI_MODEL_ROUTER=gemini-2.0-flash
GEMINI_MODEL_SUPPORT=gemini-1.5-pro
GEMINI_MODEL_FINANCE=gemini-2.0-flash

# Redis
REDIS_URL=redis://xxx

# Integrações
GURU_API_KEY=xxx
ASAAS_API_KEY=xxx

# Dashboard
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

---

## 7. Próximos Passos

### Fase 1 (MVP) - 5-7 semanas

1. **Semana 1-2:** Gateway Omnichannel (Epic 1)
   - Setup webhook WhatsApp
   - Integração Telegram (reutilizar ChefIA)
   - Normalização de mensagens

2. **Semana 3-5:** Sistema Multi-Agentes (Epic 2)
   - RouterAgent + SupportAgent
   - EscalationAgent
   - Schema Supabase

3. **Semana 6-7:** Dashboard Básica (Epic 3)
   - Fila de tickets
   - Chat inbox
   - Autenticação

### Dependências para Início

- [ ] @pm / @sm: Quebrar Epic 1 e Epic 2 em histórias
- [ ] @dev: Setup ambiente de desenvolvimento
- [ ] @devops: Configurar Supabase + Railway
- [ ] PO: Aprovar arquitetura

---

**Documento criado por:** Aria (Architect Agent)
**Handoff para:** @pm / @sm — Quebra de épicos em histórias
