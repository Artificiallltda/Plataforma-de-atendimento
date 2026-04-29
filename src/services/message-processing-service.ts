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
 * Mensagem honesta para o cliente quando o LLM cai (billing, quota, rede, etc).
 * Tom alinhado com getEscalationMessage() do SupportAgent — sem clichê de telemarketing,
 * sem promessa de "já te retorno" que o bot não vai cumprir.
 */
const HUMAN_FALLBACK_MESSAGE =
  'Tô com instabilidade no sistema agora. Vou pedir para um colega da equipe humana entrar com a gente — te chamamos por aqui mesmo em poucos minutos.';

/**
 * Marca o ticket como aguardando_humano e dispara o handoff-notifier.
 * Best-effort: nunca lança. Se Supabase ou notifier falharem, apenas loga.
 */
async function escalateToHuman(params: {
  ticketId: string | undefined;
  customerId: string;
  channel: 'whatsapp' | 'telegram' | 'web';
  sector: string;
  intent: string;
  lastUserMessage: string;
  reason: string;
}): Promise<void> {
  if (!params.ticketId) {
    console.warn('⚠️ [MPS] escalateToHuman chamado sem ticketId — pulando update no Supabase');
  } else {
    try {
      await (supabase.from('tickets') as any)
        .update({ status: 'aguardando_humano', priority: 'alta' })
        .eq('id', params.ticketId);
      console.log(`🚀 [MPS] Ticket ${params.ticketId} marcado como aguardando_humano (motivo: ${params.reason})`);
    } catch (err) {
      console.error('❌ [MPS] Falha ao atualizar ticket para aguardando_humano:', {
        ticketId: params.ticketId,
        error: err instanceof Error ? err.message : err
      });
    }
  }

  // Notificar atendentes humanos (Slack se configurado, senão só log — Realtime do Dashboard cobre).
  try {
    const { notifyHumanHandoff } = await import('./handoff-notifier');
    await notifyHumanHandoff({
      ticketId: params.ticketId || 'unknown',
      channel: params.channel,
      sector: params.sector,
      customerId: params.customerId,
      intent: params.intent,
      lastUserMessage: params.lastUserMessage,
    });
  } catch (notifyErr) {
    console.warn('⚠️ [MPS] Falha ao notificar handoff humano:', notifyErr instanceof Error ? notifyErr.message : notifyErr);
  }
}

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

    // BUG GUARD: Router devolve `intent: 'erro_classificacao'` apenas no fallback
    // (LLM caiu — billing, quota, rede). NÃO faz sentido delegar para agente
    // especialista nesse estado: ele vai tentar gerar com o mesmo LLM caído e
    // bater no mesmo erro. Escalamos pra humano direto, com mensagem honesta.
    const routerLlmFailed = classification.intent === 'erro_classificacao';

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

    // 4b. ATALHO DE RESILIÊNCIA: se o Router já falhou no LLM (intent=erro_classificacao),
    // não chama agente especialista — escala direto pra humano com mensagem honesta.
    // Antes: Router falha → MPS delega pra suporte → suporte tenta gerar no mesmo LLM
    // caído → catch genérico devolve "Entendi seu problema, vou verificar..." → cliente
    // fica esperando resposta que nunca vem.
    if (routerLlmFailed) {
      console.warn(`⚠️ [MPS] Router em fallback (LLM caído). Escalando ticket ${finalTicketId} direto pra humano.`);
      agentResponse = HUMAN_FALLBACK_MESSAGE;
      needsHumanHandoff = true;
    } else {
      // Chamar o agente correto baseado na classificação fluida.
      // Try/catch defensivo: se a geração do agente falhar (Vertex caído, quota, etc),
      // ainda devolvemos uma resposta honesta ao cliente em vez de ficar mudo.
      try {
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
      } catch (agentError) {
        console.error('❌ [MPS] Agente especialista lançou exceção — escalando para humano:', {
          sector,
          ticketId: finalTicketId,
          error: agentError instanceof Error ? agentError.message : agentError
        });
        agentResponse = HUMAN_FALLBACK_MESSAGE;
        needsHumanHandoff = true;
      }
    }

    // Defesa em profundidade: se o agente retornou string vazia/null mas não escalou,
    // ainda assim NÃO podemos ficar mudos. Trata como falha e escala.
    if (!agentResponse || !agentResponse.trim()) {
      console.warn(`⚠️ [MPS] Agente '${sector}' retornou resposta vazia — escalando para humano.`);
      agentResponse = HUMAN_FALLBACK_MESSAGE;
      needsHumanHandoff = true;
    }

    console.log('💬 [MPS] Resposta do agente:', {
      agent: sector,
      hasResponse: !!agentResponse,
      needsHumanHandoff,
      responsePreview: agentResponse?.substring(0, 100)
    });

    // 4c. Executar TRANSBORDO se solicitado pelo agente (ou pelos guards de resiliência acima).
    // Centralizado em escalateToHuman() para garantir comportamento consistente em todos
    // os caminhos: Router falhou, agente lançou exceção, agente decidiu escalar, ou
    // resposta vazia — todos passam pelo mesmo update + notify.
    if (needsHumanHandoff) {
      await escalateToHuman({
        ticketId: finalTicketId,
        customerId: message.customer_id,
        channel: message.channel,
        sector,
        intent: classification.intent,
        lastUserMessage: message.body,
        reason: routerLlmFailed ? 'router_llm_failed' : 'agent_decision_or_failure',
      });
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

    // ANTES: devolvia "Peço desculpas, tive uma oscilação na minha rede neural" — clichê
    // ridículo que não escala nem avisa o time. Agora: tenta escalar pra humano (best-effort,
    // pode falhar se Supabase também caiu) e devolve mensagem honesta. Cliente recebe E é avisado.
    await escalateToHuman({
      ticketId: message.ticket_id,
      customerId: message.customer_id,
      channel: message.channel,
      sector: 'suporte',
      intent: 'erro_critico_mps',
      lastUserMessage: message.body,
      reason: error instanceof Error ? error.message : 'mps_exception',
    }).catch(() => { /* já loga internamente */ });

    return {
      ticketId: message.ticket_id,
      clarificationMessage: HUMAN_FALLBACK_MESSAGE,
    };
  }
}






