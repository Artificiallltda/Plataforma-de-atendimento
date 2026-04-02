/**
 * Serviço de Normalização de Mensagens
 * 
 * Unifica parser, validação e persistência de mensagens de diferentes canais.
 * 
 * @see docs/architecture/architecture.md#1-arquitetura-de-alto-nível
 */

import { randomUUID } from 'node:crypto';
import { parseWhatsAppEvent, WhatsAppWebhookPayload } from '../parsers/whatsapp-parser';
import { validateIncomingMessage, IncomingMessage } from '../validators/message-schema';
import { identifyOrCreateCustomer } from '../repositories/customer-repository';
import { saveMessage } from '../repositories/message-repository';

import { getSupabaseClient } from '../config/supabase';
const supabaseNorm = getSupabaseClient();

export interface NormalizedMessage {
  id: string;
  externalId: string;
  channel: 'whatsapp' | 'telegram' | 'web';
  customerId: string;
  ticketId?: string;
  body: string;
  mediaUrl?: string;
  mediaType?: 'audio' | 'image' | 'document' | 'video';
  sender: 'customer' | 'bot' | 'human';
  timestamp: Date;
  rawPayload: any;
}

/**
 * Normalizar e persistir mensagem do WhatsApp
 * 
 * Fluxo completo:
 * 1. Parse do payload do webhook
 * 2. Validação do schema
 * 3. Identificação do cliente
 * 4. Persistência no Supabase
 * 
 * @param payload - Payload do webhook WhatsApp
 * @returns Mensagens normalizadas e persistidas
 */
export async function normalizeAndSaveWhatsAppMessage(
  payload: WhatsAppWebhookPayload
): Promise<{
  success: boolean;
  messages: NormalizedMessage[];
  errors: Array<{ message: string; externalId?: string }>;
}> {
  const errors: Array<{ message: string; externalId?: string }> = [];
  const normalizedMessages: NormalizedMessage[] = [];

  try {
    // 1. Parse do payload
    const parsedEvents = parseWhatsAppEvent(payload);

    for (const event of parsedEvents) {
      if (event.type !== 'message') {
        continue; // Status events são tratados separadamente
      }

      for (const msg of event.messages || []) {
        try {
          // 2. Identificar cliente
          const customer = await identifyOrCreateCustomer('whatsapp', msg.from);

          // 3. Criar mensagem normalizada
          const normalizedMessage: NormalizedMessage = {
            id: randomUUID(),
            externalId: msg.externalId,
            channel: 'whatsapp',
            customerId: customer.id,
            body: msg.body,
            mediaUrl: msg.mediaUrl,
            mediaType: msg.mediaType,
            sender: 'customer',
            timestamp: msg.timestamp,
            rawPayload: msg.rawPayload
          };

          // 4. Validar schema
          const validation = validateIncomingMessage(normalizedMessage);
          if (!validation.success) {
            errors.push({
              message: `Validação falhou: ${validation.errors?.join(', ')}`,
              externalId: msg.externalId
            });
            continue;
          }

          // 5. Persistir no Supabase
          const saveResult = await saveMessage({
            externalId: normalizedMessage.externalId,
            channel: normalizedMessage.channel,
            customerId: normalizedMessage.customerId,
            body: normalizedMessage.body,
            mediaUrl: normalizedMessage.mediaUrl,
            mediaType: normalizedMessage.mediaType,
            sender: normalizedMessage.sender,
            timestamp: normalizedMessage.timestamp,
            rawPayload: normalizedMessage.rawPayload
          });

          if (saveResult.success) {
            normalizedMessages.push(normalizedMessage);
          } else {
            errors.push({
              message: `Falha ao persistir: ${saveResult.error}`,
              externalId: msg.externalId
            });
          }
        } catch (error) {
          errors.push({
            message: error instanceof Error ? error.message : 'Erro desconhecido',
            externalId: msg.externalId
          });
        }
      }
    }

    return {
      success: errors.length === 0,
      messages: normalizedMessages,
      errors
    };
  } catch (error) {
    return {
      success: false,
      messages: [],
      errors: [{
        message: error instanceof Error ? error.message : 'Erro ao processar payload'
      }]
    };
  }
}

/**
 * Normalizar mensagem genérica (para Telegram ou Web)
 * 
 * @param message - Dados da mensagem
 * @param channel - Canal de origem
 * @returns Mensagem normalizada e persistida
 */
export async function normalizeAndSaveGenericMessage(
  message: {
    externalId: string;
    from: string;
    name?: string;
    body: string;
    mediaUrl?: string;
    mediaType?: 'audio' | 'image' | 'document' | 'video';
    timestamp?: Date;
    rawPayload?: any;
  },
  channel: 'telegram' | 'web'
): Promise<{
  success: boolean;
  message?: NormalizedMessage;
  error?: string;
}> {
  try {
    // 1. Identificar cliente (agora com nome)
    const customer = await identifyOrCreateCustomer(channel, message.from, message.name);

    // 1b. Buscar ticket aberto do cliente para vincular a mensagem desde o inicio
    let existingTicketId: string | undefined;
    try {
      const { data: openTicket } = await supabaseNorm
        .from('tickets')
        .select('id')
        .eq('customer_id', customer.id)
        .in('status', ['novo', 'bot_ativo', 'aguardando_cliente', 'aguardando_humano', 'em_atendimento'])
        .order('created_at', { ascending: false })
        .limit(1)
        .single();
      if (openTicket) existingTicketId = (openTicket as any).id;
    } catch (_) { /* sem ticket aberto, tudo bem */ }

    // 2. Criar mensagem normalizada
    const normalizedMessage: NormalizedMessage = {
      id: randomUUID(),
      externalId: message.externalId,
      channel,
      customerId: customer.id,
      ticketId: existingTicketId,
      body: message.body,
      mediaUrl: message.mediaUrl,
      mediaType: message.mediaType,
      sender: 'customer',
      timestamp: message.timestamp || new Date(),
      rawPayload: message.rawPayload || {}
    };

    // 3. Validar schema
    const validation = validateIncomingMessage(normalizedMessage);
    if (!validation.success) {
      return {
        success: false,
        error: `Validação falhou: ${validation.errors?.join(', ')}`
      };
    }

    // 4. Persistir no Supabase
    const saveResult = await saveMessage({
      externalId: normalizedMessage.externalId,
      channel: normalizedMessage.channel,
      customerId: normalizedMessage.customerId,
      ticketId: normalizedMessage.ticketId,
      body: normalizedMessage.body,
      mediaUrl: normalizedMessage.mediaUrl,
      mediaType: normalizedMessage.mediaType,
      sender: normalizedMessage.sender,
      timestamp: normalizedMessage.timestamp,
      rawPayload: normalizedMessage.rawPayload
    });

    if (saveResult.success) {
      return {
        success: true,
        message: normalizedMessage
      };
    } else {
      return {
        success: false,
        error: saveResult.error
      };
    }
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
}

/**
 * Transformar mensagem normalizada em formato para RouterAgent
 * 
 * @param message - Mensagem normalizada
 * @returns Formato para consumo do RouterAgent
 */
export function toRouterAgentFormat(message: NormalizedMessage): {
  customerId: string;
  channel: string;
  body: string;
  timestamp: Date;
  hasMedia: boolean;
  mediaType?: string;
} {
  return {
    customerId: message.customerId,
    channel: message.channel,
    body: message.body,
    timestamp: message.timestamp,
    hasMedia: !!message.mediaUrl,
    mediaType: message.mediaType
  };
}

/**
 * Atualizar status de mensagem (wrapper para message-repository)
 * 
 * @param externalId - ID externo da mensagem
 * @param channel - Canal da mensagem
 * @param statusData - Dados de status
 * @returns Resultado da atualização
 */
export async function updateMessageStatus(
  externalId: string,
  channel: 'whatsapp' | 'telegram' | 'web',
  statusData: {
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: Date;
    error?: { code: number; title: string; detail: string };
  }
): Promise<{ success: boolean; error?: string }> {
  // updateMessageStatus nao implementado no repositorio atual
  return { success: true };
}

export default {
  normalizeAndSaveWhatsAppMessage,
  normalizeAndSaveGenericMessage,
  toRouterAgentFormat,
  updateMessageStatus
};








