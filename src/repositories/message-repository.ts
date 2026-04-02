/**
 * Repositório de Mensagens
 * 
 * Persistência de mensagens no Supabase.
 * 
 * @see docs/architecture/architecture.md#4-modelo-de-dados
 */

import { supabase } from '../config/supabase';

export interface MessageInput {
  externalId: string;
  channel: 'whatsapp' | 'telegram' | 'web';
  customerId: string;
  ticketId?: string;
  body: string;
  mediaUrl?: string;
  mediaType?: 'audio' | 'image' | 'document' | 'video';
  sender: 'customer' | 'bot' | 'human';
  senderId?: string;
  timestamp?: Date;
  rawPayload?: any;
}

/**
 * Salvar mensagem no Supabase
 * 
 * @param message - Dados da mensagem
 * @returns Mensagem salva
 */
export async function saveMessage(message: MessageInput): Promise<{
  id: string;
  success: boolean;
  error?: string;
}> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        external_id: message.externalId,
        channel: message.channel,
        customer_id: message.customerId,
        ticket_id: message.ticketId,
        body: message.body,
        media_url: message.mediaUrl,
        media_type: message.mediaType,
        sender: message.sender,
        sender_id: message.senderId,
        timestamp: message.timestamp?.toISOString() || new Date().toISOString(),
        raw_payload: message.rawPayload ? JSON.stringify(message.rawPayload) : null
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao salvar mensagem:', error);
      return {
        id: '',
        success: false,
        error: error.message
      };
    }

    console.log('✅ Mensagem salva:', data.id);
    return {
      id: data.id,
      success: true
    };
  } catch (error) {
    console.error('❌ Exceção ao salvar mensagem:', error);
    return {
      id: '',
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

/**
 * Buscar mensagens por ticket
 * 
 * @param ticketId - ID do ticket
 * @param limit - Limite de mensagens (padrão: 50)
 * @returns Lista de mensagens
 */
export async function getMessagesByTicket(
  ticketId: string,
  limit: number = 50
): Promise<Array<{
  id: string;
  externalId: string;
  channel: string;
  body: string;
  mediaUrl: string | null;
  mediaType: string | null;
  sender: string;
  timestamp: string;
  rawPayload: any | null;
}>> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, external_id, channel, body, media_url, media_type, sender, timestamp, raw_payload')
    .eq('ticket_id', ticketId)
    .order('timestamp', { ascending: true })
    .limit(limit);

  if (error) {
    console.error('❌ Erro ao buscar mensagens:', error);
    return [];
  }

  return data || [];
}

/**
 * Buscar mensagens por cliente
 * 
 * @param customerId - ID do cliente
 * @param limit - Limite de mensagens (padrão: 10)
 * @returns Lista de mensagens
 */
export async function getMessagesByCustomer(
  customerId: string,
  limit: number = 10
): Promise<Array<{
  id: string;
  ticket_id: string | null;
  body: string;
  sender: string;
  timestamp: string;
}>> {
  const { data, error } = await supabase
    .from('messages')
    .select('id, ticket_id, body, sender, timestamp')
    .eq('customer_id', customerId)
    .order('timestamp', { ascending: false })
    .limit(limit);

  if (error) {
    console.error('❌ Erro ao buscar mensagens do cliente:', error);
    return [];
  }

  return data || [];
}

/**
 * Atualizar status de mensagem (para webhooks de status)
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
  try {
    // Criar log de status em agent_logs
    const { error } = await supabase
      .from('agent_logs')
      .insert({
        ticket_id: null, // Será associado depois
        agent_type: 'support',
        action: 'responded',
        input: { externalId, channel },
        output: statusData,
        tools_used: ['whatsapp_status_webhook'],
        confidence: 1.0,
        duration_ms: 0
      });

    if (error) {
      console.error('❌ Erro ao logar status:', error);
      return {
        success: false,
        error: error.message
      };
    }

    return { success: true };
  } catch (error) {
    console.error('❌ Exceção ao atualizar status:', error);
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error'
    };
  }
}

export default {
  saveMessage,
  getMessagesByTicket,
  getMessagesByCustomer,
  updateMessageStatus
};
