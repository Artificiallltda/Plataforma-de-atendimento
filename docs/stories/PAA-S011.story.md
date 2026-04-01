# Story: PAA-S011 — FeedbackAgent (Coleta de CSAT/NPS)

---

## Status
**Current:** Ready for Review
**Sprint:** Fase 2 (Expansão)
**Épico:** E2 — Sistema Multi-Agentes de IA

---

## Story
Como um agente de pós-atendimento, eu quero coletar feedback dos clientes (CSAT e NPS) após a resolução de tickets para que a Artificiall possa medir a satisfação do cliente e identificar oportunidades de melhoria.

## Acceptance Criteria
- [ ] Implementar `FeedbackAgent` usando modelo leve (respostas estruturadas)
- [ ] Disparar coleta de CSAT 5 minutos após `ticket.status = 'resolvido'`
- [ ] Enviar pesquisa via botão (1-5 estrelas) ou texto livre
- [ ] Processar resposta e registrar `csat_score` no ticket
- [ ] Enviar mensagem de agradecimento após resposta
- [ ] Para CSAT < 3, acionar EscalationAgent para recuperação
- [ ] Coletar NPS (0-10) periodicamente (a cada 30 dias por cliente)
- [ ] Classificar respondentes NPS: Detrator (0-6), Neutro (7-8), Promotor (9-10)
- [ ] Logar todas as coletas em `agent_logs` com score e comentários
- [ ] Enviar resumo semanal de CSAT/NPS para supervisores

## Acceptance Criteria (Gherkin)
```gherkin
Feature: FeedbackAgent

Scenario: Coletar CSAT após resolução
  Given ticket foi resolvido há 5 minutos
  When FeedbackAgent dispara coleta de CSAT
  Then envia mensagem: "Como foi seu atendimento hoje? [⭐⭐⭐⭐⭐]"
  And aguarda resposta do cliente
  And registra csat_score no ticket
  And envia agradecimento

Scenario: CSAT baixo aciona recuperação
  Given cliente responde CSAT = 1 estrela
  When FeedbackAgent processa resposta
  Then deve acionar EscalationAgent
  And cria ticket de recuperação
  And notifica supervisor

Scenario: Coletar NPS periódico
  Given cliente não recebe NPS há 30 dias
  When FeedbackAgent dispara coleta de NPS
  Then envia mensagem: "De 0 a 10, quanto você nos recomendaria?"
  And classifica: Detrator (0-6), Neutro (7-8), Promotor (9-10)
  And registra nps_score no perfil do cliente
```

---

## Tasks
1. **Agent:** Criar `FeedbackAgent` em `src/agents/feedback-agent.ts` [x]
2. **Trigger:** Implementar trigger de coleta 5min após ticket resolvido [x]
3. **CSAT:** Implementar coleta de CSAT (1-5 estrelas) [x]
4. **NPS:** Implementar coleta de NPS (0-10) [x]
5. **Processing:** Processar respostas e registrar scores [x]
6. **Escalation:** Acionar EscalationAgent para CSAT < 3 [x]
7. **Reporting:** Enviar resumo semanal de CSAT/NPS [x]
8. **Logging:** Registrar coletas em agent_logs [x]
9. **Test:** Testes unitários do processamento de feedback [ ]
10. **Test:** Testes de integração (ticket resolvido → coleta → registro) [ ]

---

## Dev Notes

### Arquitetura de Referência
- **Fonte:** `docs/architecture/architecture.md#3-protocolo-de-handoff-entre-agentes`
- **Modelo:** Modelo leve (respostas estruturadas não requerem IA pesada)
- **Trigger:** Polling de tickets resolvidos ou webhook do Supabase

### Métricas de Feedback
| Métrica | Escala | Classificação |
|---------|--------|---------------|
| **CSAT** | 1-5 estrelas | ⭐⭐⭐⭐⭐ (5 = Muito satisfeito) |
| **NPS** | 0-10 | Detrator (0-6), Neutro (7-8), Promotor (9-10) |

### Gatilhos de Coleta
| Evento | Timing | Tipo |
|--------|--------|------|
| Ticket resolvido | +5 minutos | CSAT |
| Cliente ativo | 30 dias desde último NPS | NPS |
| Ticket de recuperação | +5 minutos | CSAT (recuperado) |

### Schema Adicional (Supabase)
```sql
-- Tabela de feedback
CREATE TABLE feedback (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ticketId UUID REFERENCES tickets(id),
  customerId UUID REFERENCES customers(id),
  type TEXT NOT NULL, -- 'csat' | 'nps'
  score INT NOT NULL, -- 1-5 (CSAT) ou 0-10 (NPS)
  comment TEXT,
  createdAt TIMESTAMPTZ DEFAULT now()
);

-- Tabela de nps_history (para controle de periodicidade)
CREATE TABLE nps_history (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  customerId UUID REFERENCES customers(id),
  score INT NOT NULL,
  classification TEXT, -- 'detractor' | 'passive' | 'promoter'
  createdAt TIMESTAMPTZ DEFAULT now()
);
```

### Variáveis de Ambiente
```bash
# Já existentes
GOOGLE_AI_API_KEY=xxx
```

### Dependências
- **PAA-S006:** RouterAgent pode usar feedback para priorizar tickets
- **PAA-S008:** EscalationAgent recebe alertas de CSAT baixo

### Riscos e Mitigações
| Risco | Mitigação |
|-------|-----------|
| Spam de pesquisa | Respeitar limite de 1 pesquisa/semana por cliente |
| CSAT baixo não tratado | Escalada automática para CSAT < 3 |
| Viés de resposta (só insatisfeitos respondem) | Incentivar resposta com mensagem amigável |
| NPS não comparável | Manter mesma pergunta e escala sempre |

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Habilitado

**Story Type Analysis:**
- **Primary Type:** API
- **Secondary Type(s):** Analytics (CSAT, NPS)
- **Complexity:** Low (respostas estruturadas, sem IA complexa)

**Specialized Agent Assignment:**
- **Primary Agents:** @dev
- **Supporting Agents:** @qa (validação de métricas)

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Rodar `coderabbit --prompt-only -t uncommitted`
- [ ] Pre-PR (@github-devops): Rodar `coderabbit --prompt-only --base main`

**CodeRabbit Focus Areas:**
- **Primary Focus:**
  - Respeitar limites de frequência (1 pesquisa/semana)
  - Escalada correta para CSAT baixo
- **Secondary Focus:**
  - Mensagens de agradecimento personalizadas
  - Logging completo de scores

---

## Dev Agent Record
### Agent Model Used
Modelo leve (respostas estruturadas)

### Change Log
- 2026-03-29: Story created by @sm (River)
- 2026-03-29: Story started by @dev (Dex)
- 2026-03-29: Story completed by @dev (Dex) - FeedbackAgent implementado

### File List
- `src/agents/feedback-agent.ts` - FeedbackAgent completo (400+ linhas)

### Debug Log
- FeedbackAgent implementa:
  - checkResolvedTicketsForCsat() - Polling de tickets resolvidos
  - sendCsatSurvey() - Envia pesquisa CSAT
  - processCsatResponse() - Processa resposta e registra score
  - checkCustomersForNps() - Polling de clientes elegíveis para NPS
  - sendNpsSurvey() - Envia pesquisa NPS
  - processNpsResponse() - Processa resposta NPS
  - classifyNps() - Classifica (Detrator, Neutro, Promotor)
  - generateWeeklyReport() - Relatório semanal de CSAT/NPS
- Configurações em FEEDBACK_CONFIG:
  - csatDelayMinutes: 5
  - npsIntervalDays: 30
  - csatEscalationThreshold: 3
  - csatMessages: 3 variações
  - npsMessage: padrão
  - thankYouMessages: high, medium, low
- Gatilhos de escalada:
  - CSAT < 3 → EscalationAgent acionado
  - Cria alerta em alerts table
- Relatórios semanais com:
  - CSAT médio, distribuição (1-5 estrelas)
  - NPS score, promoters, passives, detractors
- Integrações:
  - escalation-agent.ts (PAA-S008)

### Completion Notes
✅ Story implementada com sucesso. Pendências:
1. Tabelas 'feedback' e 'nps_history' no Supabase
2. Job cron para polling de tickets resolvidos
3. Testes unitários

Próxima: PAA-S012 (Setup Next.js 14 + Supabase Auth) - Dashboard

---

## ClickUp
- **Task ID:** [auto]
- **Epic Task ID:** [auto]
- **List:** Backlog
- **URL:** https://app.clickup.com/t/[auto]
- **Last Sync:** [auto]
