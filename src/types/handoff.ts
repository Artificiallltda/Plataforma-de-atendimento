/**
 * Tipos e interfaces para Handoff entre Agentes
 * 
 * @see docs/architecture/architecture.md#3-protocolo-de-handoff-entre-agentes
 */

import { randomUUID } from 'node:crypto';

export type AgentType = 'router' | 'support' | 'finance' | 'sales' | 'escalation' | 'human' | 'feedback';
export type Sector = 'suporte' | 'financeiro' | 'comercial';
export type Urgency = 'low' | 'medium' | 'high' | 'critical';

/**
 * Estrutura de Handoff entre agentes
 */
export interface AgentHandoff {
  // Identificação
  handoffId: string;           // UUID único do handoff
  ticketId: string;            // Ticket em andamento
  timestamp: Date;             // Momento do handoff
  
  // Origem e Destino
  from: AgentType;             // Agente que está transferindo
  to: AgentType;               // Agente que vai receber
  
  // Contexto da Conversa
  context: MessageContext[];   // Histórico completo (últimas 10 mensagens)
  customerProfile: CustomerProfile; // Perfil enriquecido do cliente
  
  // Classificação
  sector: Sector;
  intent: string;              // Intenção detectada
  confidence: number;          // 0.0 a 1.0
  urgency: Urgency;
  
  // Ferramentas Executadas
  toolResults?: ToolResult[];  // Resultados de tools já chamadas
  
  // Metadados
  channel: 'whatsapp' | 'telegram' | 'web';
  language: string;            // 'pt-BR' padrão
}

/**
 * Mensagem no contexto do handoff
 */
export interface MessageContext {
  id: string;
  sender: 'customer' | 'bot' | 'human';
  body: string;
  timestamp: Date;
  agentType?: AgentType;       // Se foi bot, qual agente
}

/**
 * Perfil do cliente para handoff
 */
export interface CustomerProfile {
  id: string;
  name?: string;
  email?: string;
  phone?: string;
  channel: 'whatsapp' | 'telegram' | 'web';
  channelUserId: string;
  plan?: 'basico' | 'premium' | 'enterprise';
  guruSubscriptionId?: string;
  asaasCustomerId?: string;
  financialStatus?: 'em-dia' | 'inadimplente';
  activeTicketId?: string;
  recentTickets?: Array<{
    id: string;
    sector: string;
    intent: string;
    status: string;
    csatScore?: number;
  }>;
}

/**
 * Resultado de ferramenta executada
 */
export interface ToolResult {
  toolName: string;
  result: any;
  error?: string;
  durationMs?: number;
}

/**
 * Criar handoff a partir de classificação do RouterAgent
 */
export function createHandoffFromRouter(
  ticketId: string,
  customerId: string,
  customerProfile: CustomerProfile,
  messages: MessageContext[],
  routerOutput: {
    sector: Sector;
    intent: string;
    confidence: number;
    suggestedAgent: AgentType;
  },
  channel: 'whatsapp' | 'telegram' | 'web'
): AgentHandoff {
  return {
    handoffId: randomUUID(),
    ticketId,
    timestamp: new Date(),
    from: 'router',
    to: routerOutput.suggestedAgent,
    context: messages.slice(-10), // Últimas 10 mensagens
    customerProfile,
    sector: routerOutput.sector,
    intent: routerOutput.intent,
    confidence: routerOutput.confidence,
    urgency: 'medium',
    channel,
    language: 'pt-BR'
  };
}

/**
 * Persistir handoff no Supabase
 */
export async function persistHandoff(handoff: AgentHandoff): Promise<{ success: boolean; error?: string }> {
  const { supabase } = await import('../config/supabase');

  try {
    const { error } = await supabase
      .from('handoffs')
      .insert({
        ticket_id: handoff.ticketId,
        from_agent: handoff.from,
        to_agent: handoff.to,
        reason: `Classificação: ${handoff.intent} (confidence: ${handoff.confidence})`,
        urgency: handoff.urgency,
        context_snapshot: {
          context: handoff.context,
          customerProfile: handoff.customerProfile,
          sector: handoff.sector,
          intent: handoff.intent,
          confidence: handoff.confidence
        },
        tool_results: handoff.toolResults ? JSON.stringify(handoff.toolResults) : null
      });

    if (error) {
      console.error('❌ Erro ao persistir handoff:', error);
      return { success: false, error: error.message };
    }

    console.log(`✅ Handoff persistido: ${handoff.handoffId} (${handoff.from} → ${handoff.to})`);
    return { success: true };
  } catch (error) {
    console.error('❌ Exceção ao persistir handoff:', error);
    return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
  }
}

/**
 * Atualizar ticket com agente atual
 */
export async function updateTicketCurrentAgent(
  ticketId: string,
  agentType: AgentType,
  sector: Sector
): Promise<void> {
  const { supabase } = await import('../config/supabase');

  try {
    await supabase
      .from('tickets')
      .update({
        current_agent: agentType,
        sector
      })
      .eq('id', ticketId);
  } catch (error) {
    console.error('❌ Erro ao atualizar ticket:', error);
  }
}

export default {
  createHandoffFromRouter,
  persistHandoff,
  updateTicketCurrentAgent
};
