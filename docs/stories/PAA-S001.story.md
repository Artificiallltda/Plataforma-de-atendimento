# Story: PAA-S001 — Setup Webhook WhatsApp Cloud API

---

## Status
**Current:** Ready for Review
**Sprint:** Fase 1 (MVP)
**Épico:** E1 — Gateway Omnichannel

---

## Story
Como um sistema de atendimento omnichannel, eu quero receber webhooks da WhatsApp Cloud API (via 360Dialog) para que eu possa processar mensagens recebidas e enviar respostas aos clientes.

## Acceptance Criteria
- [x] Configurar endpoint `/webhooks/whatsapp` no Fastify para receber eventos da Meta
- [x] Implementar verificação de token (VERIFY_TOKEN) para handshake inicial da Meta
- [x] Processar eventos de mensagem de texto recebida (type: 'messages')
- [x] Processar eventos de status (type: 'statuses') — entregue, lido, falha
- [ ] Persistir payload bruto no Supabase para auditoria (depende PAA-S002)
- [x] Responder ao webhook da Meta com HTTP 200 em < 3 segundos
- [x] Implementar log de erros com retry para falhas de processamento

## Acceptance Criteria (Gherkin)
```gherkin
Feature: Webhook WhatsApp

Scenario: Handshake inicial da Meta
  Given o webhook da WhatsApp Cloud API está configurado
  When a Meta envia GET /webhooks/whatsapp com hub.mode='subscribe'
  Then o servidor deve validar hub.verify_token
  And retornar hub.challenge se token válido
  And retornar 403 se token inválido

Scenario: Receber mensagem de texto
  Given um cliente envia "olá" no WhatsApp
  When o webhook recebe POST com type='messages'
  Then deve persistir rawPayload no Supabase
  And retornar HTTP 200 para a Meta em < 3s
  And publicar evento para fila de processamento

Scenario: Receber status de entrega
  Given uma mensagem foi enviada ao cliente
  When a Meta envia status='delivered'
  Then deve atualizar o status da mensagem no Supabase
  And registrar timestamp de entrega
```

---

## Tasks
1. **Setup:** Criar estrutura de pastas `src/webhooks/` e `src/services/whatsapp/` [x]
2. **Config:** Adicionar variáveis de ambiente `.env` (WHATSAPP_API_KEY, WHATSAPP_PHONE_ID, VERIFY_TOKEN) [x]
3. **Endpoint:** Implementar GET/POST `/webhooks/whatsapp` no Fastify [x]
4. **Validation:** Criar middleware de validação de token da Meta [x]
5. **Parser:** Implementar parser de eventos (messages, statuses) [x]
6. **Persistence:** Criar integração com Supabase para rawPayload [ ] (depende PAA-S002)
7. **Test:** Criar testes unitários do webhook (mock de eventos da Meta) [x] - 8 testes passando
8. **Test:** Teste de integração ponta-a-ponta (ngrok + WhatsApp sandbox) [ ] (manual/operacional)

---

## Dev Notes

### Arquitetura de Referência
- **Fonte:** `docs/architecture/architecture.md#1-arquitetura-de-alto-nível`
- **Fluxo:** WhatsApp → Webhook → Parser → Fila → RouterAgent

### Variáveis de Ambiente Necessárias
```bash
# WhatsApp Cloud API (360Dialog)
WHATSAPP_API_KEY=xxx
WHATSAPP_PHONE_ID=xxx
WHATSAPP_VERIFY_TOKEN=xxx  # Token escolhido para handshake
```

### Endpoints a Implementar
```typescript
// GET: Handshake inicial (Meta verifica token)
GET /webhooks/whatsapp?hub.mode=subscribe&hub.verify_token=xxx&hub.challenge=xxx

// POST: Receber eventos
POST /webhooks/whatsapp
Content-Type: application/json
{
  "object": "whatsapp_business_account",
  "entry": [{
    "changes": [{
      "value": {
        "messages": [...],
        "statuses": [...]
      }
    }]
  }]
}
```

### Estrutura de Pastas Sugerida
```
src/
├── webhooks/
│   └── whatsapp/
│       ├── whatsapp-webhook.ts    # Handler principal
│       ├── whatsapp-validator.ts  # Validação de token
│       └── whatsapp-parser.ts     # Parser de eventos
├── services/
│   └── whatsapp/
│       └── whatsapp-api.ts        # Cliente para enviar mensagens
└── config/
    └── whatsapp.ts                # Configurações e env
```

### Supabase — Tabela para Raw Payload
```sql
-- Usar tabela messages existente
-- Campo rawPayload (JSONB) armazena payload completo da Meta
INSERT INTO messages (externalId, channel, body, rawPayload, timestamp)
VALUES (
  'wamid.xxx',                    -- externalId = wamid da mensagem
  'whatsapp',                     -- channel
  'olá',                          -- body (texto extraído)
  '{"object": "whatsapp...", ...}',-- rawPayload (JSON completo)
  now()
)
```

### Dependências Externas
- **360Dialog API:** https://docs.360dialog.com/whatsapp-api/whatsapp-api-cloud
- **Meta Webhooks:** https://developers.facebook.com/docs/graph-api/webhooks/getting-started
- **ngrok:** Para testes locais com webhook público

### Riscos e Mitigações
| Risco | Mitigação |
|-------|-----------|
| Webhook não entrega | Implementar retry com backoff exponencial |
| Payload inválido | Validar schema antes de processar |
| Timeout > 3s | Processamento assíncrono (fila) |
| Token vazado | Usar variável de ambiente, nunca hardcode |

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Habilitado

**Story Type Analysis:**
- **Primary Type:** API
- **Secondary Type(s):** Integration
- **Complexity:** Medium (integração com API externa + webhook)

**Specialized Agent Assignment:**
- **Primary Agents:** @dev, @architect
- **Supporting Agents:** @github-devops (deploy de webhook)

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Rodar `coderabbit --prompt-only -t uncommitted` antes de marcar story complete
- [ ] Pre-PR (@github-devops): Rodar `coderabbit --prompt-only --base main` antes de criar pull request

**CodeRabbit Focus Areas:**
- **Primary Focus:**
  - Validação de segurança: Verificação de token, sanitização de payload
  - Error handling: Try-catch, retry para falhas de rede
- **Secondary Focus:**
  - Performance: Resposta < 3s para Meta
  - Observabilidade: Logs de todos os eventos recebidos

---

## Dev Agent Record
### Agent Model Used
Gemini 2.0 Flash (via Qwen Code)

### Change Log
- 2026-03-29: Story created by @sm (River)
- 2026-03-29: Story started by @dev (Dex)
- 2026-03-29: Story completed by @dev (Dex) - Implementação completa do webhook WhatsApp

### File List
- `src/config/whatsapp.ts` - Configuração do WhatsApp Cloud API
- `src/validators/whatsapp-webhook-validator.ts` - Validação de token e assinatura
- `src/parsers/whatsapp-parser.ts` - Parser de eventos (messages, statuses)
- `src/webhooks/whatsapp/whatsapp-webhook.ts` - Handlers GET/POST do webhook
- `src/webhooks/whatsapp/whatsapp-webhook.test.ts` - Testes unitários
- `src/server.ts` - Servidor Fastify principal
- `.env.example` - Variáveis de ambiente atualizadas
- `package.json` - Dependências adicionadas (fastify, zod, redis, supabase, etc.)
- `tsconfig.json` - Configuração TypeScript
- `vitest.config.ts` - Configuração Vitest

### Debug Log
- Estrutura de pastas criada com sucesso (Windows `md` command)
- Dependências adicionadas: fastify, @google/generative-ai, @supabase/supabase-js, redis, zod, vitest, tsx, typescript
- Scripts adicionados: test, dev, build, start
- Webhook implementa handshake (GET) e eventos (POST) conforme documentação Meta
- Parser suporta texto, imagem, áudio, documento, vídeo e statuses
- Testes unitários: 8 testes passando (verifyWebhookToken: 2, getChallenge: 3, parseWhatsAppEvent: 3)
- Persistência no Supabase depende da story PAA-S002 (schema DB)

### Completion Notes
✅ Story implementada com sucesso. Pendências:
1. PAA-S002: Schema Supabase para persistência de mensagens
2. Teste manual com ngrok + WhatsApp sandbox (requer conta Meta aprovada)
3. CodeRabbit pre-commit review (requer instalação em WSL)

Próxima story recomendada: PAA-S002 (Schema Supabase) - habilita persistência

---

## ClickUp
- **Task ID:** [auto]
- **Epic Task ID:** [auto]
- **List:** Backlog
- **URL:** https://app.clickup.com/t/[auto]
- **Last Sync:** [auto]
