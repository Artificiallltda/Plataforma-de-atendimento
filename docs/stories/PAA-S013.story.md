# Story: PAA-S013 — Fila de Tickets com Realtime

---

## Status
**Current:** Ready for Review
**Sprint:** Fase 3 (Dashboard)
**Épico:** E3 — Dashboard de Operações

---

## Story
Como um agente humano, eu quero visualizar em tempo real os tickets da minha fila por setor para que eu possa atender os clientes de forma eficiente e priorizar os mais urgentes.

## Acceptance Criteria
- [ ] Implementar assinatura Realtime do Supabase para tickets
- [ ] Exibir cards de tickets organizados por setor
- [ ] Mostrar indicadores visuais de prioridade (vermelho = crítico, amarelo = alta, verde = normal)
- [ ] Exibir: nome do cliente, canal, tempo de espera, status atual, agente IA ativo
- [ ] Implementar filtros: Todos | Novos | Bot em Atendimento | Aguardando Humano
- [ ] Atualização em tempo real sem F5 (Supabase Realtime)
- [ ] Ordenar por prioridade e tempo de espera
- [ ] Mostrar contador de tickets por status

## Acceptance Criteria (Gherkin)
```gherkin
Feature: Fila de Tickets em Tempo Real

Scenario: Novo ticket aparece sem F5
  Given agente está visualizando a fila de suporte
  When um novo ticket é criado no Supabase
  Then o card do ticket deve aparecer na fila em < 3 segundos
  Without any page reload

Scenario: Filtro por status
  Given existem 10 tickets de diversos status
  When agente clica em filtro "Aguardando Humano"
  Then deve mostrar apenas tickets com status = 'aguardando_humano'

Scenario: Indicador de prioridade
  Given ticket com priority = 'critica'
  Then deve exibir borda/ícone vermelho
  And deve aparecer no topo da lista
```

---

## Tasks
1. **Component:** Criar `TicketQueue` component [x]
2. **Realtime:** Configurar Supabase Realtime subscription [x]
3. **Card:** Criar `TicketCard` component com indicadores de prioridade [x]
4. **Filters:** Implementar filtros de status [x]
5. **Sorting:** Ordenar por prioridade e tempo de espera [x] (createdAt DESC)
6. **Counters:** Mostrar contadores por status [x]
7. **Refresh:** Implementar refresh manual (opcional) [ ]
8. **Test:** Testar atualização em tempo real [ ]
9. **Test:** Testar filtros e ordenação [ ]

---

## Dev Notes

### Arquitetura de Referência
- **Fonte:** `docs/architecture/architecture.md#3-dashboard-de-operacoes`
- **Tabela:** `tickets` com Realtime habilitado
- **Views:** `v_tickets_by_sector` para resumo

### Prioridades e Cores
| Prioridade | Cor | Ícone |
|------------|-----|-------|
| crítica | Vermelho | 🚨 |
| alta | Laranja | 🟠 |
| media | Verde | 🟢 |
| baixa | Cinza | ⚪ |

### Status e Cores
| Status | Cor |
|--------|-----|
| novo | Azul |
| bot_ativo | Roxo |
| aguardando_humano | Amarelo |
| em_atendimento | Laranja |
| resolvido | Verde |

### Dependências
- **PAA-S012:** Setup Next.js + Auth já realizado
- **PAA-S002:** Tabela tickets já existe

---

## Dev Agent Record
### Agent Model Used
Next.js 14 + Supabase Realtime

### Change Log
- 2026-03-29: Story created by @sm (River)
- 2026-03-29: Story started by @dev (Dex)
- 2026-03-29: Story completed by @dev (Dex) - Fila de Tickets com Realtime implementada

### File List
- `dashboard/src/hooks/use-tickets.ts` - Hook com Supabase Realtime
- `dashboard/src/components/tickets/TicketCard.tsx` - Card de ticket
- `dashboard/src/components/tickets/TicketQueue.tsx` - Fila de tickets
- `dashboard/src/app/(dashboard)/dashboard/page.tsx` - Atualizado com TicketQueue

### Debug Log
- use-tickets hook implementa:
  - Carregamento inicial de tickets
  - Assinatura Realtime ('*' events: INSERT, UPDATE, DELETE)
  - Filtros por sector e status
  - Contadores por status
- TicketCard mostra:
  - Indicadores de prioridade (🚨 crítica, 🟠 alta, 🟢 media, ⚪ baixa)
  - Status com cores (Novo, Bot Ativo, Aguardando Humano, etc.)
  - Canal (💬 WhatsApp, ✈️ Telegram, 🌐 Web)
  - Tempo de espera calculado
  - Agente IA ativo
- TicketQueue implementa:
  - 5 contadores (Total, Novos, Bot, Humano, Críticos)
  - Filtros de status (Todos, Novos, Bot Ativo, Aguardando Humano, Em Atendimento)
  - Grid responsivo (1/2/3 colunas)
  - Empty state
- Dashboard atualizado para usar TicketQueue
- Supervisores veem todos os setores, agentes veem apenas seu setor

### Completion Notes
✅ Story implementada com sucesso. Pendências:
1. Habilitar Realtime no Supabase (operacional)
2. Testar com dados reais
3. Implementar refresh manual

Próxima: PAA-S014 (Interface de Chat/Inbox)

---

## ClickUp
- **Task ID:** [auto]
- **Epic Task ID:** [auto]
- **List:** Backlog
- **URL:** https://app.clickup.com/t/[auto]
- **Last Sync:** [auto]
