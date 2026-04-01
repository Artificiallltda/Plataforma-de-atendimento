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

// Singleton do provider
let telegramProvider: TelegramProvider | null = null;

/**
 * Inicializar provedor Telegram
 */
export function initTelegramProvider(botToken: string): TelegramProvider {
  if (!telegramProvider) {
    telegramProvider = new TelegramProvider(botToken, { polling: true });
    
    // Registrar handler de mensagens
    telegramProvider.onMessage(async (msg) => {
      console.log('📨 Telegram mensagem recebida:', {
        userId: msg.userId,
        text: msg.text.substring(0, 50) + (msg.text.length > 50 ? '...' : '')
      });

      // Normalizar e persistir mensagem
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

      if (result.success) {
        console.log('✅ Telegram mensagem persistida:', result.message?.id);
      } else {
        console.error('❌ Erro ao persistir mensagem Telegram:', result.error);
      }
    });

    // Registrar handler de erros
    telegramProvider.onError((error) => {
      console.error('❌ Erro no Telegram Bot:', error);
    });

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
