/**
 * Schema de Validação de Mensagens (Zod)
 * 
 * Validação de schema para mensagens normalizadas.
 * 
 * @see docs/architecture/architecture.md#4-modelo-de-dados
 */

import { z } from 'zod';

/**
 * Schema Zod para IncomingMessage
 * 
 * Valida estrutura da mensagem normalizada antes de persistir.
 */
export const incomingMessageSchema = z.object({
  id: z.string().uuid('ID deve ser um UUID válido'),
  externalId: z.string().min(1, 'externalId é obrigatório'),
  channel: z.enum(['whatsapp', 'telegram', 'web'], {
    errorMap: () => ({ message: 'Canal deve ser whatsapp, telegram ou web' })
  }),
  customerId: z.string().uuid('customerId deve ser um UUID válido'),
  ticketId: z.string().uuid().optional(),
  body: z.string().max(4096, 'Mensagem muito longa (máx 4096 caracteres)'),
  mediaUrl: z.string().url().optional().or(z.literal('')),
  mediaType: z.enum(['audio', 'image', 'document', 'video']).optional(),
  sender: z.enum(['customer', 'bot', 'human']),
  senderId: z.string().uuid().optional(),
  timestamp: z.date().or(z.string().transform(s => new Date(s))),
  rawPayload: z.record(z.any()).optional()
});

/**
 * Tipo TypeScript inferido do schema Zod
 */
export type IncomingMessage = z.infer<typeof incomingMessageSchema>;

/**
 * Schema para validação de mensagens de entrada (webhook)
 */
export const webhookMessageSchema = z.object({
  externalId: z.string(),
  channel: z.enum(['whatsapp', 'telegram', 'web']),
  from: z.string(),
  body: z.string(),
  mediaUrl: z.string().optional(),
  mediaType: z.enum(['audio', 'image', 'document', 'video']).optional(),
  timestamp: z.date().or(z.string().transform(s => new Date(s))),
  rawPayload: z.record(z.any())
});

export type WebhookMessage = z.infer<typeof webhookMessageSchema>;

/**
 * Validar mensagem de entrada
 * 
 * @param data - Dados da mensagem para validar
 * @returns Mensagem validada ou erro
 */
export function validateIncomingMessage(data: unknown): {
  success: boolean;
  data?: IncomingMessage;
  errors?: string[];
} {
  const result = incomingMessageSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    return {
      success: false,
      errors
    };
  }

  return {
    success: true,
    data: result.data
  };
}

/**
 * Validar mensagem de webhook
 * 
 * @param data - Dados do webhook para validar
 * @returns Mensagem validada ou erro
 */
export function validateWebhookMessage(data: unknown): {
  success: boolean;
  data?: WebhookMessage;
  errors?: string[];
} {
  const result = webhookMessageSchema.safeParse(data);

  if (!result.success) {
    const errors = result.error.errors.map(e => `${e.path.join('.')}: ${e.message}`);
    return {
      success: false,
      errors
    };
  }

  return {
    success: true,
    data: result.data
  };
}

export default {
  incomingMessageSchema,
  webhookMessageSchema,
  validateIncomingMessage,
  validateWebhookMessage
};
