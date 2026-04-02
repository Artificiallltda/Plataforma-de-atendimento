/**
 * Message Processing Service (Versão de Elite 2026)
 * 
 * Única fonte de verdade para orquestração de agentes e persistência de mensagens.
 */

import { getRouterAgent } from '../agents/router-agent';
import { getSupportAgent } from '../agents/support-agent';
import { getSalesAgent } from '../agents/sales-agent';
import { getFinanceAgent } from '../agents/finance-agent';
import { getSupabaseClient } from '../config/supabase';
import { updateTicketCurrentAgent } from '../types/handoff';

const supabase = getSupabaseClient();

/**
 * Processar mensagem recebida e gerar resposta inteligente
 */
export async function processIncomingMessage(message: {
  id: string;
  channel: 'whatsapp' | 'telegram' | 'web';
  customerId: string;
  ticketId?: string;
  body: string;
}) {
  try {
    // 1. Recuperar contexto do cliente e histórico REAL (Cliente + Bot)
    const customerContext = await getRouterAgent().getCustomerContext(message.customerId);
    
    // Buscar as últimas 15 mensagens para dar memória profunda à IA
    const { data: historyData } = await supabase
      .from('messages')
      .select('*')
      .eq('ticket_id', message.ticketId)
      .order('timestamp', { ascending: true })
      .limit(15);

    const history = (historyData || []).map(m => ({
      sender: m.sender as 'customer' | 'bot' | 'human',
      body: m.body,
      timestamp: new Date(m.timestamp)
    }));

    // 2. Classificação Cognitiva (Router)
    // Se o ticket já tem um setor, o Router apenas valida se houve mudança de intenção
    const classification = await getRouterAgent().classify(message.body, customerContext || undefined);
    let sector = classification.sector;

    // 3. Gestão de Ticket (Reutilizar aberto ou Criar novo)
    // '' (string vazia) deve ser tratado como undefined
    let finalTicketId: string | undefined = message.ticketId || undefined;

    // 3a. Buscar ticket aberto existente do cliente
    if (!finalTicketId) {
      try {
        const { data: existingTicket } = await supabase
          .from('tickets')
          .select('id, sector')
          .eq('customer_id', message.customerId)
          .in('status', ['novo', 'bot_ativo', 'aguardando_cliente'])
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (existingTicket) {
          const etAny = existingTicket as any;
          finalTicketId = etAny.id;
          // Atualizar setor se a intenção mudou
          if (etAny.sector !== sector) {
            await (supabase.from('tickets') as any).update({ sector, intent: classification.intent }).eq('id', finalTicketId);
          }
        }
      } catch (_) { /* nenhum ticket aberto, criar novo abaixo */ }
    }

    // 3b. Criar ticket novo se realmente não existe
    if (!finalTicketId) {
      const { data: newTicket, error: createError } = await (supabase
      .from('tickets') as any)
      .insert({
        customer_id: message.customerId,
        channel: message.channel,
        sector: sector,
        intent: classification.intent,
        status: 'bot_ativo',
        priority: classification.priority
      })
        .select()
        .single();

      if (createError) throw createError;
      finalTicketId = (newTicket as any).id;
    }

    // 3c. Vincular mensagens órfãs (sem ticket_id) ao ticket correto (com verificação de segurança)
    if (finalTicketId) {
      await supabase.from('messages')
        .update({ ticket_id: finalTicketId } as any)
        .eq('customer_id', message.customerId)
        .is('ticket_id', null);
    }

    // 3d. Garantir ativação automática APENAS se o ticket for novo ou bot_ativo
    // SE JÁ ESTIVER EM MÃOS HUMANAS, NÃO MEXEMOS NO STATUS!
    const { data: currentStatus } = await supabase.from('tickets').select('status').eq('id', finalTicketId).single();
    if (currentStatus && ['novo', 'aguardando_cliente'].includes((currentStatus as any).status)) {
      await supabase.from('tickets').update({ status: "bot_ativo" } as any).eq("id", finalTicketId);
    }

    // 4. Delegar para o Agente Especialista (Fluidez Cognitiva)
    let agentResponse = classification.humanResponse;
    let needsHumanHandoff = false;
    
    const agentContext = {
      ticketId: finalTicketId,
      customerId: message.customerId,
      conversationHistory: history.concat([{ sender: 'customer', body: message.body, timestamp: new Date() }]),
      customerProfile: customerContext?.customer || { id: message.customerId, isActive: true },
      sector: sector as any,
      intent: classification.intent
    };

    // Chamar o agente correto baseado na classificação fluida
    if (sector === 'suporte') {
      const result = await getSupportAgent().processMessage(agentContext as any);
      agentResponse = result.response;
      needsHumanHandoff = (result as any).needsHumanHandoff;
    } else if (sector === 'comercial') {
      const result = await getSalesAgent().processMessage(agentContext as any);
      agentResponse = result.response;
      needsHumanHandoff = result.needsHumanHandoff;
    } else if (sector === 'financeiro') {
      const result = await getFinanceAgent().processMessage(agentContext as any);
      agentResponse = result.response;
      needsHumanHandoff = (result as any).needsHumanHandoff;
    }

    // 4b. Executar TRANSBORDO se solicitado
    if (needsHumanHandoff) {
      console.log(`🚀 Escalando ticket ${finalTicketId} para humano.`);
      await (supabase.from('tickets') as any).update({ 
        status: 'aguardando_humano',
        priority: 'alta' 
      }).eq('id', finalTicketId);
    }

    // 4c. SE JÁ ESTIVER EM MÃOS HUMANAS, PARAMOS AQUI (FIM DO ATROPELO)
    if (['em_atendimento', 'aguardando_humano'].includes((currentStatus as any).status)) {
      console.log(`🔕 [Bot] Ticket ${finalTicketId} está sob controle humano. Silenciando IA.`);
      return { 
        ticketId: finalTicketId, 
        clarificationMessage: null,
        sector: sector
      };
    }

    // 5. [CRÍTICO] PERSISTIR RESPOSTA DA IA NO BANCO DE DADOS
    if (agentResponse) {
      const { error: saveError } = await (supabase.from('messages') as any).insert({
        ticket_id: finalTicketId,
        customer_id: message.customerId,
        channel: message.channel,
        body: agentResponse,
        sender: 'bot',
        timestamp: new Date().toISOString(),
        external_id: `bot-${Date.now()}`
      });
      
      if (saveError) console.error('❌ Erro ao salvar resposta do bot no DB:', saveError);
    }

    // 6. Atualizar metadados do ticket
    await updateTicketCurrentAgent(finalTicketId, sector as any, sector);
    
    return { 
      ticketId: finalTicketId, 
      clarificationMessage: agentResponse,
      sector: sector
    };
  } catch (error) {
    console.error('❌ Erro no processamento de mensagens:', error);
    return { 
      ticketId: message.ticketId, 
      clarificationMessage: 'Peço desculpas, tive uma oscilação na minha rede neural. Poderia repetir sua solicitação?' 
    };
  }
}






