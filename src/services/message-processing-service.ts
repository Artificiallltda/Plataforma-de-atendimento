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
    
import { getRouterAgent } from '../agents/router-agent';
import { getSupportAgent } from '../agents/support-agent';
import { getSalesAgent } from '../agents/sales-agent';
import { getFinanceAgent } from '../agents/finance-agent';
import { getSupabaseClient } from '../config/supabase';
import { createHandoffFromRouter, persistHandoff, updateTicketCurrentAgent } from '../types/handoff';

const supabase = getSupabaseClient();

export async function processIncomingMessage(message: any) {
  try {
    const customerContext = await getRouterAgent().getCustomerContext(message.customerId);
    const history = message.ticketId ? await getTicketMessages(message.ticketId) : [];

    // 1. SEMPRE classificar para entender a intenção atual (Fluidez)
    const classification = await getRouterAgent().classify(message.body, customerContext || undefined);
    let sector = classification.sector;

    // 2. Gerenciar Ticket
    let finalTicketId = message.ticketId;
    if (!finalTicketId) {
      const { data: newTicket } = await supabase.from('tickets').insert({
        customer_id: message.customerId,
        channel: message.channel,
        sector: sector,
        intent: classification.intent,
        status: 'bot_ativo',
        priority: 'media'
      }).select().single();
      finalTicketId = newTicket.id;
      await supabase.from('messages').update({ ticket_id: finalTicketId }).eq('id', message.id);
    } else {
      // Atualizar setor se a IA detectou mudança de assunto
      await supabase.from('tickets').update({ sector: sector, intent: classification.intent }).eq('id', finalTicketId);
    }

    // 3. CHAMAR O AGENTE ESPECIALISTA (A Inteligência Real)
    let agentResponse = classification.humanResponse;
    const agentContext = {
      ticketId: finalTicketId,
      customerId: message.customerId,
      conversationHistory: history.map((m: any) => ({
        sender: m.sender === 'customer' ? 'customer' : 'bot',
        body: m.body,
        timestamp: new Date(m.timestamp)
      })).concat([{ sender: 'customer', body: message.body, timestamp: new Date() }]),
      customerProfile: customerContext?.customer || { id: message.customerId, isActive: true },
      sector: sector as any,
      intent: classification.intent
    };

    if (sector === 'suporte') {
      const result = await getSupportAgent().processMessage(agentContext as any);
      agentResponse = result.response;
    } else if (sector === 'comercial') {
      const result = await getSalesAgent().processMessage(agentContext as any);
      agentResponse = result.response;
    } else if (sector === 'financeiro') {
      const result = await getFinanceAgent().processMessage(agentContext as any);
      agentResponse = result.response;
    }

    // 4. Finalizar
    await updateTicketCurrentAgent(finalTicketId, sector as any, sector);
    
    return { 
      ticketId: finalTicketId, 
      clarificationMessage: agentResponse || classification.humanResponse,
      sector: sector
    };
  } catch (error) {
    console.error('❌ Erro no processamento:', error);
    return { ticketId: message.ticketId, clarificationMessage: 'Estou com uma pequena instabilidade, mas já vou te ajudar. Pode repetir?' };
  }
}
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
