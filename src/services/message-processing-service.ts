/**
 * Message Processing Service
 * 
 * Centraliza a orquestração de todos os agentes (Router, Support, Sales, Finance).
 */

import { getRouterAgent } from '../agents/router-agent';
import { getSupportAgent } from '../agents/support-agent';
import { getSalesAgent } from '../agents/sales-agent';
import { getFinanceAgent } from '../agents/finance-agent';
import { getSupabaseClient } from '../config/supabase';
import { createHandoffFromRouter, persistHandoff, updateTicketCurrentAgent } from '../types/handoff';

const supabase = getSupabaseClient();

/**
 * Processar mensagem recebida
 */
export async function processIncomingMessage(message: any) {
  try {
    // 1. Contexto do cliente e Histórico
    const customerContext = await getRouterAgent().getCustomerContext(message.customerId);
    const history = message.ticketId ? await getTicketMessages(message.ticketId) : [];

    // 2. Classificação Fluida (Sempre entender se o cliente mudou de assunto)
    const classification = await getRouterAgent().classify(message.body, customerContext || undefined);
    let sector = classification.sector;

    // 3. Gerenciar Ticket
    let finalTicketId = message.ticketId;
    if (!finalTicketId) {
      const { data: newTicket, error: ticketError } = await supabase
        .from('tickets')
        .insert({
          customer_id: message.customerId,
          channel: message.channel,
          sector: sector,
          intent: classification.intent,
          status: 'bot_ativo',
          priority: 'media',
          router_confidence: classification.confidence
        })
        .select()
        .single();

      if (ticketError) throw ticketError;
      finalTicketId = newTicket.id;
      
      // Associar a mensagem original ao novo ticket
      await supabase.from('messages').update({ ticket_id: finalTicketId }).eq('id', message.id);
    } else {
      // Atualizar setor se a IA detectou mudança de intenção
      await supabase.from('tickets').update({ 
        sector: sector, 
        intent: classification.intent 
      }).eq('id', finalTicketId);
    }

    // 4. CHAMAR O AGENTE ESPECIALISTA (A Inteligência de Negócio)
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

    // 5. Registrar Log e Atualizar Agente Atual
    await updateTicketCurrentAgent(finalTicketId, sector as any, sector);
    await getRouterAgent().logDecision(finalTicketId, classification, 0);

    return { 
      ticketId: finalTicketId, 
      clarificationMessage: agentResponse || classification.humanResponse,
      sector: sector
    };
  } catch (error) {
    console.error('❌ Erro no processamento centralizado:', error);
    return { 
      ticketId: message.ticketId, 
      clarificationMessage: 'Tive um pequeno contratempo técnico, mas já estou aqui. Como posso ajudar?' 
    };
  }
}

/**
 * Buscar histórico de mensagens
 */
async function getTicketMessages(ticketId: string) {
  if (!ticketId || ticketId.length < 5) return [];
  try {
    const { data } = await supabase
      .from('messages')
      .select('*')
      .eq('ticket_id', ticketId)
      .order('timestamp', { ascending: true })
      .limit(10);
    return data || [];
  } catch (error) {
    return [];
  }
}
