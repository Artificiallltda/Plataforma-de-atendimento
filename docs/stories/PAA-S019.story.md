# Story: PAA-S019 — Dashboard de CSAT e NPS

---

## Status
**Current:** Ready for Review
**Sprint:** Fase 4 (Analytics)
**Épico:** E5 — Analytics e Relatórios

---

## Story
Como um supervisor ou gestor, eu quero visualizar dashboards específicos de CSAT e NPS com gráficos e tendências para que eu possa acompanhar a satisfação dos clientes e identificar áreas de melhoria.

## Acceptance Criteria
- [x] Criar página dedicada para CSAT/NPS (`/analytics/feedback`)
- [x] Implementar gráfico de evolução de CSAT por dia/semana/mês
- [x] Implementar gráfico de distribuição de CSAT (1-5 estrelas)
- [x] Implementar gauge de NPS (-100 a +100)
- [x] Implementar gráfico de pizza (Detratores, Neutros, Promotores)
- [x] Implementar tendência de NPS ao longo do tempo
- [x] Filtrar por período (7 dias, 30 dias, 90 dias, personalizado)
- [ ] Filtrar por setor (suporte, financeiro, comercial) - PAA-S020
- [x] Listar comentários recentes de CSAT baixo (< 3)
- [x] Listar comentários de Detratores (NPS 0-6)
- [x] Exportar dashboard em CSV (integrado com PAA-S018)

## Acceptance Criteria (Gherkin)
```gherkin
Feature: Dashboard de CSAT e NPS

Scenario: Visualizar evolução de CSAT
  Given supervisor está na página de feedback
  When seleciona período "30 dias"
  Then deve mostrar gráfico de linha com CSAT médio por dia
  And deve mostrar média geral no topo

Scenario: Visualizar NPS
  Given supervisor está na página de feedback
  When visualiza seção de NPS
  Then deve mostrar gauge com score -100 a +100
  And deve mostrar distribuição: Detratores, Neutros, Promotores
  And deve mostrar tendência vs período anterior

Scenario: Filtrar por setor
  Given supervisor está na página de feedback
  When seleciona setor "suporte"
  Then deve mostrar apenas CSAT/NPS do setor suporte
```

---

## Tasks
1. **Page:** Criar página `/analytics/feedback` [x]
2. **Components:** Criar gráfico de evolução CSAT [x]
3. **Components:** Criar gráfico de distribuição CSAT [x]
4. **Components:** Criar gauge de NPS [x]
5. **Components:** Criar gráfico de pizza NPS [x]
6. **Components:** Criar lista de comentários críticos [x]
7. **Filters:** Implementar filtros de período [x]
8. **Data:** Criar hook useFeedback para buscar dados [x]
9. **Export:** Integrar com exportação CSV [x]
10. **Test:** Testar carregamento de dados [x]

---

## Dev Notes

### Bibliotecas Sugeridas
- **Gráficos:** `recharts`

### Métricas
| Métrica | Descrição |
|---------|-----------|
| **CSAT Médio** | Média de todas as respostas CSAT (1-5) |
| **Distribuição** | Quantidade por nota (1⭐, 2⭐, 3⭐, 4⭐, 5⭐) |
| **NPS Score** | (Promotores - Detratores) / Total * 100 |
| **NPS Classificação** | < 0: Ruim, 0-30: Bom, 30-70: Muito Bom, 70-100: Excelente |

### Dependências
- **PAA-S011:** FeedbackAgent (dados de CSAT/NPS)
- **PAA-S018:** Exportação PDF

---

## Dev Agent Record
### Agent Model Used
Gemini 2.0 Flash (Orion)

### Change Log
- 2026-04-01: Story created by @sm (River)
- 2026-04-01: Story completed by @dev (Orion) - Dashboard de feedback implementado com Recharts

### File List
- `dashboard/src/app/(dashboard)/analytics/feedback/page.tsx`
- `dashboard/src/hooks/use-feedback.ts`
- `dashboard/src/components/export/ExportButton.tsx`

---

## ClickUp
- **Task ID:** [auto]
- **Epic Task ID:** [auto]
- **List:** Backlog
- **URL:** https://app.clickup.com/t/[auto]
- **Last Sync:** [auto]
