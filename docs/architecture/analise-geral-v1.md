# Análise Geral do Projeto: PAA (Plataforma de Atendimento Artificiall)

A PAA é uma solução de **Sistemas Multi-Agente (MAS)** de última geração, projetada para unificar o atendimento ao cliente em canais digitais (WhatsApp, Telegram e Web) com intervenção humana estratégica.

## 1. Arquitetura e Motor de Inteligência
A plataforma não utiliza um "chatbot comum", mas sim uma orquestração de **6 agentes de IA especializados** que trabalham de forma colaborativa:

| Agente | Função Principal | Modelo |
| :--- | :--- | :--- |
| **RouterAgent** | O "Maestro": Identifica quem o cliente é e o que ele quer em < 3 segundos. | Gemini 2.0 Flash |
| **SupportAgent** | O "Técnico": Resolve dúvidas, consulta base de conhecimento e abre chamados técnicos. | Gemini 1.5 Pro |
| **FinanceAgent** | O "Contador": Integrado ao GURU e Asaas para checar pagamentos e faturas. | Gemini 2.0 Flash |
| **SalesAgent** | O "Vendedor": Foca em conversão, pré-qualificação de leads e agendamento de demos. | Gemini 1.5 Pro |
| **EscalationAgent** | O "Sentinela": Monitora o sentimento do cliente e alerta humanos em caso de raiva/frustração. | Sentimento Realtime |
| **FeedbackAgent** | O "Auditor": Coleta CSAT e NPS automaticamente após a resolução do ticket. | Gemini 1.5 Flash |

## 2. Estabilidade e Segurança de Dados
Após a auditoria de estabilização, a PAA conta com:
- **Persistência Blindada**: Migrações SQL idempotentes que impedem a deleção acidental de dados no deploy.
- **Service Role Control**: O backend possui permissões totais no Supabase, garantindo que nenhum ticket seja "escondido" por regras de segurança (RLS) mal configuradas.
- **Webhook-Only Mode**: No ambiente de produção (Railway), o sistema opera exclusivamente via Webhooks, eliminando o atraso (lag) e as duplicidades inerentes ao modo "polling".

## 3. Dashboard Realtime
O painel de controle (Next.js 14) utiliza o protocolo **Supabase Realtime**, o que significa que:
- Novos tickets aparecem instantaneamente na fila sem necessidade de recarregar a página (F5).
- A carga de trabalho dos agentes é monitorada ao vivo, permitindo uma distribuição justa de chamados.
- Gráficos de KPI (Tempo Médio de Atendimento, NPS, Conversão) são atualizados em tempo real.

## 4. Diferenciais Competitivos
- **Handoff Inteligente**: A IA não apenas "passa" o atendimento, ela envia um resumo estruturado do que já foi conversado para que o funcionário humano não precise ler todo o histórico.
- **Omnichannel Real**: O histórico de um cliente que começou no Web Chat e migrou para o WhatsApp é unificado sob o mesmo perfil.
- **Auto-Escalação**: Se a IA percebe que não consegue resolver em 3 tentativas, o ticket é movido automaticamente para a fila humana com prioridade "Alta".
