/**
 * Webhook Handler do Telegram
 * 
 * Endpoint para receber mensagens do Telegram Bot.
 * Usa polling por padrão (mais simples para desenvolvimento).
 * 
 * @see https://core.telegram.org/bots/api
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import TelegramProvider, { TelegramIncomingMessage } from '../../integrations/telegram-provider';
import { normalizeAndSaveGenericMessage } from '../../services/normalization-service';
import { processIncomingMessage } from '../../services/message-processing-service';
import { SupportAgent } from '../../agents/support-agent';
import { FinanceAgent } from '../../agents/finance-agent';
import { SalesAgent } from '../../agents/sales-agent';
import { getSupabaseClient } from '../../config/supabase';

// Instâncias dos especialistas
const supportAgent = new SupportAgent();
const financeAgent = new FinanceAgent();
const salesAgent = new SalesAgent();
const supabase = getSupabaseClient();

// Singleton do provider
let telegramProvider: TelegramProvider | null = null;

/**
 * Inicializar provedor Telegram
 */
export function initTelegramProvider(botToken: string): TelegramProvider {
  if (!telegramProvider) {
    telegramProvider = new TelegramProvider(botToken, { polling: true });
    const provider = telegramProvider;

    telegramProvider.onMessage(async (msg) => {
      console.log('📨 Telegram mensagem recebida:', {
        userId: msg.userId,
        text: msg.text.substring(0, 50) + (msg.text.length > 50 ? '...' : '')
      });

      const result = await normalizeAndSaveGenericMessage(
        {
          externalId: `${msg.userId}-${msg.timestamp.getTime()}`,
          from: msg.userId,
          body: msg.text,
          mediaUrl: msg.imageUrl,
          mediaType: msg.mediaType,
          timestamp: msg.timestamp,
          rawPayload: msg.rawPayload
        },
        'telegram'
      );

      if (!result.success || !result.message) return;

      try {
        // Verificar se o ticket já está associado a um especialista
        let currentAgent = null;
        let ticketStatus = 'novo';
        if (result.message.ticketId) {
          const { data: t } = await supabase.from('tickets').select('current_agent, status').eq('id', result.message.ticketId).single();
          if (t) {
            currentAgent = t.current_agent;
            ticketStatus = t.status;
          }
        }

        // Se está aguardando humano ou finalizado, não bot responde
        if (ticketStatus === 'aguardando_humano' || ticketStatus === 'em_atendimento') return;

        // Se não tem agente atual, passa pelo Router
        if (!currentAgent || currentAgent === 'router') {
          const processed = await processIncomingMessage({
            id: result.message.id,
            externalId: result.message.externalId,
            channel: 'telegram',
            customerId: result.message.customerId,
            ticketId: result.message.ticketId || '',
            body: result.message.body,
            timestamp: new Date(result.message.timestamp)
          });

          if (processed.needsClarification) {
            await provider.sendMessage({ to: msg.userId, text: processed.clarificationMessage! });
            return;
          } else if (processed.handoff) {
            currentAgent = processed.handoff.to;
            await provider.sendMessage({
              to: msg.userId,
              text: `*Artificiall:* Entendido. Direcionando você para o departamento ${processed.sector.toUpperCase()}...`,
              parseMode: 'Markdown'
            });
          }
        }

        // Repassar a mensagem para o especialista assumir
        let agentResponse = null;
        const contextBase = {
          ticketId: result.message.ticketId || '',
          customerId: result.message.customerId,
          intent: 'atendimento',
          conversationHistory: [],
          customerProfile: { id: result.message.customerId, isActive: true }
        };

        if (currentAgent === 'support') {
          agentResponse = await supportAgent.processMessage({ ...contextBase, sector: 'suporte' } as any, result.message.body);
        } else if (currentAgent === 'finance') {
          agentResponse = await financeAgent.processMessage({ ...contextBase, sector: 'financeiro' } as any, result.message.body);
        } else if (currentAgent === 'sales') {
          agentResponse = await salesAgent.processMessage({ ...contextBase, sector: 'comercial' } as any, result.message.body);
        }

        // Responder o cliente com a decisão do especialista
        if (agentResponse && agentResponse.response) {
          await provider.sendMessage({ to: msg.userId, text: agentResponse.response });
          
          if (agentResponse.needsHumanHandoff) {
             await supabase.from('tickets').update({ status: 'aguardando_humano' }).eq('id', result.message.ticketId);
          }
        }

      } catch (error) {
        console.error('❌ Erro no fluxo de IA:', error);
      }
    });

    telegramProvider.onError((error) => console.error('❌ Erro no Telegram:', error));
    console.log('✅ Telegram Provider inicializado');
  }

  return telegramProvider;
}

/**
 * GET /webhooks/telegram
 * 
 * Status do bot Telegram
 */
export async function telegramWebhookGet(
  request: FastifyRequest,
  reply: FastifyReply
) {
  const provider = telegramProvider;

  return reply.send({
    status: provider ? 'active' : 'inactive',
    mode: 'polling',
    platform: 'telegram'
  });
}

/**
 * POST /webhooks/telegram
 * 
 * Webhook para receber atualizações do Telegram (alternativa ao polling).
 * Nota: Em produção, configure o webhook via BotFather ou API.
 * 
 * @see https://core.telegram.org/bots/api#setwebhook
 */
export async function telegramWebhookPost(
  request: FastifyRequest<{
    Body: any;
  }>,
  reply: FastifyReply
) {
  try {
    // Telegram envia update via webhook
    // Nota: Se estiver usando polling, este endpoint não será usado
    console.log('📨 Telegram webhook recebido');

    // Processar update (implementação futura se necessário)
    // Por enquanto, usamos polling que é mais simples

    return reply.code(200).send({ success: true });
  } catch (error) {
    console.error('❌ Erro ao processar webhook Telegram:', error);
    return reply.code(500).send({ error: 'Erro interno' });
  }
}

/**
 * Comando: /suporte, /financeiro, /comercial
 * 
 * Handler de comandos de setor para pré-classificação
 */
export async function handleSectorCommand(
  sector: 'suporte' | 'financeiro' | 'comercial',
  userId: string,
  provider: TelegramProvider
): Promise<void> {
  const sectorNames = {
    'suporte': '🔧 Suporte Técnico',
    'financeiro': '💰 Financeiro',
    'comercial': '🤝 Comercial'
  };

  await provider.sendMessage({
    to: userId,
    text: `✅ Você selecionou *${sectorNames[sector]}*!\n\nAgora aguarde, vou analisar sua solicitação...`,
    parseMode: 'Markdown'
  });

  console.log(`📋 Telegram: Usuário ${userId} selecionou setor ${sector}`);
  
  // Nota: A mensagem será processada pelo RouterAgent via normalização
  // O comando /setor_suporte vira texto que o RouterAgent pode usar
}

/**
 * Registrar rotas do webhook Telegram
 */
export async function registerTelegramWebhook(fastify: any, botToken: string): Promise<void> {
  // Inicializar provider
  initTelegramProvider(botToken);

  // Registrar rotas
  fastify.get('/webhooks/telegram', telegramWebhookGet);
  fastify.post('/webhooks/telegram', telegramWebhookPost);

  console.log('✅ Webhooks Telegram registrados: GET/POST /webhooks/telegram');
}

export default {
  initTelegramProvider,
  telegramWebhookGet,
  telegramWebhookPost,
  handleSectorCommand,
  registerTelegramWebhook
};
