/**
 * Repositório de Mensagens
 * 
 * Persistência de mensagens no Supabase.
 */

import { getSupabaseClient } from '../config/supabase';

const supabase = getSupabaseClient();

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
 */
export async function saveMessage(message: MessageInput): Promise<{ id: string; success: boolean; error?: string }> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .insert({
        external_id: message.externalId,
        channel: message.channel,
        customer_id: message.customerId,
        ticket_id: message.ticketId || null,
        body: message.body,
        media_url: message.mediaUrl || null,
        media_type: message.mediaType || null,
        sender: message.sender,
        sender_id: message.senderId || null,
        timestamp: message.timestamp?.toISOString() || new Date().toISOString(),
        raw_payload: message.rawPayload ? JSON.stringify(message.rawPayload) : null
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao salvar mensagem:', error);
      return { id: '', success: false, error: error.message };
    }

    return { id: data.id, success: true };
  } catch (error: any) {
    return { id: '', success: false, error: error.message };
  }
}

/**
 * Buscar mensagens por ticket
 */
export async function getMessagesByTicket(ticketId: string, limit: number = 50): Promise<any[]> {
  const { data, error } = await supabase
    .from('messages')
    .select('*')
    .eq('ticket_id', ticketId)
    .order('timestamp', { ascending: true })
    .limit(limit);

  if (error) return [];
  return data || [];
}

export default {
  saveMessage,
  getMessagesByTicket
};
