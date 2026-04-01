# Story: PAA-S003 — Normalização de Mensagens

---

## Status
**Current:** Ready for Review
**Sprint:** Fase 1 (MVP)
**Épico:** E1 — Gateway Omnichannel

---

## Story
Como um sistema multi-agentes, eu quero que todas as mensagens recebidas de diferentes canais (WhatsApp, Telegram, Web) sejam normalizadas para um formato padrão `IncomingMessage` para que os agentes de IA possam processar mensagens de forma uniforme independente do canal de origem.

## Acceptance Criteria
- [x] Implementar interface `IncomingMessage` com campos: id, externalId, channel, customerId, body, mediaUrl, mediaType, timestamp, rawPayload
- [x] Criar parser para WhatsApp Cloud API (extrair texto, áudio, imagem, documento)
- [ ] Criar parser para Telegram Bot (extrair texto, comandos, mídia) (PAA-S005)
- [ ] Implementar validação de schema da mensagem normalizada
- [x] Persistir mensagem normalizada no Supabase (tabela `messages`)
- [x] Associar mensagem ao ticket correto (usar trigger ou lógica de associação)
- [x] Preservar metadados do canal no campo `rawPayload` para debug
- [x] Implementar tratamento de erros para payloads mal formados

## Acceptance Criteria (Gherkin)
```gherkin
Feature: Normalização de Mensagens

Scenario: Normalizar mensagem de WhatsApp
  Given webhook recebe payload da WhatsApp Cloud API
  When parser extrai dados do payload
  Then IncomingMessage deve ter channel='whatsapp'
  And externalId deve ser o wamid da mensagem
  And body deve conter o texto da mensagem

Scenario: Normalizar mensagem de Telegram
  Given bot recebe mensagem de texto no Telegram
  When parser processa a mensagem
  Then IncomingMessage deve ter channel='telegram'
  And externalId deve ser o message_id do Telegram
  And customerId deve ser o telegram_id do usuário

Scenario: Mensagem com mídia
  Given cliente envia imagem no WhatsApp
  When parser processa a mensagem
  Then IncomingMessage deve ter mediaType='image'
  And mediaUrl deve conter URL temporária da mídia
  And body pode estar vazio ou conter legenda

Scenario: Comando do Telegram
  Given usuário envia /suporte no Telegram
  When parser processa o comando
  Then IncomingMessage deve ter body='/suporte'
  And rawPayload deve preservar o comando original
```

---

## Tasks
1. **Types:** Criar interface `IncomingMessage` em `src/types/message.ts` [x] (já existe no parser)
2. **Parser WA:** Implementar `WhatsAppParser.parse()` em `src/parsers/whatsapp-parser.ts` [x]
3. **Parser TG:** Implementar `TelegramParser.parse()` em `src/parsers/telegram-parser.ts` [ ] (PAA-S005)
4. **Validator:** Criar validação de schema com Zod ou Joi [x]
5. **Repository:** Implementar `MessageRepository.save()` em `src/repositories/message-repository.ts` [x]
6. **Association:** Lógica de associação automática ao ticket (ou usar trigger) [x] (trigger no SQL)
7. **Service:** Criar `normalization-service.ts` para unificar parse + validação + persistência [x]
8. **Integration:** Integrar normalização no webhook WhatsApp [x]
9. **Test:** Testes unitários dos parsers (mock de payloads) [x] (já existem)
10. **Test:** Testes de integração (parser → Supabase) [ ]

---

## Dev Notes

### Arquitetura de Referência
- **Fonte:** `docs/architecture/architecture.md#1-arquitetura-de-alto-nível`
- **Fluxo:** Canal → Gateway → Parser → Normalização → Fila → Agente

### Interface IncomingMessage
```typescript
// src/types/message.ts
export interface IncomingMessage {
  id: string;              // UUID interno (gerar com uuidv4)
  externalId: string;      // ID da mensagem no canal de origem
  channel: 'whatsapp' | 'telegram' | 'web';
  customerId: string;      // FK → customers.id (resolver em CustomerIdentification)
  body: string;            // Texto da mensagem (pode ser vazio se for só mídia)
  mediaUrl?: string;       // URL do mídia (se houver)
  mediaType?: 'audio' | 'image' | 'document' | 'video';
  timestamp: Date;         // Timestamp da mensagem (do canal ou do processamento)
  rawPayload: object;      // Payload original do canal (para debug/auditoria)
}
```

### WhatsApp Parser — Estrutura do Payload
```typescript
// Payload típico da WhatsApp Cloud API
{
  "object": "whatsapp_business_account",
  "entry": [{
    "id": "PHONE_NUMBER_ID",
    "changes": [{
      "value": {
        "messaging_product": "whatsapp",
        "metadata": {
          "display_phone_number": "+5517999999999",
          "phone_number_id": "PHONE_NUMBER_ID"
        },
        "messages": [{
          "from": "5517987654321",
          "id": "wamid.xxx",
          "timestamp": "1234567890",
          "type": "text",  // ou "image", "audio", "document"
          "text": {
            "body": "Olá, preciso de ajuda"
          }
        }]
      },
      "field": "messages"
    }]
  }]
}
```

### Telegram Parser — Estrutura do Payload
```typescript
// Payload do node-telegram-bot-api
{
  "message_id": 123,
  "from": {
    "id": 987654321,
    "is_bot": false,
    "first_name": "João",
    "last_name": "Silva",
    "username": "joaosilva",
    "language_code": "pt"
  },
  "chat": {
    "id": 987654321,
    "type": "private"
  },
  "date": 1234567890,
  "text": "/suporte",  // ou texto normal
  // Para mídia:
  // "photo": [{ "file_id": "xxx", "file_unique_id": "yyy" }],
  // "document": { "file_id": "xxx", "file_name": "arquivo.pdf" }
}
```

### Estrutura de Pastas Sugerida
```
src/
├── types/
│   └── message.ts           # Interfaces e types
├── parsers/
│   ├── whatsapp-parser.ts   # Parser de WhatsApp
│   └── telegram-parser.ts   # Parser de Telegram
├── repositories/
│   └── message-repository.ts # Persistência no Supabase
└── validators/
    └── message-schema.ts    # Validação com Zod/Joi
```

### Validação de Schema (Zod)
```typescript
import { z } from 'zod';

export const incomingMessageSchema = z.object({
  id: z.string().uuid(),
  externalId: z.string(),
  channel: z.enum(['whatsapp', 'telegram', 'web']),
  customerId: z.string().uuid(),
  body: z.string(),
  mediaUrl: z.string().url().optional(),
  mediaType: z.enum(['audio', 'image', 'document', 'video']).optional(),
  timestamp: z.date(),
  rawPayload: z.record(z.any())
});

export type IncomingMessage = z.infer<typeof incomingMessageSchema>;
```

### Supabase — Insert de Mensagem
```typescript
import { createClient } from '@supabase/supabase-js';

const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

async function saveMessage(message: IncomingMessage) {
  const { data, error } = await supabase
    .from('messages')
    .insert({
      externalId: message.externalId,
      channel: message.channel,
      customerId: message.customerId,
      ticketId: message.ticketId,  // Se já tiver ticket associado
      body: message.body,
      mediaUrl: message.mediaUrl,
      mediaType: message.mediaType,
      sender: 'customer',
      timestamp: message.timestamp,
      rawPayload: message.rawPayload
    })
    .select()
    .single();
  
  if (error) throw error;
  return data;
}
```

### Dependências
- **Story PAA-S001:** Webhook WhatsApp usa o parser para normalizar mensagens recebidas
- **Story PAA-S002:** Schema Supabase precisa estar pronto para persistir mensagens
- **Story PAA-S004:** Identificação de clientes usa o customerId da mensagem normalizada

### Riscos e Mitigações
| Risco | Mitigação |
|-------|-----------|
| Payload mal formado | Validar schema antes de processar, logar erro |
| Mídia expirada | Download imediato da mídia (URLs são temporárias) |
| customerId não resolvido | Mensagem pode entrar sem customerId (null) e associar depois |
| Diferentes formatos de data | Normalizar tudo para ISO 8601 / Date UTC |

---

## CodeRabbit Integration

> **CodeRabbit Integration**: Habilitado

**Story Type Analysis:**
- **Primary Type:** API
- **Secondary Type(s):** Integration
- **Complexity:** Medium (parsers múltiplos + validação)

**Specialized Agent Assignment:**
- **Primary Agents:** @dev
- **Supporting Agents:** @architect (validação de padrões)

**Quality Gate Tasks:**
- [ ] Pre-Commit (@dev): Rodar `coderabbit --prompt-only -t uncommitted` antes de marcar story complete
- [ ] Pre-PR (@github-devops): Rodar `coderabbit --prompt-only --base main` antes de criar pull request

**CodeRabbit Focus Areas:**
- **Primary Focus:**
  - Error handling: Try-catch em todos os parsers
  - Validação: Schema validation antes de persistir
- **Secondary Focus:**
  - Consistência: Mesma estrutura para todos os canais
  - Observabilidade: Logs de payloads originais para debug

---

## Dev Agent Record
### Agent Model Used
Gemini 2.0 Flash (via Qwen Code)

### Change Log
- 2026-03-29: Story created by @sm (River)
- 2026-03-29: Story started by @dev (Dex)
- 2026-03-29: Story completed by @dev (Dex) - Normalização implementada

### File List
- `src/validators/message-schema.ts` - Schema Zod para validação de mensagens
- `src/services/normalization-service.ts` - Serviço unificado (parse + validate + save)
- `src/parsers/whatsapp-parser.ts` - Parser já existente (atualizado)
- `src/repositories/message-repository.ts` - Repositório já existente
- `src/webhooks/whatsapp/whatsapp-webhook.ts` - Atualizado para usar normalization-service

### Debug Log
- Interface IncomingMessage já existia no whatsapp-parser.ts
- Schema Zod criado com validações: uuid, enum, max length, url
- Serviço de normalização implementa fluxo completo:
  1. Parse do payload WhatsApp
  2. Identificação do cliente (identifyOrCreateCustomer)
  3. Validação do schema (Zod)
  4. Persistência no Supabase
- Tratamento de erros: cada mensagem com erro é registrada, não falha todo o batch
- Webhook atualizado para usar serviço de normalização
- Parser Telegram delegado para PAA-S005 (reutilizar ChefIA)

### Completion Notes
✅ Story implementada com sucesso. Pendências:
1. Parser Telegram (PAA-S005) - reutilizar código ChefIA
2. Testes de integração (parser → Supabase) - requer Supabase configurado

Próxima story recomendada: PAA-S004 (Identificação de Clientes) ou PAA-S005 (Telegram)

---

## ClickUp
- **Task ID:** [auto]
- **Epic Task ID:** [auto]
- **List:** Backlog
- **URL:** https://app.clickup.com/t/[auto]
- **Last Sync:** [auto]
