/**
 * Message Processing Service
 * 
 * Processa mensagens recebidas, classifica com RouterAgent e inicia handoff.
 * 
 * Fluxo:
 * 1. Receber mensagem normalizada
 * 2. Verificar se é resposta a esclarecimento
 * 3. Classificar com RouterAgent
 * 4. Criar/atualizar ticket
 * 5. Persistir handoff
 * 6. Encaminhar para agente especializado (futuro)
 * 
 * @see docs/architecture/architecture.md#3-protocolo-de-handoff-entre-agentes
 */

import { routerAgent, getRouterAgent } from '../agents/router-agent';
import { supabase } from '../config/supabase';
import { createHandoffFromRouter, persistHandoff, updateTicketCurrentAgent, AgentHandoff, CustomerProfile, MessageContext } from '../types/handoff';

export interface ProcessedMessage {
  ticketId: string;
  customerId: string;
  sector: string;
  intent: string;
  confidence: number;
  needsClarification: boolean;
  handoff?: AgentHandoff;
  clarificationMessage?: string;
}

/**
 * Processar mensagem recebida
 * 
 * @param message - Mensagem normalizada
 * @returns Resultado do processamento
 */
export async function processIncomingMessage(
  message: {
    id: string;
    externalId: string;
    channel: 'whatsapp' | 'telegram' | 'web';
    customerId: string;
    ticketId: string;
    body: string;
    timestamp: Date;
  }
): Promise<ProcessedMessage> {
  console.log('🔄 Processando mensagem:', {
    ticketId: message.ticketId,
    customerId: message.customerId,
    body: message.body.substring(0, 50) + (message.body.length > 50 ? '...' : '')
  });

  // 1. Buscar contexto do cliente
  const customerContext = await getRouterAgent().getCustomerContext(message.customerId);
  const customerProfile: CustomerProfile = {
    id: message.customerId,
    channel: message.channel,
    channelUserId: '', // Preencher se necessário
    ...customerContext
  };

  // 2. Buscar histórico de mensagens do ticket
  const messages = await getTicketMessages(message.ticketId);

  // 3. Classificar com RouterAgent
  const classification = await getRouterAgent().classify(message.body, customerContext || undefined);

  console.log('🧠 Classificação:', classification);

  // 4. Verificar se precisa de esclarecimento
  if (classification.needsClarification) {
    console.log('⚠️ Confiança baixa, precisa de esclarecimento');
    
    // Atualizar ticket
    await updateTicketCurrentAgent(message.ticketId, 'router', classification.sector);

    return {
      ticketId: message.ticketId,
      customerId: message.customerId,
      sector: classification.sector,
      intent: classification.intent,
      confidence: classification.confidence,
      needsClarification: true,
      clarificationMessage: getRouterAgent().getClarificationMessage()
    };
  }

  // 5. Criar handoff
  const handoff = createHandoffFromRouter(
    message.ticketId,
    message.customerId,
    customerProfile,
    messages,
    classification,
    message.channel
  );

  // 6. Persistir handoff
  await persistHandoff(handoff);

  // 7. Atualizar ticket
  await updateTicketCurrentAgent(message.ticketId, classification.suggestedAgent, classification.sector);

  // 8. Logar decisão
  await getRouterAgent().logDecision(message.ticketId, classification, 0);

  console.log('✅ Mensagem processada, handoff criado:', handoff.handoffId);

  return {
    ticketId: message.ticketId,
    customerId: message.customerId,
    sector: classification.sector,
    intent: classification.intent,
    confidence: classification.confidence,
    needsClarification: false,
    handoff
  };
}

/**
 * Buscar mensagens do ticket
 */
async function getTicketMessages(ticketId: string): Promise<MessageContext[]> {
  try {
    const { data, error } = await supabase
      .from('messages')
      .select('id, body, sender, timestamp')
      .eq('ticketId', ticketId)
      .order('timestamp', { ascending: false })
      .limit(10);

    if (error) {
      console.error('❌ Erro ao buscar mensagens:', error);
      return [];
    }

    return (data || []).map(msg => ({
      id: msg.id,
      sender: msg.sender as 'customer' | 'bot' | 'human',
      body: msg.body,
      timestamp: new Date(msg.timestamp)
    }));
  } catch (error) {
    console.error('❌ Erro ao buscar mensagens:', error);
    return [];
  }
}

/**
 * Processar resposta de esclarecimento
 * 
 * Quando usuário responde à pergunta de esclarecimento
 */
export async function processClarificationResponse(
  ticketId: string,
  customerId: string,
  response: string,
  channel: 'whatsapp' | 'telegram' | 'web'
): Promise<ProcessedMessage | null> {
  // Mapear resposta para setor
  const sectorMapping: Record<string, { sector: string; agent: string }> = {
    '1': { sector: 'suporte', agent: 'support' },
    '2': { sector: 'financeiro', agent: 'finance' },
    '3': { sector: 'comercial', agent: 'sales' },
    'suporte': { sector: 'suporte', agent: 'support' },
    'financeiro': { sector: 'financeiro', agent: 'finance' },
    'comercial': { sector: 'comercial', agent: 'sales' }
  };

  const normalizedResponse = response.toLowerCase().trim();
  const match = sectorMapping[normalizedResponse] || sectorMapping[normalizedResponse.substring(0, 1)];

  if (!match) {
    // Resposta não reconhecida, tentar classificar com IA
    return processIncomingMessage({
      id: crypto.randomUUID(),
      externalId: 'clarification',
      channel,
      customerId,
      ticketId,
      body: response,
      timestamp: new Date()
    });
  }

  // Criar handoff direto
  const customerContext = await getRouterAgent().getCustomerContext(customerId);
  const customerProfile: CustomerProfile = {
    id: customerId,
    channel,
    channelUserId: '',
    ...customerContext
  };

  const messages = await getTicketMessages(ticketId);

  const handoff = createHandoffFromRouter(
    ticketId,
    customerId,
    customerProfile,
    messages,
    {
      sector: match.sector as 'suporte' | 'financeiro' | 'comercial',
      intent: 'selecao_manual_de_setor',
      confidence: 1.0,
      suggestedAgent: match.agent as 'support' | 'finance' | 'sales'
    },
    channel
  );

  await persistHandoff(handoff);
  await updateTicketCurrentAgent(ticketId, match.agent as 'support' | 'finance' | 'sales', match.sector);

  console.log('✅ Esclarecimento processado, handoff criado:', handoff.handoffId);

  return {
    ticketId,
    customerId,
    sector: match.sector,
    intent: 'selecao_manual_de_setor',
    confidence: 1.0,
    needsClarification: false,
    handoff
  };
}

export default {
  processIncomingMessage,
  processClarificationResponse
};
