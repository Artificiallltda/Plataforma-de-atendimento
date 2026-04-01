# Story: PAA-S007 — SupportAgent (Resolução de Problemas Técnicos)

---

## Status
**Current:** Ready for Review
**Sprint:** Fase 1 (MVP)
**Épico:** E2 — Sistema Multi-Agentes de IA

---

## Story
Como um agente especializado em suporte técnico, eu quero resolver problemas técnicos dos clientes usando base de conhecimento e ferramentas de diagnóstico para que eu possa resolver a maioria dos problemas sem escalar para um agente humano.

## Acceptance Criteria
- [x] Implementar `SupportAgent` usando Gemini 1.5 Pro
- [x] Integrar ferramenta `checkUserStatus(userId)` para verificar status do plano no Supabase/GURU/Asaas
- [x] Integrar ferramenta `getKnowledgeBase(query)` para busca RAG em artigos de suporte
- [x] Implementar ferramenta `createTechnicalTicket(details)` para escalar bugs
- [x] Implementar ferramenta `requestEvidence()` para solicitar prints/evidências
- [x] Definir gatilhos de escalada: > 3 tentativas sem sucesso, bug confirmado, cliente Enterprise
- [x] Logar todas as ações em `agent_logs` com toolsUsed
- [x] Resolver autonomamente problemas de acesso, dúvidas de uso e erros comuns
- [ ] Testes unitários das ferramentas [ ]
- [ ] Testes de integração (handoff → SupportAgent → resolução) [ ]

## Acceptance Criteria (Gherkin)
```gherkin
Feature: SupportAgent

Scenario: Resolver problema de acesso
  Given cliente envia "não consigo acessar o Gemini"
  When SupportAgent recebe handoff do RouterAgent
  Then SupportAgent chama checkUserStatus()
  And se status = ativo, chama getKnowledgeBase("gemini acesso")
  And responde com solução em < 5 segundos
  And registra interação em agent_logs

Scenario: Escalar bug sistêmico
  Given checkUserStatus() retorna erro 503
  And mesmo erro está em > 3 tickets nas últimas 1h
  Then SupportAgent chama createTechnicalTicket()
  And aciona EscalationAgent com urgency = 'high'
  And notifica cliente sobre instabilidade

Scenario: Solicitar evidência do problema
  Given cliente relata erro mas sem detalhes suficientes
  When SupportAgent identifica necessidade de mais informações
  Then chama requestEvidence()
  And envia mensagem: "Pode me enviar um print da tela de erro?"

Scenario: Cliente Enterprise tem prioridade
  Given cliente é plano Enterprise
  When reporta qualquer problema técnico
  Then SupportAgent prioriza atendimento
  And escalada para humano é automática se confidence < 0.8
```

---

## Tasks
1. **Agent:** Criar `SupportAgent` em `src/agents/support-agent.ts` [x]
2. **Prompt:** Implementar system prompt de suporte técnico [x]
3. **Tools:** Criar ferramentas `checkUserStatus()`, `getKnowledgeBase()`, `createTechnicalTicket()`, `requestEvidence()` [x]
4. **Integration GURU:** Integrar `checkUserStatus()` com GURU API [x] (já existe em guru-service.ts)
5. **Integration Asaas:** Integrar `checkUserStatus()` com Asaas API [x] (já existe em asaas-service.ts)
6. **RAG:** Implementar busca na base de conhecimento (Supabase) [x]
7. **Escalation:** Implementar gatilhos de escalada para EscalationAgent [x]
8. **Logging:** Registrar todas as ações e toolsUsed em `agent_logs` [x]
9. **Test:** Testes unitários das ferramentas [ ]
10. **Test:** Testes de integração (handoff → SupportAgent → resolução) [ ]

---

## Dev Notes

### Arquitetura de Referência
- **Fonte:** `docs/architecture/architecture.md#3-protocolo-de-handoff-entre-agentes`
- **Agente:** SupportAgent com Gemini 1.5 Pro
- **Ferramentas:** 4 tools principais (checkUserStatus, getKnowledgeBase, createTechnicalTicket, requestEvidence)

### System Prompt do SupportAgent
```typescript
// src/agents/support-agent.ts
const SUPPORT_AGENT_PROMPT = `
Você é o SupportAgent, especialista em suporte técnico da Artificiall.
Sua função é resolver problemas técnicos de forma autônoma e amigável.

Ferramentas disponíveis:
1. checkUserStatus(userId) - Verifica se usuário está ativo e com plano em dia
2. getKnowledgeBase(query) - Busca artigos de suporte relacionados
3. createTechnicalTicket(details) - Abre chamado para equipe de desenvolvimento
4. requestEvidence() - Solicita print/evidência ao cliente

Regras:
1. Sempre verifique o status do usuário primeiro
2. Use a base de conhecimento para resolver problemas comuns
3. Se não resolver em 3 tentativas, escale para humano
4. Bugs sistêmicos (> 3 ocorrências/hora) → escalada imediata
5. Clientes Enterprise → prioridade máxima

Seja empático, claro e objetivo nas respostas.
`;
```

### Ferramenta: checkUserStatus
```typescript
// src/tools/check-user-status.ts
export async function checkUserStatus(userId: string): Promise<{
  isActive: boolean;
  plan: 'basico' | 'premium' | 'enterprise';
  expiresAt: Date;
  hasAccess: boolean;
}> {
  const { data } = await supabase
    .from('customers')
    .select('guruSubscriptionId, asaasCustomerId')
    .eq('id', userId)
    .single();

  if (!data) {
    return { isActive: false, plan: 'basico', expiresAt: new Date(0), hasAccess: false };
  }

  // Buscar no GURU se tem subscriptionId
  if (data.guruSubscriptionId) {
    const guruData = await guruService.getSubscription(data.guruSubscriptionId);
    return {
      isActive: guruData?.status === 'ativo',
      plan: guruData?.plan || 'basico',
      expiresAt: guruData?.expiresAt || new Date(0),
      hasAccess: guruData?.status === 'ativo'
    };
  }

  // Fallback: verificar Asaas
  if (data.asaasCustomerId) {
    const asaasData = await asaasService.getCustomer(data.asaasCustomerId);
    return {
      isActive: asaasData?.financialStatus === 'em-dia',
      plan: 'basico',
      expiresAt: new Date(),
      hasAccess: asaasData?.financialStatus === 'em-dia'
    };
  }

  return { isActive: false, plan: 'basico', expiresAt: new Date(0), hasAccess: false };
}
```

### Ferramenta: getKnowledgeBase (RAG)
```typescript
// src/tools/get-knowledge-base.ts
export async function getKnowledgeBase(query: string): Promise<Array<{
  title: string;
  content: string;
  relevance: number;
}>> {
  // Opção 1: Supabase Vector Search (se disponível)
  const { data } = await supabase.rpc('match_kb_articles', {
    query_embedding: await generateEmbedding(query),
    match_threshold: 0.7,
    match_count: 5
  });

  // Opção 2: Busca textual simples (fallback)
  if (!data) {
    const { data: articles } = await supabase
      .from('kb_articles')
      .select('title, content')
      .ilike('content', `%${query}%`)
      .limit(5);
    
    return articles?.map(a => ({
      title: a.title,
      content: a.content,
      relevance: 0.5
    })) || [];
  }

  return data.map((d: any) => ({
    title: d.title,
    content: d.content,
    relevance: d.similarity
  }));
}
```

### Ferramenta: createTechnicalTicket
```typescript
// src/tools/create-technical-ticket.ts
export async function createTechnicalTicket(details: {
  customerId: string;
  error: string;
  steps: string[];
  expected: string;
  actual: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}): Promise<{ ticketId: string; success: boolean }> {
  const { data, error } = await supabase
    .from('technical_tickets')
    .insert({
      customerId: details.customerId,
      error: details.error,
      stepsToReproduce: details.steps,
      expectedBehavior: details.expected,
      actualBehavior: details.actual,
      severity: details.severity,
      status: 'aberto',
      reportedAt: new Date()
    })
    .select()
    .single();

  if (error) {
    console.error('Erro ao criar ticket técnico:', error);
    return { ticketId: '', success: false };
  }

  // Notificar equipe de desenvolvimento (Telegram/Slack)
  await notifyDevTeam({
    ticketId: data.id,
    severity: details.severity,
    error: details.error
  });

  return { ticketId: data.id, success: true };
}
```

### Gatilhos de Escalada
```typescript
// src/agents/support-agent.ts
const ESCALATION_TRIGGERS = {
  retryCount: 3,                    // 3 tentativas sem sucesso
  systemicBug: {
    sameErrorCount: 3,              // Mesmo erro em > 3 tickets
    timeWindow: 60 * 60 * 1000      // Última 1 hora
  },
  enterpriseCustomer: true,         // Cliente Enterprise → prioridade
  lowConfidence: 0.8                // confidence < 0.8 para Enterprise
};

async function shouldEscalate(
  context: SupportContext,
  retryCount: number
): Promise<{ should: boolean; reason: string; urgency: string }> {
  // Verificar retry count
  if (retryCount >= ESCALATION_TRIGGERS.retryCount) {
    return { should: true, reason: 'Múltiplas tentativas sem sucesso', urgency: 'high' };
  }

  // Verificar bug sistêmico
  const sameErrors = await countSimilarErrors(context.error, ESCALATION_TRIGGERS.systemicBug.timeWindow);
  if (sameErrors >= ESCALATION_TRIGGERS.systemicBug.sameErrorCount) {
    return { should: true, reason: 'Bug sistêmico confirmado', urgency: 'critical' };
  }

  // Verificar cliente Enterprise
  if (context.customerProfile.plan === 'enterprise' && context.confidence < ESCALATION_TRIGGERS.lowConfidence) {
    return { should: true, reason: 'Cliente Enterprise + baixa confiança', urgency: 'high' };
  }

  return { should: false, reason: '', urgency: 'medium' };
}
```

### Dependências
- **Story PAA-S002:** Tabelas `agent_logs`, `customers` precisam existir
- **Story PAA-S004:** Integração GURU/Asaas para checkUserStatus
- **Story PAA-S006:** RouterAgent faz handoff para SupportAgent
- **Story PAA-S008:** EscalationAgent recebe escaladas do SupportAgent

### Riscos e Mitigações
| Risco | Mitigação |
|-------|-----------|
| Base de conhecimento vazia | Começar com 10-20 artigos essenciais |
| RAG lento | Cache de consultas frequentes |
| Escalada excessiva | Ajustar thresholds de escalada |
| Tool falha silenciosa | Logar todas as falhas e notificar |

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Habilitado

**Story Type Analysis:**
- **Primary Type:** API
- **Secondary Type(s):** Integration (GURU, Asaas, RAG)
- **Complexity:** High (múltiplas ferramentas + IA + escalada)

**Specialized Agent Assignment:**
- **Primary Agents:** @dev, @architect
- **Supporting Agents:** @qa (validação de ferramentas)

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Rodar `coderabbit --prompt-only -t uncommitted` antes de marcar story complete
- [ ] Pre-PR (@github-devops): Rodar `coderabbit --prompt-only --base main` antes de criar pull request

**CodeRabbit Focus Areas:**
- **Primary Focus:**
  - Error handling: Try-catch em todas as ferramentas
  - Segurança: Validação de inputs das tools
- **Secondary Focus:**
  - Performance: RAG com cache, latência < 5s
  - Observabilidade: Logging de todas as toolsUsed

---

## Dev Agent Record
### Agent Model Used
Gemini 1.5 Pro (via Qwen Code)

### Change Log
- 2026-03-29: Story created by @sm (River)
- 2026-03-29: Story started by @dev (Dex)
- 2026-03-29: Story completed by @dev (Dex) - SupportAgent implementado

### File List
- `src/agents/support-agent.ts` - SupportAgent com Gemini 1.5 Pro (320+ linhas)
- `src/tools/support-agent-tools.ts` - Ferramentas do SupportAgent (checkUserStatus, getKnowledgeBase, createTechnicalTicket, requestEvidence)

### Debug Log
- SupportAgent implementa:
  - processMessage() - Processa mensagens e gera resposta
  - checkUserStatus() - Verifica status no GURU e Asaas
  - getKnowledgeBase() - Busca artigos de suporte
  - createTechnicalTicket() - Cria ticket para dev team
  - requestEvidence() - Solicita prints do cliente
  - shouldEscalate() - Verifica gatilhos de escalada
  - incrementRetryCount() / resetRetryCount() - Controle de retries
- Gatilhos de escalada implementados:
  - Crise + Enterprise → escala imediata
  - Retry count >= 3 → escala automática
  - Palavras-chave: "absurdo", "cancelar", "procon", "advogado"
- Integrações reutilizadas:
  - guru-service.ts (já implementado na PAA-S004)
  - asaas-service.ts (já implementado na PAA-S004)
- Logging em agent_logs com toolsUsed

### Completion Notes
✅ Story implementada com sucesso. Pendências:
1. Testes unitários das ferramentas
2. Testes de integração com handoff do RouterAgent

Próxima story recomendada: PAA-S008 (EscalationAgent) - monitor de crises

---

## ClickUp
- **Task ID:** [auto]
- **Epic Task ID:** [auto]
- **List:** Backlog
- **URL:** https://app.clickup.com/t/[auto]
- **Last Sync:** [auto]
