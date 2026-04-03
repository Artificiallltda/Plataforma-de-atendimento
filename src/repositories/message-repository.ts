/**
 * Repositório de Mensagens
 * 
 * Persistência de mensagens no Supabase.
 */

import { getSupabaseClient } from '../config/supabase';

const supabase = getSupabaseClient();

export interface MessageInput {
  external_id: string;
  channel: 'whatsapp' | 'telegram' | 'web';
  customer_id: string;
  ticket_id?: string;
  body: string;
  media_url?: string;
  media_type?: 'audio' | 'image' | 'document' | 'video';
  sender: 'customer' | 'bot' | 'human';
  sender_id?: string;
  timestamp?: Date;
  raw_payload?: any;
}

/**
 * Salvar mensagem no Supabase
 */
export async function saveMessage(message: MessageInput): Promise<{ id: string; success: boolean; error?: string }> {
  try {
    const { data, error } = await (supabase
      .from('messages') as any)
      .insert({
        external_id: message.external_id,
        channel: message.channel,
        customer_id: message.customer_id,
        ticket_id: message.ticket_id || null,
        body: message.body,
        media_url: message.media_url || null,
        media_type: message.media_type || null,
        sender: message.sender,
        sender_id: message.sender_id || null,
        timestamp: message.timestamp?.toISOString() || new Date().toISOString(),
        raw_payload: message.raw_payload ? JSON.stringify(message.raw_payload) : null
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao salvar mensagem:', error);
      return { id: '', success: false, error: error.message };
    }

    return { id: data.id, success: true };
  } catch (error: any) {
    console.error('❌ [MessageRepo] Exceção ao salvar mensagem:', {
      error: error.message,
      stack: error.stack,
      channel: message.channel,
      customerId: message.customer_id
    });
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
