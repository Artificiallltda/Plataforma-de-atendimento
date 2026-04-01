# Story: PAA-S009 — FinanceAgent (Cobranças e Pagamentos)

---

## Status
**Current:** Ready for Review
**Sprint:** Fase 2 (Expansão)
**Épico:** E2 — Sistema Multi-Agentes de IA

---

## Story
Como um agente especializado em questões financeiras, eu quero resolver autonomamente problemas de cobrança, faturas, reembolsos e pagamentos usando integrações com Asaas e GURU para que eu possa resolver a maioria das questões financeiras sem escalar para um agente humano.

## Acceptance Criteria
- [ ] Implementar `FinanceAgent` usando Gemini 2.0 Flash (velocidade para transações)
- [ ] Integrar ferramenta `getInvoice(customerId)` para buscar faturas no Asaas
- [ ] Integrar ferramenta `resendBoleto(invoiceId)` para reenviar boleto/Pix
- [ ] Integrar ferramenta `processRefund(invoiceId, amount)` para solicitar estorno
- [ ] Integrar ferramenta `checkSubscription(customerId)` para verificar assinatura no GURU
- [ ] Integrar ferramenta `applyRetentionCoupon(customerId, discount)` para reter clientes
- [ ] Implementar regra de negócio: reembolso ≤ R$100 autônomo, > R$100 requer aprovação humana
- [ ] Implementar gatilho de escalada: 2ª solicitação de estorno do mesmo cliente → escalação imediata
- [ ] Logar todas as ações em `agent_logs` com toolsUsed e valores monetários
- [ ] Responder autonomamente: 2ª via de boleto, situação de fatura, cancelamento de assinatura

## Acceptance Criteria (Gherkin)
```gherkin
Feature: FinanceAgent

Scenario: Reenviar boleto autonomamente
  Given cliente envia "não recebi meu boleto do mês"
  When FinanceAgent recebe o handoff do RouterAgent
  Then FinanceAgent chama getInvoice(customerId) no Asaas
  And retorna fatura com status = 'pendente'
  Then chama resendBoleto(invoiceId)
  And confirma para o cliente que o boleto/Pix foi reenviado
  And finaliza o ticket

Scenario: Reembolso dentro do limite autônomo
  Given cliente solicita reembolso de R$49,90
  And está dentro dos 7 dias de garantia
  When FinanceAgent chama processRefund(invoiceId, 49.90)
  Then o estorno é registrado no Asaas
  And cliente recebe confirmação com prazo de devolução
  And ticket é encerrado automaticamente

Scenario: Reembolso acima do limite requer aprovação
  Given cliente solicita reembolso de R$150,00
  When FinanceAgent identifica valor > R$100
  Then deve escalar para agente humano
  And cria handoff com motivo "Reembolso > R$100 requer aprovação"
  And notifica cliente que um especialista irá atender

Scenario: Aplicar cupom de retenção
  Given cliente diz "quero cancelar, está caro"
  When FinanceAgent identifica intenção de cancelamento
  And verifica assinatura ativa no GURU
  Then oferece cupom de 30% OFF por 3 meses
  And se cliente aceitar, chama applyRetentionCoupon()
  And registra a retenção em agent_logs
```

---

## Tasks
1. **Agent:** Criar `FinanceAgent` em `src/agents/finance-agent.ts` [x]
2. **Prompt:** Implementar system prompt para questões financeiras [x]
3. **Tools:** Criar ferramentas `getInvoice()`, `resendBoleto()`, `processRefund()`, `checkSubscription()`, `applyRetentionCoupon()` [x]
4. **Business Rules:** Implementar regra de reembolso ≤ R$100 autônomo [x]
5. **Escalation:** Implementar gatilho de 2ª solicitação de estorno [x]
6. **Logging:** Registrar ações com valores monetários em agent_logs [x]
7. **Test:** Testes unitários das ferramentas [ ]
8. **Test:** Testes de integração (handoff → FinanceAgent → resolução) [ ]

---

## Dev Notes

### Arquitetura de Referência
- **Fonte:** `docs/architecture/architecture.md#3-protocolo-de-handoff-entre-agentes`
- **Modelo:** Gemini 2.0 Flash (velocidade para transações financeiras)
- **Integrações:** Asaas (faturas, reembolsos), GURU (assinaturas, cupons)

### Regras de Negócio Críticas
| Regra | Implementação |
|-------|--------------|
| Reembolso ≤ R$100 | FinanceAgent executa autonomamente |
| Reembolso > R$100 | Pausa e aguarda aprovação humana |
| 2ª solicitação de estorno | Escalada imediata para humano |
| Cupom de retenção | Máximo 30% OFF por 3 meses (pré-aprovado) |

### Variáveis de Ambiente
```bash
# Já existentes da Fase 1
ASAAS_API_KEY=xxx
GURU_API_KEY=xxx
GOOGLE_AI_API_KEY=xxx
```

### Dependências
- **PAA-S004:** Integrações GURU/Asaas já implementadas
- **PAA-S006:** RouterAgent faz handoff para FinanceAgent
- **PAA-S008:** EscalationAgent monitora decisões do FinanceAgent

### Riscos e Mitigações
| Risco | Mitigação |
|-------|-----------|
| Reembolso indevido | Validação de limite R$100 + logging completo |
| Cupom aplicado errado | Validação de desconto máximo (30%) |
| Dados financeiros expostos | Nunca logar CPF completo, apenas últimos 4 dígitos |
| Duplo estorno | Verificar histórico de estornos do cliente |

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Habilitado

**Story Type Analysis:**
- **Primary Type:** API
- **Secondary Type(s):** Security (dados financeiros), Integration (Asaas, GURU)
- **Complexity:** High (regras de negócio críticas + integrações)

**Specialized Agent Assignment:**
- **Primary Agents:** @dev, @architect
- **Supporting Agents:** @qa (validação de regras de negócio)

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Rodar `coderabbit --prompt-only -t uncommitted`
- [ ] Pre-PR (@github-devops): Rodar `coderabbit --prompt-only --base main`

**CodeRabbit Focus Areas:**
- **Primary Focus:**
  - Validação de limites monetários (R$100)
  - Segurança: Não expor dados sensíveis (CPF, valores completos em logs)
  - Idempotência: Evitar duplicação de reembolsos
- **Secondary Focus:**
  - Logging completo de transações
  - Tratamento de erro em integrações

---

## Dev Agent Record
### Agent Model Used
Gemini 2.0 Flash (via Qwen Code)

### Change Log
- 2026-03-29: Story created by @sm (River)
- 2026-03-29: Story started by @dev (Dex)
- 2026-03-29: Story completed by @dev (Dex) - FinanceAgent implementado

### File List
- `src/agents/finance-agent.ts` - FinanceAgent completo (450+ linhas)

### Debug Log
- FinanceAgent implementa:
  - processMessage() - Processa mensagens financeiras
  - getInvoice() - Busca faturas no Asaas
  - resendBoleto() - Reenvia boleto/Pix
  - processRefund() - Processa reembolso com validação de limite
  - checkSubscription() - Verifica assinatura no GURU
  - applyRetentionCoupon() - Aplica cupom de retenção (máx 30%/3 meses)
  - checkFinancialEscalation() - Verifica gatilhos de escalada
- Regras de negócio implementadas em FINANCE_CONFIG:
  - autonomousRefundLimit: R$ 100,00
  - guaranteeDays: 7 dias
  - maxRetentionDiscount: 30%
  - maxCouponDuration: 3 meses
- Gatilhos de escalada:
  - Reembolso > R$100 → escala automática
  - 2ª solicitação de estorno → escala imediata
  - Palavras-chave de crise (procon, advogado) → escala
- Contador de reembolsos por cliente (reset após resolução)
- Integrações reutilizadas:
  - asaas-service.ts (PAA-S004)
  - guru-service.ts (PAA-S004)

### Completion Notes
✅ Story implementada com sucesso. Pendências:
1. Testes unitários das ferramentas
2. Testes de integração com handoff do RouterAgent

Próxima story: PAA-S010 (SalesAgent)

---

## ClickUp
- **Task ID:** [auto]
- **Epic Task ID:** [auto]
- **List:** Backlog
- **URL:** https://app.clickup.com/t/[auto]
- **Last Sync:** [auto]
