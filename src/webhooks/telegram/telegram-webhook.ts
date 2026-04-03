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

  if (!result.success || !result.message) return;

  try {
    const processed = await processIncomingMessage({
      id: result.message.id,
      channel: 'telegram',
      customer_id: result.message.customer_id,
      ticket_id: result.message.ticket_id || undefined,
      body: result.message.body
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
    console.error('❌ Erro no fluxo de IA:', error);
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

    if (isProd) {
      // Prioridade: Variável específica > URL do Frontend > Domínio estático do Railway
      let domain = process.env.TELEGRAM_WEBHOOK_URL || process.env.FRONTEND_URL;
      
      if (!domain && process.env.RAILWAY_STATIC_URL) {
        domain = `https://${process.env.RAILWAY_STATIC_URL}`;
      }

      if (!domain || domain.includes('undefined')) {
        console.error('❌ Erro: URL de Webhook não definida. Configure TELEGRAM_WEBHOOK_URL no Railway.');
      } else {
        // Sanitização: remove barra no final e garante HTTPS
        const baseUrl = domain.replace(/\/$/, '').replace('http://', 'https://');
        const webhookUrl = `${baseUrl}/webhooks/telegram`;

        const bot = (provider as any).bot;
        bot.setWebHook(webhookUrl)
          .then(() => {
            console.log(`🚀 Webhook do Telegram configurado com sucesso: ${webhookUrl}`);
            return bot.getWebHookInfo();
          })
          .then((info: any) => console.log('📊 Status do Webhook no Telegram:', info))
          .catch((err: any) => console.error(`❌ Falha no setWebHook do Telegram (${webhookUrl}):`, err.message));
      }
    }

    setupOutboundSync(provider);
  }
  return telegramProvider;
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
 * Registrar rotas do webhook Telegram
 */
export async function registerTelegramWebhook(fastify: any, botToken: string): Promise<void> {
  const provider = initTelegramProvider(botToken);
  
  fastify.post('/webhooks/telegram', async (request: FastifyRequest, reply: FastifyReply) => {
    // LOG DO PAYLOAD COMPLETO (Item 3 do seu checklist)
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

export default { initTelegramProvider, registerTelegramWebhook };
