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
  external_id: string;
  channel: 'whatsapp' | 'telegram' | 'web';
  customer_id: string;
  ticket_id?: string;
  body: string;
  media_url?: string;
  media_type?: 'audio' | 'image' | 'document' | 'video';
  sender: 'customer' | 'bot' | 'human';
  timestamp: Date;
  raw_payload: any;
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
            external_id: msg.externalId,
            channel: 'whatsapp',
            customer_id: customer.id,
            body: msg.body,
            media_url: msg.mediaUrl,
            media_type: msg.mediaType,
            sender: 'customer',
            timestamp: msg.timestamp,
            raw_payload: msg.rawPayload
          };

          // 4. Validar schema (Mapeando para camelCase que o Zod espera)
          const validation = validateIncomingMessage({
            id: normalizedMessage.id,
            externalId: normalizedMessage.external_id,
            channel: normalizedMessage.channel,
            customerId: normalizedMessage.customer_id,
            body: normalizedMessage.body,
            mediaUrl: normalizedMessage.media_url,
            mediaType: normalizedMessage.media_type,
            sender: normalizedMessage.sender,
            timestamp: normalizedMessage.timestamp,
            rawPayload: normalizedMessage.raw_payload
          });

          if (!validation.success) {
            errors.push({
              message: `Validação falhou: ${validation.errors?.join(', ')}`,
              externalId: msg.externalId
            });
            continue;
          }

          // 5. Persistir no Supabase
          const saveResult = await saveMessage({
            external_id: normalizedMessage.external_id,
            channel: normalizedMessage.channel,
            customer_id: normalizedMessage.customer_id,
            body: normalizedMessage.body,
            media_url: normalizedMessage.media_url || undefined,
            media_type: normalizedMessage.media_type || undefined,
            sender: normalizedMessage.sender,
            timestamp: normalizedMessage.timestamp,
            raw_payload: normalizedMessage.raw_payload
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

    console.log('👤 [Norm] Cliente identificado/criado:', {
      customerId: customer.id,
      channel,
      channelUserId: message.from,
      name: customer.name
    });

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
    } catch (ticketLookupError) {
      console.warn('⚠️ [Norm] Erro ao buscar ticket aberto (assumindo nenhum):', {
        customerId: customer.id,
        error: ticketLookupError instanceof Error ? ticketLookupError.message : ticketLookupError
      });
    }

    console.log('🎫 [Norm] Ticket aberto encontrado:', existingTicketId ?? 'nenhum');

    // 2. Criar mensagem normalizada
    const normalizedMessage: NormalizedMessage = {
      id: randomUUID(),
      external_id: message.externalId,
      channel,
      customer_id: customer.id,
      ticket_id: existingTicketId,
      body: message.body,
      media_url: message.mediaUrl,
      media_type: message.mediaType,
      sender: 'customer',
      timestamp: message.timestamp || new Date(),
      raw_payload: message.rawPayload || {}
    };

    // 3. Validar schema (Mapeando para camelCase que o Zod espera)
    const validation = validateIncomingMessage({
      id: normalizedMessage.id,
      externalId: normalizedMessage.external_id,
      channel: normalizedMessage.channel,
      customerId: normalizedMessage.customer_id,
      ticketId: normalizedMessage.ticket_id,
      body: normalizedMessage.body,
      mediaUrl: normalizedMessage.media_url,
      mediaType: normalizedMessage.media_type,
      sender: normalizedMessage.sender,
      timestamp: normalizedMessage.timestamp,
      rawPayload: normalizedMessage.raw_payload
    });

    if (!validation.success) {
      const validationError = `Validação falhou: ${validation.errors?.join(', ')}`;
      console.error('❌ [Norm] Validação de schema falhou:', {
        errors: validation.errors,
        messageFrom: message.from,
        body: message.body?.substring(0, 80)
      });
      return { success: false, error: validationError };
    }

    // 4. Persistir no Supabase
    const saveResult = await saveMessage({
      external_id: normalizedMessage.external_id,
      channel: normalizedMessage.channel,
      customer_id: normalizedMessage.customer_id,
      ticket_id: normalizedMessage.ticket_id,
      body: normalizedMessage.body,
      media_url: normalizedMessage.media_url || undefined,
      media_type: normalizedMessage.media_type || undefined,
      sender: normalizedMessage.sender,
      timestamp: normalizedMessage.timestamp,
      raw_payload: normalizedMessage.raw_payload
    });

    if (saveResult.success) {
      console.log('💾 [Norm] Mensagem salva no banco:', {
        messageId: normalizedMessage.id,
        customerId: normalizedMessage.customer_id,
        ticketId: normalizedMessage.ticket_id ?? 'null'
      });
      return {
        success: true,
        message: normalizedMessage
      };
    } else {
      console.error('❌ [Norm] Falha ao salvar mensagem no banco:', {
        error: saveResult.error,
        customerId: normalizedMessage.customer_id,
        channel
      });
      return {
        success: false,
        error: saveResult.error
      };
    }
  } catch (error) {
    console.error('❌ [Norm] Exceção não tratada em normalizeAndSaveGenericMessage:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      channel,
      from: message.from
    });
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
    customerId: message.customer_id,
    channel: message.channel,
    body: message.body,
    timestamp: message.timestamp,
    hasMedia: !!message.media_url,
    mediaType: message.media_type
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








