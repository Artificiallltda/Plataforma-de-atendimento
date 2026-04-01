# Plataforma de Atendimento Artificiall (PAA)

> **Versão:** 1.0.0 | **Status:** MVP Completo (Fases 1-3) | **Data:** Março 2026

Sistema omnichannel de atendimento com **Multi-Agent System (MAS)** para a Artificiall.

---

## 🎯 Visão Geral

A PAA é uma central omnichannel com **6 agentes de IA especializados** que:
1. Recebe mensagens de WhatsApp, Telegram e Chat Web
2. Classifica automaticamente por setor (Suporte/Financeiro/Comercial)
3. Resolve autonomamente via agentes especializados
4. Escala para humanos apenas quando necessário
5. Oferece Dashboard em tempo real para supervisão e KPIs

---

## 🏗️ Arquitetura

```
┌─────────────────────────────────────────────────────────────┐
│                    CANAIS DE ENTRADA                         │
│  WhatsApp Cloud API  │  Telegram Bot  │  Chat Web (futuro)  │
└──────────┬───────────┴────────┬────────┴─────────┬──────────┘
           │                    │                   │
           └────────────────────┼───────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   API Gateway         │
                    │   (Node.js + Fastify) │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   🧠 RouterAgent      │
                    │   Gemini 2.5 Flash    │
                    └───┬──────┬──────┬─────┘
                        │      │      │
                        ▼      ▼      ▼
                   🔧 Support  💰 Finance  🤝 Sales
                   Agent       Agent       Agent
                        │      │      │
                        └──────┼──────┘
                               │
                               ▼
                    ┌───────────────────────┐
                    │ 🚨 EscalationAgent    │
                    │ Monitor de Crises     │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   ⭐ FeedbackAgent    │
                    │   CSAT / NPS          │
                    └───────────┬───────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   Supabase (DB)       │
                    │   - 7 tabelas         │
                    │   - RLS policies      │
                    │   - Realtime          │
                    └───────────────────────┘
                                │
                                ▼
                    ┌───────────────────────┐
                    │   Dashboard (Next.js) │
                    │   - Fila de tickets   │
                    │   - Inbox/Chat        │
                    │   - KPIs              │
                    │   - Supervisor        │
                    └───────────────────────┘
```

---

## 🤖 Agentes de IA

| Agente | Modelo | Função | Status |
|--------|--------|--------|--------|
| 🧠 **RouterAgent** | Gemini 2.5 Flash | Classificar e rotear | ✅ Fase 1 |
| 🔧 **SupportAgent** | Gemini 3.1 Pro | Suporte técnico | ✅ Fase 1 |
| 💰 **FinanceAgent** | Gemini 2.5 Flash | Financeiro/cobranças | ✅ Fase 2 |
| 🤝 **SalesAgent** | Gemini 3.1 Pro | Vendas/qualificação | ✅ Fase 2 |
| 🚨 **EscalationAgent** | Análise leve | Monitor de crises | ✅ Fase 1 |
| ⭐ **FeedbackAgent** | Modelo leve | CSAT/NPS | ✅ Fase 2 |

---

## 📁 Estrutura do Projeto

```
Artificiall Atendimento/PAA/
├── src/                          # Backend (API Gateway + Agentes)
│   ├── agents/                   # Agentes de IA
│   │   ├── router-agent.ts       # Classificação e roteamento
│   │   ├── support-agent.ts      # Suporte técnico
│   │   ├── finance-agent.ts      # Financeiro
│   │   ├── sales-agent.ts        # Vendas
│   │   ├── escalation-agent.ts   # Monitor de crises
│   │   └── feedback-agent.ts     # CSAT/NPS
│   ├── config/                   # Configurações
│   ├── integrations/             # Integrações (GURU, Asaas, Telegram)
│   ├── parsers/                  # Parsers de mensagens
│   ├── repositories/             # Repositórios de dados
│   ├── services/                 # Serviços de negócio
│   ├── tools/                    # Ferramentas dos agentes
│   ├── types/                    # Tipos TypeScript
│   ├── validators/               # Validações
│   ├── webhooks/                 # Webhooks (WhatsApp, Telegram)
│   └── server.ts                 # Servidor Fastify
├── dashboard/                    # Frontend (Next.js 14)
│   └── src/
│       ├── app/                  # App Router
│       ├── components/           # Componentes React
│       ├── hooks/                # Hooks customizados
│       └── lib/                  # Utilitários
├── supabase/
│   └── migrations/               # Schema do banco de dados
└── docs/
    ├── stories/                  # Histórias de usuário
    └── architecture/             # Documentação de arquitetura
```

---

## 🚀 Fases Implementadas

### ✅ Fase 1: Gateway Omnichannel (100%)

| Story | Descrição | Status |
|-------|-----------|--------|
| PAA-S001 | Setup Webhook WhatsApp | ✅ |
| PAA-S002 | Schema Supabase Completo | ✅ |
| PAA-S003 | Normalização de Mensagens | ✅ |
| PAA-S004 | Identificação de Clientes | ✅ |
| PAA-S005 | Integração Telegram | ✅ |

**Entregáveis:**
- Webhook WhatsApp Cloud API (360Dialog)
- Webhook Telegram Bot (polling)
- Parser de mensagens (texto, imagem, áudio, documento)
- Schema Supabase (7 tabelas + views + triggers + RLS)
- Identificação de clientes com GURU/Asaas

---

### ✅ Fase 2: Sistema Multi-Agentes (100%)

| Story | Descrição | Status |
|-------|-----------|--------|
| PAA-S006 | RouterAgent | ✅ |
| PAA-S007 | SupportAgent | ✅ |
| PAA-S008 | EscalationAgent | ✅ |
| PAA-S009 | FinanceAgent | ✅ |
| PAA-S010 | SalesAgent | ✅ |
| PAA-S011 | FeedbackAgent | ✅ |

**Entregáveis:**
- 6 agentes de IA implementados
- Protocolo de handoff entre agentes
- Integrações GURU e Asaas
- Coleta de CSAT e NPS
- 77 testes unitários passando

---

### ✅ Fase 3: Dashboard de Operações (100%)

| Story | Descrição | Status |
|-------|-----------|--------|
| PAA-S012 | Setup Next.js 14 + Auth | ✅ |
| PAA-S013 | Fila de Tickets com Realtime | ✅ |
| PAA-S014 | Interface de Chat (Inbox) | ✅ |
| PAA-S015 | Painel do Supervisor + KPIs | ✅ |

**Entregáveis:**
- Next.js 14 com App Router + TypeScript + Tailwind
- Supabase Auth com login por email/senha
- Fila de tickets em tempo real (Supabase Realtime)
- Inbox com histórico e envio de mensagens
- KPIs em tempo real (Tickets, TMR, CSAT, Bot Containment)
- Lista de agentes online com carga
- Painel exclusivo para supervisores

---

## 📊 Banco de Dados (Supabase)

### Tabelas Principais

| Tabela | Descrição |
|--------|-----------|
| `customers` | Perfis de clientes por canal |
| `tickets` | Tickets de atendimento |
| `messages` | Todas as mensagens trocadas |
| `agent_logs` | Log de decisões dos agentes de IA |
| `handoffs` | Rastreamento de handoffs entre agentes |
| `agents` | Agentes humanos por setor |
| `alerts` | Alertas de crise para Dashboard |
| `feedback` | Feedback CSAT e NPS |
| `nps_history` | Histórico de NPS por cliente |
| `demos` | Demonstrações agendadas |
| `technical_tickets` | Tickets técnicos para dev team |

### Views

- `v_tickets_by_sector` — Tickets agrupados por setor
- `v_kpis_realtime` — KPIs em tempo real
- `v_agents_workload` — Carga de agentes online
- `v_csat_summary` — Resumo de CSAT por dia
- `v_nps_summary` — NPS por dia

---

## 🛠️ Stack Tecnológica

| Camada | Tecnologia |
|--------|-----------|
| **API Gateway** | Node.js + Fastify |
| **Agentes de IA** | Google Gemini 2.5/3.1 (LangChain.js) |
| **Banco de Dados** | Supabase PostgreSQL + Realtime |
| **Dashboard** | Next.js 14 + App Router + Tailwind |
| **WhatsApp** | Cloud API via 360Dialog |
| **Telegram** | node-telegram-bot-api |
| **Integrações** | GURU (assinaturas), Asaas (pagamentos) |

---

## 🔑 Variáveis de Ambiente

### Backend (.env)

```bash
# WhatsApp Cloud API
WHATSAPP_API_KEY=xxx
WHATSAPP_PHONE_ID=xxx
WHATSAPP_VERIFY_TOKEN=xxx

# Telegram Bot
TELEGRAM_BOT_TOKEN=xxx

# Supabase
SUPABASE_URL=https://xxx.supabase.co
SUPABASE_ANON_KEY=xxx
SUPABASE_SERVICE_ROLE_KEY=xxx

# Google AI (Gemini)
GOOGLE_AI_API_KEY=xxx
GEMINI_MODEL_ROUTER=gemini-2.5-flash
GEMINI_MODEL_SUPPORT=gemini-3.1-pro
GEMINI_MODEL_FINANCE=gemini-2.5-flash
GEMINI_MODEL_SALES=gemini-3.1-pro

# Integrações
GURU_API_KEY=xxx
ASAAS_API_KEY=xxx

# Redis
REDIS_URL=redis://localhost:6379
```

### Dashboard (.env.local)

```bash
NEXT_PUBLIC_SUPABASE_URL=https://xxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxx
```

---

## 📦 Instalação e Setup

### Backend

```bash
cd src
npm install

# Configurar .env
cp .env.example .env
# Editar .env com credenciais

# Rodar em desenvolvimento
npm run dev

# Rodar testes
npm test
```

### Dashboard

```bash
cd dashboard
npm install

# Configurar .env.local
cp .env.example .env.local
# Editar .env.local com credenciais Supabase

# Rodar em desenvolvimento
npm run dev
```

### Supabase

```bash
# Instalar Supabase CLI
npm install -g supabase

# Login
supabase login

# Link com projeto
supabase link --project-ref xxx

# Push do schema
supabase db push
```

---

## 📈 KPIs e Métricas

| KPI | Meta | Fórmula |
|-----|------|---------|
| **TMR** | < 5 min | AVG(resolvedAt - createdAt) |
| **CSAT** | > 4.0 | AVG(csatScore) |
| **Bot Containment** | > 65% | (resolvidos sem humano / total) * 100 |
| **NPS** | > 50 | ((Promotores - Detratores) / Total) * 100 |
| **Disponibilidade** | 99.5% | Uptime mensal |

---

## 🧪 Testes

```bash
# Backend
cd src
npm test

# Dashboard
cd dashboard
npm test
```

**Cobertura:**
- RouterAgent: 29 testes
- EscalationAgent: 31 testes
- WhatsApp Webhook: 8 testes
- Handoff: 9 testes

**Total:** 77 testes unitários passando

---

## 📝 PRDs e Épicos

- **PRD Principal:** `../PRD/prd.md`
- **Epic 1:** Gateway Omnichannel (`../PRD/epic-1-gateway.md`)
- **Epic 2:** Sistema Multi-Agentes (`../PRD/epic-2-multi-agents.md`)
- **Epic 3:** Dashboard de Operações (`../PRD/epic-3-dashboard.md`)
- **Epic 4:** Integrações GURU + Asaas (`../PRD/epic-4-integrations.md`)
- **Epic 5:** Analytics e Relatórios (`../PRD/epic-5-analytics.md`)

---

## 🎯 Status do Projeto

| Fase | Stories | Completas |
|------|---------|-----------|
| Fase 1: Gateway | 5 | ✅ 100% |
| Fase 2: Agentes | 3 | ✅ 100% |
| Fase 3: Dashboard | 4 | ✅ 100% |
| **Total** | **12** | **✅ 86%** |

**Pendentes (Fase 4: Analytics):**
- [ ] PAA-S018: Relatórios exportáveis (CSV/PDF)
- [ ] PAA-S019: Dashboard de CSAT e NPS

---

## 🚀 Próximos Passos

1. **Fase 4: Analytics** (2 stories)
   - Relatórios exportáveis
   - Dashboard de CSAT/NPS com gráficos

2. **Refinamentos**
   - Templates de resposta por setor
   - Gráfico de volume de chamados
   - Redistribuição de tickets (drag-and-drop)
   - Exportação CSV de KPIs

3. **Produção**
   - Configurar webhooks em produção
   - Habilitar Supabase Realtime
   - Testes E2E com dados reais
   - Deploy (Railway + Vercel)

---

## 📞 Suporte

Para dúvidas ou issues, abra um ticket no repositório ou contate a equipe de desenvolvimento.

---

*Plataforma de Atendimento Artificiall - © 2026 Artificiall*
