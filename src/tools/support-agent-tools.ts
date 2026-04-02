/**
 * Ferramentas do SupportAgent
 * 
 * Tools disponíveis para o agente de suporte técnico.
 * 
 * @see docs/architecture/architecture.md#3-protocolo-de-handoff-entre-agentes
 */

import { supabase } from '../config/supabase';
import { guruService } from '../integrations/guru-service';
import { asaasService } from '../integrations/asaas-service';

/**
 * Tool: checkUserStatus
 * 
 * Verifica se o usuário está ativo e com plano em dia.
 * 
 * @param customerId - ID do cliente no Supabase
 * @returns Status do usuário
 */
export async function checkUserStatus(customerId: string): Promise<{
  isActive: boolean;
  plan: 'basico' | 'premium' | 'enterprise';
  expiresAt?: Date;
  hasAccess: boolean;
  financialStatus?: 'em-dia' | 'inadimplente';
  error?: string;
}> {
  try {
    // Buscar dados do cliente no Supabase
    const { data: customer, error } = await supabase
      .from('customers')
      .select('guru_subscription_id, asaas_customer_id, name, email')
      .eq('id', customerId)
      .single();

    if (error || !customer) {
      return {
        isActive: false,
        plan: 'basico',
        hasAccess: false,
        error: 'Cliente não encontrado'
      };
    }

    // Buscar no GURU
    let guruData = null;
    if ((customer as any).guru_subscription_id) {
      guruData = await guruService.findSubscriptionById((customer as any).guru_subscription_id);
    }

    // Buscar no Asaas
    let asaasData = null;
    if ((customer as any).asaas_customer_id) {
      const invoices = await asaasService.findPendingInvoices((customer as any).asaas_customer_id);
      asaasData = {
        hasPendingInvoices: invoices.length > 0,
        pendingCount: invoices.length
      };
    }

    // Determinar status
    const isActive = guruData?.status === 'ativo';
    const plan = mapPlan(guruData?.plan?.type);
    const hasAccess = isActive && (!asaasData?.hasPendingInvoices);
    const financialStatus = asaasData?.hasPendingInvoices ? 'inadimplente' : 'em-dia';

    return {
      isActive,
      plan,
      expiresAt: guruData?.expiresAt,
      hasAccess,
      financialStatus
    };
  } catch (error) {
    console.error('❌ Erro em checkUserStatus:', error);
    return {
      isActive: false,
      plan: 'basico',
      hasAccess: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
}

/**
 * Tool: getKnowledgeBase
 * 
 * Busca artigos de suporte relacionados à query.
 * 
 * @param query - Query de busca
 * @returns Artigos relacionados
 */
export async function getKnowledgeBase(query: string): Promise<Array<{
  id: string;
  title: string;
  content: string;
  relevance: number;
  url?: string;
}>> {
  try {
    // Opção 1: Busca textual simples (fallback)
    const { data: articles, error } = await supabase
      .from('kb_articles')
      .select('id, title, content, url')
      .ilike('content', `%${query}%`)
      .limit(5);

    if (error) {
      console.error('❌ Erro ao buscar na base de conhecimento:', error);
      return [];
    }

    // Retornar com score de relevância simples
    return (articles || []).map((article: any) => ({
      id: article.id,
      title: article.title,
      content: article.content?.substring(0, 500) + (article.content?.length > 500 ? '...' : ''),
      relevance: 0.5,
      url: article.url
    }));
  } catch (error) {
    console.error('❌ Erro em getKnowledgeBase:', error);
    return [];
  }
}

/**
 * Tool: createTechnicalTicket
 * 
 * Abre chamado para equipe de desenvolvimento.
 * 
 * @param details - Detalhes do ticket técnico
 * @returns Resultado da criação
 */
export async function createTechnicalTicket(details: {
  customerId: string;
  ticketId: string;
  error: string;
  stepsToReproduce?: string[];
  expectedBehavior: string;
  actualBehavior: string;
  severity: 'low' | 'medium' | 'high' | 'critical';
}): Promise<{
  ticketId: string;
  success: boolean;
  error?: string;
}> {
  try {
    const { data, error } = await (supabase
      .from('technical_tickets') as any)
      .insert({
        customer_id: details.customerId,
        ticket_id: details.ticketId,
        error: details.error,
        steps_to_reproduce: details.stepsToReproduce ? JSON.stringify(details.stepsToReproduce) : null,
        expected_behavior: details.expectedBehavior,
        actual_behavior: details.actualBehavior,
        severity: details.severity,
        status: 'aberto',
        reported_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('❌ Erro ao criar ticket técnico:', error);
      return {
        ticketId: '',
        success: false,
        error: error.message
      };
    }

    // Notificar equipe de desenvolvimento (placeholder)
    await notifyDevTeam({
      ticketId: data.id,
      severity: details.severity,
      error: details.error
    });

    return {
      ticketId: data.id,
      success: true
    };
  } catch (error) {
    console.error('❌ Exceção em createTechnicalTicket:', error);
    return {
      ticketId: '',
      success: false,
      error: error instanceof Error ? error.message : 'Erro desconhecido'
    };
  }
}

/**
 * Tool: requestEvidence
 * 
 * Solicita print/evidência ao cliente.
 * 
 * @param ticketId - ID do ticket
 * @param reason - Motivo da solicitação
 * @returns Mensagem para o cliente
 */
export function requestEvidence(ticketId: string, reason: string): string {
  const templates = [
    `Para te ajudar melhor, você pode me enviar um print da tela onde está ocorrendo o erro?`,
    `Entendi! Para investigar melhor, consegue me mandar uma captura de tela do problema?`,
    `Obrigado pelas informações! Para agilizar, você poderia me enviar um print mostrando o erro?`
  ];

  return templates[Math.floor(Math.random() * templates.length)];
}

/**
 * Mapear tipo de plano
 */
function mapPlan(planType?: string): 'basico' | 'premium' | 'enterprise' {
  const mapping: Record<string, 'basico' | 'premium' | 'enterprise'> = {
    'basic': 'basico',
    'basico': 'basico',
    'premium': 'premium',
    'enterprise': 'enterprise',
    'corp': 'enterprise'
  };
  return mapping[planType?.toLowerCase()] || 'basico';
}

/**
 * Notificar equipe de desenvolvimento
 */
async function notifyDevTeam(notification: {
  ticketId: string;
  severity: string;
  error: string;
}): Promise<void> {
  // Placeholder para notificação (Slack, Telegram, etc.)
  console.log('🔔 Notificando equipe de desenvolvimento:', notification);
  
  // Em produção, implementar integração com Slack/Telegram
  // await slackService.sendMessage({ ... });
}

export default {
  checkUserStatus,
  getKnowledgeBase,
  createTechnicalTicket,
  requestEvidence
};

