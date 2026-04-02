/**
 * Message Processing Service
 */

import { getRouterAgent } from '../agents/router-agent';
import { getSupabaseClient } from '../config/supabase';
import { createHandoffFromRouter, persistHandoff, updateTicketCurrentAgent } from '../types/handoff';

const supabase = getSupabaseClient();

/**
 * Processar mensagem recebida
 */
export async function processIncomingMessage(message: any) {
  try {
    // 1. Contexto do cliente
    const customerContext = await getRouterAgent().getCustomerContext(message.customerId);
    
    // 2. Histórico (Seguro)
    const history = message.ticketId ? await getTicketMessages(message.ticketId) : [];

    // 3. Classificar com IA (RouterAgent agora gera a resposta humanResponse)
    const classification = await getRouterAgent().classify(message.body, customerContext || undefined);

    // 4. Se não tem ticketId, criar um agora
    let finalTicketId = message.ticketId;
    if (!finalTicketId || finalTicketId === '') {
      const { data: newTicket, error: ticketError } = await supabase
        .from('tickets')
        .insert({
          customer_id: message.customerId,
          channel: message.channel,
          sector: classification.sector,
          intent: classification.intent,
          status: classification.needsClarification ? 'novo' : 'bot_ativo',
          priority: 'media',
          router_confidence: classification.confidence
        })
        .select()
        .single();

      if (ticketError) throw ticketError;
      finalTicketId = newTicket.id;
      
      // Associar a mensagem original ao novo ticket
      await supabase.from('messages').update({ ticket_id: finalTicketId }).eq('id', message.id);
    }

    // 5. Handoff e Update
    const handoff = createHandoffFromRouter(finalTicketId, message.customerId, {} as any, history, classification, message.channel);
    
    // Tentar persistir handoff (silencioso se a tabela ainda estiver sendo criada)
    await persistHandoff(handoff).catch(() => console.warn('⚠️ Tabela handoffs ainda não pronta'));
    
    await updateTicketCurrentAgent(finalTicketId, classification.suggestedAgent, classification.sector);
    await getRouterAgent().logDecision(finalTicketId, classification, 0);

    return { 
      ticketId: finalTicketId, 
      needsClarification: classification.needsClarification,
      clarificationMessage: classification.humanResponse || 'Como posso ajudar você hoje?',
      handoff,
      sector: classification.sector
    };
  } catch (error) {
    console.error('❌ Erro no processamento:', error);
    throw error;
  }
}

async function getTicketMessages(ticketId: string) {
  if (!ticketId || ticketId.length < 30) return [];
  const { data } = await supabase.from('messages').select('*').eq('ticket_id', ticketId).limit(10);
  return data || [];
}
