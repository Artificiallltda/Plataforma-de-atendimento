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

    // 3. Verificar se já temos um setor definido para este ticket
    let sector = 'comercial';
    let classification: any = null;
    let ticketData: any = null;

    if (message.ticketId) {
      const { data: existingTicket } = await supabase.from('tickets').select('*').eq('id', message.ticketId).single();
      ticketData = existingTicket;
      if (existingTicket && existingTicket.sector && existingTicket.sector !== 'novo') {
        sector = existingTicket.sector;
      }
    }

    // 4. Se não tem setor ou é novo, rodar RouterAgent
    if (!ticketData || !ticketData.sector || ticketData.sector === 'novo') {
      classification = await getRouterAgent().classify(message.body, customerContext || undefined);
      sector = classification.sector;
    } else {
      // Se já tem setor, o "classification" vem do agente especializado (simulado por enquanto ou chamado direto)
      // Por agora, vamos garantir que ele não dê o "Olá" de novo se já estiver em atendimento
      classification = {
        sector: sector,
        intent: ticketData.intent || 'atendimento_continuo',
        confidence: 1.0,
        suggestedAgent: sector === 'suporte' ? 'support' : sector === 'financeiro' ? 'finance' : 'sales',
        needsClarification: false,
        humanResponse: null // Deixar o agente especializado responder
      };
    }

    // 5. Se não tem ticketId, criar um agora
    let finalTicketId = message.ticketId;
    if (!finalTicketId || finalTicketId === '') {
      const { data: newTicket, error: ticketError } = await supabase
        .from('tickets')
        .insert({
          customer_id: message.customerId,
          channel: message.channel,
          sector: sector,
          intent: classification?.intent || 'atendimento',
          status: (classification?.needsClarification) ? 'novo' : 'bot_ativo',
          priority: 'media',
          router_confidence: classification?.confidence || 1.0
        })
        .select()
        .single();

      if (ticketError) throw ticketError;
      finalTicketId = newTicket.id;
      
      // Associar a mensagem original ao novo ticket
      await supabase.from('messages').update({ ticket_id: finalTicketId }).eq('id', message.id);
    } else if (ticketData && (!ticketData.sector || ticketData.sector === 'novo')) {
       // Atualizar ticket existente se o setor foi definido agora
       await supabase.from('tickets').update({ 
         sector: sector, 
         intent: classification?.intent,
         status: 'bot_ativo' 
       }).eq('id', finalTicketId);
    }

    // 6. Handoff e Update
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
