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
  customer_id: string;
  ticket_id?: string;
  body: string;
}) {
  try {
    // 1. Recuperar contexto do cliente e histórico REAL (Cliente + Bot)
    const customerContext = await getRouterAgent().getCustomerContext(message.customer_id);

    console.log('🧠 [MPS] Contexto do cliente recuperado:', {
      customerId: message.customer_id,
      hasContext: !!customerContext
    });
    
    // Buscar as últimas 15 mensagens para dar memória profunda à IA
    let history: { sender: 'customer' | 'bot' | 'human'; body: string; timestamp: Date }[] = [];
    
    if (message.ticket_id) {
      const { data: historyData } = await (supabase
        .from('messages') as any)
        .select('*')
        .eq('ticket_id', message.ticket_id)
        .order('timestamp', { ascending: true })
        .limit(15);

      history = (historyData || []).map((m: any) => ({
        sender: m.sender as 'customer' | 'bot' | 'human',
        body: m.body,
        timestamp: new Date(m.timestamp)
      }));
      console.log('📜 [MPS] Histórico carregado:', { ticketId: message.ticket_id, count: history.length });
    } else {
      console.log('📜 [MPS] Sem ticket_id, pulando histórico');
    }

    // 2. Classificação Cognitiva (Router)
    // Se o ticket já tem um setor, o Router apenas valida se houve mudança de intenção
    const classification = await getRouterAgent().classify(message.body, customerContext || undefined);
    let sector = classification.sector;

    console.log('🎯 [MPS] Classificação do RouterAgent:', {
      sector,
      intent: classification.intent,
      priority: classification.priority
    });

    // 3. Gestão de Ticket (Reutilizar aberto ou Criar novo)
    // '' (string vazia) deve ser tratado como undefined
    let finalTicketId: string | undefined = message.ticket_id || undefined;

    // 3a. Buscar ticket aberto existente do cliente
    if (!finalTicketId) {
      try {
        const { data: existingTicket } = await supabase
          .from('tickets')
          .select('id, sector')
          .eq('customer_id', message.customer_id)
          .in('status', ['novo', 'bot_ativo', 'aguardando_cliente'])
          .order('created_at', { ascending: false })
          .limit(1)
          .single();

        if (existingTicket) {
          const etAny = existingTicket as any;
          finalTicketId = etAny.id;
          console.log('♻️ [MPS] Reutilizando ticket existente:', { ticketId: etAny.id, sector: etAny.sector });
          
          // Atualizar setor se a intenção mudou
          if (etAny.sector !== sector) {
            await (supabase.from('tickets') as any).update({ sector, intent: classification.intent }).eq('id', finalTicketId);
          }
        }
      } catch (lookupError) {
        console.warn('⚠️ [MPS] Erro ao buscar ticket existente (assumindo nenhum):', {
          customerId: message.customer_id,
          error: lookupError instanceof Error ? lookupError.message : lookupError
        });
      }
    }

    // 3b. Criar ticket novo se realmente não existe
    if (!finalTicketId) {
      const { data: newTicket, error: createError } = await (supabase
      .from('tickets') as any)
      .insert({
        customer_id: message.customer_id,
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

      console.log('🎫 [MPS] Novo ticket criado:', {
        ticketId: finalTicketId,
        customerId: message.customer_id,
        sector,
        status: 'bot_ativo'
      });
    }

    // 3c. Vincular mensagens órfãs (sem ticket_id) ao ticket correto (com verificação de segurança)
    if (finalTicketId) {
      await (supabase.from('messages') as any)
        .update({ ticket_id: finalTicketId })
        .eq('customer_id', message.customer_id)
        .is('ticket_id', null);
    }

    // 3d. Garantir ativação automática APENAS se o ticket for novo ou bot_ativo
    const { data: currentStatus, error: statusQueryError } = await supabase
      .from('tickets')
      .select('status')
      .eq('id', finalTicketId as string)
      .single();
    
    if (statusQueryError) {
      console.warn('⚠️ [MPS] Erro ao buscar status do ticket (prosseguindo sem silenciar bot):', {
        ticketId: finalTicketId,
        error: statusQueryError.message,
        code: statusQueryError.code
      });
    }

    if (currentStatus && ['novo', 'aguardando_cliente'].includes((currentStatus as any).status)) {
      await (supabase.from('tickets') as any).update({ status: "bot_ativo" }).eq("id", finalTicketId);
    }

    // 4. Delegar para o Agente Especialista (Fluidez Cognitiva)
    let agentResponse = classification.humanResponse;
    let needsHumanHandoff = false;

    // Profile do cliente normalizado para o formato esperado pelos agents (camelCase)
    const rawCustomer = (customerContext as any)?.customer || { id: message.customer_id, is_active: true };
    const customerProfile = {
      id: rawCustomer.id || message.customer_id,
      name: rawCustomer.name,
      plan: rawCustomer.plan,
      isActive: rawCustomer.is_active ?? rawCustomer.isActive ?? true,
      guru_subscription_id: rawCustomer.guru_subscription_id,
      asaas_customer_id: rawCustomer.asaas_customer_id,
      email: rawCustomer.email,
      phone: rawCustomer.phone,
      company: rawCustomer.company,
      cnpj: rawCustomer.cnpj,
      employeeCount: rawCustomer.employee_count ?? rawCustomer.employeeCount,
    };

    const conversationHistory = history.concat([
      { sender: 'customer', body: message.body, timestamp: new Date() }
    ]);

    // Contexto unificado: snake_case (legado) + camelCase (esperado pelos agents).
    // Manter ambos evita quebrar callers antigos enquanto o flow novo funciona.
    const agentContext: any = {
      ticket_id: finalTicketId,
      customer_id: message.customer_id,
      sector,
      intent: classification.intent,
      // camelCase (formato canônico dos agents)
      conversationHistory,
      customerProfile,
      // snake_case (back-compat)
      conversation_history: conversationHistory,
      customer_profile: customerProfile,
    };

    console.log(`🤖 [MPS] Delegando para agente '${sector}':`, {
      ticket_id: finalTicketId,
      history_length: conversationHistory.length,
      customer_active: customerProfile.isActive,
    });

    // 4a. PRÉ-CHECK de controle humano: se ticket já está em mãos humanas,
    // não chama nenhum agente especialista (evita gastar tokens à toa
    // e elimina race entre handoff e resposta da IA).
    const ticketStatusEarly = (currentStatus as any)?.status ?? '';
    const hasRecentHumanMsgEarly = history.some(m => m.sender === 'human');
    const isHumanControlEarly = ['em_atendimento', 'aguardando_humano'].includes(ticketStatusEarly);

    if (isHumanControlEarly || hasRecentHumanMsgEarly) {
      console.log(`🔕 [Bot] Ticket ${finalTicketId} já sob controle humano (Status: ${ticketStatusEarly}). Pulando IA.`);
      return {
        ticketId: finalTicketId,
        clarificationMessage: null,
        sector,
      };
    }

    // Chamar o agente correto baseado na classificação fluida
    if (sector === 'suporte') {
      const result = await getSupportAgent().processMessage(agentContext);
      agentResponse = result.response;
      needsHumanHandoff = (result as any).needsHumanHandoff;
    } else if (sector === 'comercial') {
      const result = await getSalesAgent().processMessage(agentContext);
      agentResponse = result.response;
      needsHumanHandoff = result.needsHumanHandoff;
    } else if (sector === 'financeiro') {
      const result = await getFinanceAgent().processMessage(agentContext);
      agentResponse = result.response;
      needsHumanHandoff = (result as any).needsHumanHandoff;
    }

    console.log('💬 [MPS] Resposta do agente:', {
      agent: sector,
      hasResponse: !!agentResponse,
      needsHumanHandoff,
      responsePreview: agentResponse?.substring(0, 100)
    });

    // 4b. Executar TRANSBORDO se solicitado pelo agente
    if (needsHumanHandoff) {
      console.log(`🚀 Escalando ticket ${finalTicketId} para humano.`);
      await (supabase.from('tickets') as any).update({
        status: 'aguardando_humano',
        priority: 'alta'
      }).eq('id', finalTicketId);

      // Notificação humana imediata (Slack/email): best-effort, não bloqueia.
      try {
        const { notifyHumanHandoff } = await import('./handoff-notifier');
        await notifyHumanHandoff({
          ticketId: finalTicketId as string,
          channel: message.channel,
          sector,
          customerId: message.customer_id,
          intent: classification.intent,
          lastUserMessage: message.body,
        });
      } catch (notifyErr) {
        console.warn('⚠️ [MPS] Falha ao notificar handoff humano:', notifyErr instanceof Error ? notifyErr.message : notifyErr);
      }
    }

    // 5. [CRÍTICO] PERSISTIR RESPOSTA DA IA NO BANCO DE DADOS
    if (agentResponse) {
      const { error: saveError } = await (supabase.from('messages') as any).insert({
        ticket_id: finalTicketId,
        customer_id: message.customer_id,
        channel: message.channel,
        body: agentResponse,
        sender: 'bot',
        timestamp: new Date().toISOString(),
        external_id: `bot-${Date.now()}`
      });
      
      if (saveError) console.error('❌ Erro ao salvar resposta do bot no DB:', saveError);
    }

    // 6. Atualizar metadados do ticket
    await updateTicketCurrentAgent(finalTicketId as any, sector as any, sector as any);
    
    return { 
      ticketId: finalTicketId, 
      clarificationMessage: agentResponse,
      sector: sector
    };
  } catch (error) {
    console.error('❌ [MPS] EXCEÇÃO CRÍTICA em processIncomingMessage:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      customerId: message.customer_id,
      ticketId: message.ticket_id,
      channel: message.channel
    });
    return { 
      ticketId: message.ticket_id, 
      clarificationMessage: 'Peço desculpas, tive uma oscilação na minha rede neural. Poderia repetir sua solicitação?' 
    };
  }
}






