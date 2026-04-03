/**
 * Webhook Handler do Telegram (Sincronizado)
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import TelegramProvider from '../../integrations/telegram-provider';
import { normalizeAndSaveGenericMessage } from '../../services/normalization-service';
import { processIncomingMessage } from '../../services/message-processing-service';
import { getSupabaseClient } from '../../config/supabase';

const supabase = getSupabaseClient();
let telegramProvider: TelegramProvider | null = null;

/**
 * Processador central de mensagens
 */
async function handleIncomingTelegramMessage(msg: any, provider: TelegramProvider) {
  console.log('📨 [Telegram] Processando mensagem:', {
    userId: msg.userId,
    text: msg.text?.substring(0, 50)
  });

  const result = await normalizeAndSaveGenericMessage(
    {
      externalId: `${msg.userId}-${Date.now()}`,
      from: msg.userId,
      name: msg.userName,
      body: msg.text,
      mediaUrl: msg.imageUrl,
      mediaType: msg.mediaType as any,
      rawPayload: msg.rawPayload
    },
    'telegram'
  );

  if (!result.success || !result.message) {
    console.error('❌ [Telegram] normalizeAndSaveGenericMessage FALHOU:', {
      success: result.success,
      error: result.error,
      userId: msg.userId,
      text: msg.text?.substring(0, 80)
    });
    return;
  }

  console.log('✅ [Telegram] Mensagem normalizada e salva:', {
    messageId: result.message.id,
    customerId: result.message.customer_id,
    ticketId: result.message.ticket_id ?? 'nenhum ainda'
  });

  try {
    console.log('🔍 [Telegram] Iniciando processIncomingMessage:', {
      messageId: result.message.id,
      customerId: result.message.customer_id,
      ticketId: result.message.ticket_id ?? 'nenhum ainda',
      body: result.message.body?.substring(0, 80)
    });

    const processed = await processIncomingMessage({
      id: result.message.id,
      channel: 'telegram',
      customer_id: result.message.customer_id,
      ticket_id: result.message.ticket_id || undefined,
      body: result.message.body
    });

    console.log('✅ [Telegram] processIncomingMessage concluído:', {
      ticketId: processed.ticketId,
      sector: processed.sector,
      hasResponse: !!processed.clarificationMessage
    });

    if (processed.clarificationMessage) {
      console.log(`🤖 [Telegram] Respondendo para ${msg.userId}`);
      await provider.sendMessage({
        to: msg.userId,
        text: processed.clarificationMessage,
        parseMode: 'Markdown'
      });
    }
  } catch (error) {
    console.error('❌ [Telegram] Erro no fluxo de IA:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      userId: msg.userId
    });
  }
}

/**
 * Inicializar provedor Telegram
 */
export function initTelegramProvider(botToken: string): TelegramProvider {
  if (!telegramProvider) {
    const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_STATIC_URL;
    
    telegramProvider = new TelegramProvider(botToken, { polling: !isProd });
    const provider = telegramProvider;
    provider.onMessage((msg) => handleIncomingTelegramMessage(msg, provider));

    console.log('✅ Telegram Provider inicializado');
    setupOutboundSync(provider);
  }
  return telegramProvider;
}

/**
 * Configurar a URL do Webhook no Telegram (chamado após o servidor estar UP)
 */
export function setupTelegramWebhookUrl(botToken: string): void {
  const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_STATIC_URL;
  if (!isProd) {
    console.log('ℹ️ [Telegram] Modo desenvolvimento — setWebHook ignorado (usando polling)');
    return;
  }

  // Garantir que o provider foi inicializado
  const provider = initTelegramProvider(botToken);
  const bot = (provider as any).bot;

  let domain = process.env.TELEGRAM_WEBHOOK_URL || process.env.FRONTEND_URL;
  
  if (!domain && process.env.RAILWAY_STATIC_URL) {
    domain = `https://${process.env.RAILWAY_STATIC_URL}`;
  }

  if (!domain || domain.includes('undefined')) {
    console.error('❌ [Telegram] URL de Webhook não definida. Configure TELEGRAM_WEBHOOK_URL.');
    return;
  }

  // Sanitização: remove barra no final e garante HTTPS
  const baseUrl = domain.replace(/\/$/, '').replace('http://', 'https://');
  const webhookUrl = `${baseUrl}/webhooks/telegram`;

  console.log(`🔗 [Telegram] Registrando webhook: ${webhookUrl}`);
  bot.setWebHook(webhookUrl)
    .then(() => {
      console.log(`🚀 Webhook do Telegram configurado com sucesso: ${webhookUrl}`);
      return bot.getWebHookInfo();
    })
    .then((info: any) => console.log('📊 Status do Webhook no Telegram:', info))
    .catch((err: any) => console.error(`❌ Falha no setWebHook (${webhookUrl}):`, err.message));
}

function setupOutboundSync(provider: TelegramProvider) {
  supabase.channel('outbound-telegram').on('postgres_changes', { event: 'INSERT', schema: 'public', table: 'messages', filter: 'sender=eq.human' }, 
  async (payload) => {
    const newMessage = payload.new as any;
    if (newMessage.channel === 'telegram') {
      const { data: customer } = await (supabase.from('customers') as any).select('channel_user_id').eq('id', newMessage.customer_id).single();
      if (customer?.channel_user_id) {
        await provider.sendMessage({ to: customer.channel_user_id, text: newMessage.body, parseMode: 'Markdown' });
      }
    }
  }).subscribe();
}

/**
 * Registrar rotas do webhook Telegram na instância raiz do Fastify
 */
export async function registerTelegramWebhook(fastify: any, botToken: string): Promise<void> {
  const provider = initTelegramProvider(botToken);
  
  fastify.post('/webhooks/telegram', async (request: FastifyRequest, reply: FastifyReply) => {
    // LOG DO PAYLOAD COMPLETO
    console.log('📥 [Webhook] Payload recebido:', JSON.stringify(request.body, null, 2));
    
    try {
      await (provider as any).bot.processUpdate(request.body);
      return reply.code(200).send({ success: true });
    } catch (error) {
      console.error('❌ Erro Webhook:', error);
      return reply.code(200).send({ error: 'Erro processado' }); // Sempre 200 para o Telegram não re-enviar
    }
  });
}

export default { initTelegramProvider, registerTelegramWebhook, setupTelegramWebhookUrl };
