-- ============================================================================
-- PLATAFORMA DE ATENDIMENTO ARTIFICIALl (PAA)
-- Schema SQL - Supabase PostgreSQL
-- Migration: 002_feedback_and_demos
-- Versão: 1.1.0 | Data: 2026-03-29
-- ============================================================================

-- ============================================================================
-- TABELA: feedback
-- Descrição: Feedback dos clientes (CSAT e NPS)
-- ============================================================================
CREATE TABLE feedback (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticketId      UUID REFERENCES tickets(id) ON DELETE CASCADE,
  customerId    UUID REFERENCES customers(id) ON DELETE CASCADE,
  type          TEXT NOT NULL CHECK (type IN ('csat', 'nps')),
  score         INT NOT NULL,  -- 1-5 (CSAT) ou 0-10 (NPS)
  comment       TEXT,
  createdAt     TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_feedback_ticket ON feedback(ticketId);
CREATE INDEX idx_feedback_customer ON feedback(customerId);
CREATE INDEX idx_feedback_type ON feedback(type);
CREATE INDEX idx_feedback_created ON feedback(createdAt);
CREATE INDEX idx_feedback_score ON feedback(score);

-- ============================================================================
-- TABELA: nps_history
-- Descrição: Histórico de NPS por cliente (para controle de periodicidade)
-- ============================================================================
CREATE TABLE nps_history (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customerId    UUID REFERENCES customers(id) ON DELETE CASCADE,
  score         INT NOT NULL CHECK (score >= 0 AND score <= 10),
  classification TEXT NOT NULL CHECK (classification IN ('detractor', 'passive', 'promoter')),
  createdAt     TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_nps_history_customer ON nps_history(customerId);
CREATE INDEX idx_nps_history_created ON nps_history(createdAt);
CREATE INDEX idx_nps_history_classification ON nps_history(classification);

-- ============================================================================
-- TABELA: demos
-- Descrição: Demonstrações agendadas pelo SalesAgent
-- ============================================================================
CREATE TABLE demos (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  leadId        UUID REFERENCES customers(id) ON DELETE CASCADE,
  scheduledAt   TIMESTAMPTZ NOT NULL,
  status        TEXT DEFAULT 'scheduled' CHECK (status IN ('scheduled', 'completed', 'cancelled', 'no_show')),
  notes         TEXT,
  commercialId  UUID REFERENCES agents(id),  -- Agente comercial responsável
  createdAt     TIMESTAMPTZ DEFAULT now()
);

-- Índices para performance
CREATE INDEX idx_demos_lead ON demos(leadId);
CREATE INDEX idx_demos_scheduled ON demos(scheduledAt);
CREATE INDEX idx_demos_status ON demos(status);

-- ============================================================================
-- TABELA: technical_tickets
-- Descrição: Tickets técnicos reportados pelo SupportAgent
-- ============================================================================
CREATE TABLE technical_tickets (
  id                UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customerId        UUID REFERENCES customers(id) ON DELETE CASCADE,
  ticketId          UUID REFERENCES tickets(id) ON DELETE CASCADE,
  error             TEXT NOT NULL,
  stepsToReproduce  JSONB,  -- Array de strings em JSON
  expectedBehavior  TEXT NOT NULL,
  actualBehavior    TEXT NOT NULL,
  severity          TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status            TEXT DEFAULT 'aberto' CHECK (status IN ('aberto', 'em_analise', 'resolvido', 'fechado')),
  reportedAt        TIMESTAMPTZ DEFAULT now(),
  resolvedAt        TIMESTAMPTZ
);

-- Índices para performance
CREATE INDEX idx_tech_tickets_customer ON technical_tickets(customerId);
CREATE INDEX idx_tech_tickets_ticket ON technical_tickets(ticketId);
CREATE INDEX idx_tech_tickets_status ON technical_tickets(status);
CREATE INDEX idx_tech_tickets_severity ON technical_tickets(severity);
CREATE INDEX idx_tech_tickets_created ON technical_tickets(reportedAt);

-- ============================================================================
-- VIEWS PARA RELATÓRIOS
-- ============================================================================

-- View: CSAT médio por período
CREATE VIEW v_csat_summary AS
SELECT 
  DATE_TRUNC('day', createdAt) as date,
  COUNT(*) as count,
  AVG(score) as average,
  MIN(score) as min,
  MAX(score) as max,
  PERCENTILE_CONT(0.5) WITHIN GROUP (ORDER BY score) as median
FROM feedback
WHERE type = 'csat'
GROUP BY DATE_TRUNC('day', createdAt);

-- View: NPS por período
CREATE VIEW v_nps_summary AS
SELECT 
  DATE_TRUNC('day', createdAt) as date,
  COUNT(*) as total,
  SUM(CASE WHEN classification = 'promoter' THEN 1 ELSE 0 END) as promoters,
  SUM(CASE WHEN classification = 'passive' THEN 1 ELSE 0 END) as passives,
  SUM(CASE WHEN classification = 'detractor' THEN 1 ELSE 0 END) as detractors,
  CASE 
    WHEN COUNT(*) > 0 THEN 
      ROUND(((SUM(CASE WHEN classification = 'promoter' THEN 1 ELSE 0 END) - 
              SUM(CASE WHEN classification = 'detractor' THEN 1 ELSE 0 END)) * 100.0 / COUNT(*)))
    ELSE 0 
  END as nps_score
FROM nps_history
GROUP BY DATE_TRUNC('day', createdAt);

-- View: Demos agendadas por status
CREATE VIEW v_demos_summary AS
SELECT 
  status,
  COUNT(*) as count,
  DATE_TRUNC('day', scheduledAt) as date
FROM demos
GROUP BY status, DATE_TRUNC('day', scheduledAt);

-- View: Tickets técnicos por severidade
CREATE VIEW v_tech_tickets_summary AS
SELECT 
  severity,
  status,
  COUNT(*) as count
FROM technical_tickets
GROUP BY severity, status;

-- ============================================================================
-- FUNÇÕES E TRIGGERS
-- ============================================================================

-- Função: Calcular NPS automaticamente
CREATE OR REPLACE FUNCTION calculate_nps_score(start_date TIMESTAMPTZ, end_date TIMESTAMPTZ)
RETURNS INT AS $$
DECLARE
  promoters INT;
  passives INT;
  detractors INT;
  total INT;
BEGIN
  SELECT 
    SUM(CASE WHEN classification = 'promoter' THEN 1 ELSE 0 END),
    SUM(CASE WHEN classification = 'passive' THEN 1 ELSE 0 END),
    SUM(CASE WHEN classification = 'detractor' THEN 1 ELSE 0 END)
  INTO promoters, passives, detractors
  FROM nps_history
  WHERE createdAt >= start_date AND createdAt <= end_date;

  total := promoters + passives + detractors;

  IF total = 0 THEN
    RETURN 0;
  END IF;

  RETURN ROUND(((promoters - detractors) * 100.0 / total));
END;
$$ LANGUAGE plpgsql;

-- ============================================================================
-- SEED DATA (Opcional)
-- ============================================================================

-- Inserir alguns feedbacks de exemplo (remover em produção)
-- INSERT INTO feedback (ticketId, customerId, type, score, comment) VALUES
--   ('ticket-id-1', 'customer-id-1', 'csat', 5, 'Excelente atendimento!'),
--   ('ticket-id-2', 'customer-id-2', 'csat', 4, 'Muito bom, mas pode melhorar.'),
--   ('ticket-id-3', 'customer-id-3', 'csat', 2, 'Demorou para resolver.');

-- ============================================================================
-- COMENTÁRIOS DE DOCUMENTAÇÃO
-- ============================================================================

COMMENT ON TABLE feedback IS 'Feedback dos clientes (CSAT e NPS)';
COMMENT ON TABLE nps_history IS 'Histórico de NPS por cliente para controle de periodicidade';
COMMENT ON TABLE demos IS 'Demonstrações agendadas pelo SalesAgent';
COMMENT ON TABLE technical_tickets IS 'Tickets técnicos reportados pelo SupportAgent para a equipe de desenvolvimento';

COMMENT ON COLUMN feedback.score IS '1-5 para CSAT, 0-10 para NPS';
COMMENT ON COLUMN nps_history.classification IS 'detractor (0-6), passive (7-8), promoter (9-10)';
COMMENT ON COLUMN demos.status IS 'scheduled, completed, cancelled, no_show';
COMMENT ON COLUMN technical_tickets.severity IS 'low, medium, high, critical';
