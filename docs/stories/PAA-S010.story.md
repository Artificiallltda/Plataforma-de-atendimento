# Story: PAA-S010 — SalesAgent (Vendas e Qualificação)

---

## Status
**Current:** Ready for Review
**Sprint:** Fase 2 (Expansão)
**Épico:** E2 — Sistema Multi-Agentes de IA

---

## Story
Como um agente especializado em vendas, eu quero qualificar leads, fornecer informações sobre planos, gerar links de checkout e agendar demonstrações para que eu possa converter oportunidades em vendas sem necessidade de intervenção humana.

## Acceptance Criteria
- [ ] Implementar `SalesAgent` usando Gemini 1.5 Pro (mais contexto para negociação)
- [ ] Integrar ferramenta `getLeadProfile(phone)` para buscar histórico do lead
- [ ] Integrar ferramenta `sendPlanComparison()` para enviar tabela comparativa de planos
- [ ] Integrar ferramenta `generateCheckoutLink(planId)` para gerar link de compra via GURU
- [ ] Integrar ferramenta `scheduleDemo(datetime)` para agendar demonstração
- [ ] Integrar ferramenta `sendApprovedTemplate(templateId)` para enviar templates Meta pré-aprovados
- [ ] Implementar gatilho de escalada: Lead Enterprise (CNPJ, > 10 usuários) → escala para humano
- [ ] Implementar gatilho de escalada: Lead retornou 3+ vezes sem converter → personalização manual
- [ ] Logar todas as ações em `agent_logs` com tipo de lead e valor potencial
- [ ] Qualificar leads autonomamente: Básico, Premium, Enterprise

## Acceptance Criteria (Gherkin)
```gherkin
Feature: SalesAgent

Scenario: Qualificar lead e enviar comparação de planos
  Given lead envia "quero saber mais sobre os planos"
  When SalesAgent recebe o handoff do RouterAgent
  Then SalesAgent chama getLeadProfile(phone)
  And envia sendPlanComparison() com tabela comparativa
  And pergunta qual plano atende melhor a necessidade

Scenario: Gerar link de checkout
  Given lead demonstra interesse no plano Premium
  When SalesAgent identifica intenção de compra
  Then chama generateCheckoutLink(planId) no GURU
  And envia link de checkout para o lead
  And registra o lead como "quente" no CRM

Scenario: Agendar demonstração
  Given lead Enterprise solicita demonstração
  When SalesAgent identifica perfil Enterprise
  Then chama scheduleDemo(datetime)
  And confirma agendamento com lead
  And notifica time comercial sobre a demo

Scenario: Escalar lead Enterprise
  Given lead menciona CNPJ ou empresa > 10 usuários
  When SalesAgent identifica perfil Enterprise
  Then deve escalar para agente humano especializado
  And cria handoff com motivo "Lead Enterprise - alta prioridade"
  And registra valor potencial do lead
```

---

## Tasks
1. **Agent:** Criar `SalesAgent` em `src/agents/sales-agent.ts` [x]
2. **Prompt:** Implementar system prompt para vendas e negociação [x]
3. **Tools:** Criar ferramentas `getLeadProfile()`, `sendPlanComparison()`, `generateCheckoutLink()`, `scheduleDemo()`, `sendApprovedTemplate()` [x]
4. **Qualification:** Implementar qualificação de leads (Básico, Premium, Enterprise) [x]
5. **Escalation:** Implementar gatilhos de lead Enterprise e 3+ tentativas sem conversão [x]
6. **CRM Integration:** Registrar leads e status no Supabase [x]
7. **Logging:** Registrar ações com tipo de lead e valor potencial em agent_logs [x]
8. **Test:** Testes unitários das ferramentas [ ]
9. **Test:** Testes de integração (handoff → SalesAgent → conversão) [ ]

---

## Dev Notes

### Arquitetura de Referência
- **Fonte:** `docs/architecture/architecture.md#3-protocolo-de-handoff-entre-agentes`
- **Modelo:** Gemini 1.5 Pro (mais contexto para negociação)
- **Integrações:** GURU (checkout, planos), Supabase (leads, CRM)

### Perfis de Lead
| Perfil | Critérios | Ação |
|--------|-----------|------|
| **Básico** | Pessoa física, < 5 usuários | SalesAgent fecha autonomamente |
| **Premium** | Pessoa jurídica, 5-10 usuários | SalesAgent fecha, notifica comercial |
| **Enterprise** | CNPJ, > 10 usuários | Escala para humano especializado |

### Gatilhos de Escalada
- **Lead Enterprise:** CNPJ mencionado, > 10 usuários, necessidades customizadas
- **3+ interações sem conversão:** Lead precisa de abordagem personalizada
- **Solicitação de recurso customizado:** Fora do escopo dos planos padrão

### Variáveis de Ambiente
```bash
# Já existentes
GURU_API_KEY=xxx
GOOGLE_AI_API_KEY=xxx
```

### Dependências
- **PAA-S004:** Integração GURU já implementada
- **PAA-S006:** RouterAgent faz handoff para SalesAgent
- **PAA-S008:** EscalationAgent monitora decisões do SalesAgent

### Riscos e Mitigações
| Risco | Mitigação |
|-------|-----------|
| Lead Enterprise perdido | Escalada imediata + notificação time comercial |
| Link de checkout errado | Validação de planId antes de enviar |
| Demo agendada em conflito | Verificar disponibilidade antes de confirmar |
| Promessa de recurso inexistente | Validar informações com base de conhecimento |

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Habilitado

**Story Type Analysis:**
- **Primary Type:** API
- **Secondary Type(s):** Integration (GURU, CRM)
- **Complexity:** Medium (qualificação + integrações)

**Specialized Agent Assignment:**
- **Primary Agents:** @dev
- **Supporting Agents:** @architect (validação de fluxos de venda)

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Rodar `coderabbit --prompt-only -t uncommitted`
- [ ] Pre-PR (@github-devops): Rodar `coderabbit --prompt-only --base main`

**CodeRabbit Focus Areas:**
- **Primary Focus:**
  - Validação de links de checkout
  - Registro correto de leads no CRM
- **Secondary Focus:**
  - Mensagens de vendas persuasivas mas não agressivas
  - Logging de valor potencial do lead

---

## Dev Agent Record
### Agent Model Used
Gemini 1.5 Pro (via Qwen Code)

### Change Log
- 2026-03-29: Story created by @sm (River)
- 2026-03-29: Story started by @dev (Dex)
- 2026-03-29: Story completed by @dev (Dex) - SalesAgent implementado

### File List
- `src/agents/sales-agent.ts` - SalesAgent completo (450+ linhas)

### Debug Log
- SalesAgent implementa:
  - processMessage() - Processa mensagens de vendas
  - qualifyLead() - Qualifica lead (Básico, Premium, Enterprise)
  - getLeadProfile() - Busca histórico no CRM
  - sendPlanComparison() - Envia tabela comparativa
  - generateCheckoutLink() - Gera link via GURU
  - scheduleDemo() - Agenda demonstração
  - sendApprovedTemplate() - Envia templates
  - checkSalesEscalation() - Verifica gatilhos de escalada
- Configurações em SALES_CONFIG:
  - enterpriseUserThreshold: 10 funcionários
  - maxInteractionsWithoutConversion: 3
  - potentialValue: basico R$49, premium R$99, enterprise R$249
- Gatilhos de escalada:
  - Lead Enterprise (CNPJ ou >10 funcionários)
  - 3+ interações sem conversão
  - Solicitação de recurso customizado
- Planos definidos em PLANS (basico, premium, enterprise)
- Contador de interações por lead (reset após conversão)
- Integrações reutilizadas:
  - guru-service.ts (PAA-S004)

### Completion Notes
✅ Story implementada com sucesso. Pendências:
1. Testes unitários das ferramentas
2. Tabela 'demos' no Supabase para agendamentos

Próxima story: PAA-S011 (FeedbackAgent)

---

## ClickUp
- **Task ID:** [auto]
- **Epic Task ID:** [auto]
- **List:** Backlog
- **URL:** https://app.clickup.com/t/[auto]
- **Last Sync:** [auto]
