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
    user_id: msg.userId,
    text: msg.text?.substring(0, 50)
  });

  const result = await normalizeAndSaveGenericMessage(
    {
      external_id: `${msg.userId}-${Date.now()}`,
      from: msg.userId,
      name: msg.userName,
      body: msg.text,
      media_url: msg.imageUrl,
      media_type: msg.mediaType as any,
      raw_payload: msg.rawPayload
    },
    'telegram'
  );

  if (!result.success || !result.message) {
    console.error('❌ [Telegram] normalizeAndSaveGenericMessage FALHOU:', {
      success: result.success,
      error: result.error,
      user_id: msg.userId,
      text: msg.text?.substring(0, 80)
    });
    return;
  }

  console.log('✅ [Telegram] Mensagem normalizada e salva:', {
    message_id: result.message.id,
    customer_id: result.message.customer_id,
    ticket_id: result.message.ticket_id ?? 'nenhum ainda'
  });

  try {
    console.log('🔍 [Telegram] Iniciando processIncomingMessage:', {
      message_id: result.message.id,
      customer_id: result.message.customer_id,
      ticket_id: result.message.ticket_id ?? 'nenhum ainda',
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
      ticket_id: processed.ticketId,
      sector: processed.sector,
      has_response: !!processed.clarificationMessage
    });

    if (processed.clarificationMessage) {
      console.log(`🤖 [Telegram] Respondendo para ${msg.userId}`);
      // Sem parseMode: caracteres _, *, [, ] vindos do Gemini quebram o Markdown V1 do Telegram.
      await provider.sendMessage({
        to: msg.userId,
        text: processed.clarificationMessage,
      });
    }
  } catch (error) {
    console.error('❌ [Telegram] Erro no fluxo de IA:', {
      error: error instanceof Error ? error.message : error,
      stack: error instanceof Error ? error.stack : undefined,
      user_id: msg.userId
    });
  }
}

/**
 * Inicializar provedor Telegram
 */
export function initTelegramProvider(botToken: string): TelegramProvider {
  if (!telegramProvider) {
    // Usar WEBHOOK mode sempre que TELEGRAM_WEBHOOK_URL estiver definida
    // Usar POLLING mode APENAS para desenvolvimento local (sem a variável)
    const useWebhookMode = !!process.env.TELEGRAM_WEBHOOK_URL;
    
    console.log(`[Telegram] Modo: ${useWebhookMode ? 'WEBHOOK (produção)' : 'POLLING (desenvolvimento)'}`);

    telegramProvider = new TelegramProvider(botToken, { 
      polling: !useWebhookMode 
    });
    
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
  const domain = process.env.TELEGRAM_WEBHOOK_URL;
  
  if (!domain) {
    console.log('ℹ️ [Telegram] TELEGRAM_WEBHOOK_URL não definida — setWebHook ignorado (modo polling/dev)');
    return;
  }

  // Garantir que o provider foi inicializado
  const provider = initTelegramProvider(botToken);
  const bot = (provider as any).bot;

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
  supabase.channel('outbound-telegram').on(
    'postgres_changes',
    { event: 'INSERT', schema: 'public', table: 'messages', filter: 'sender=eq.human' }, 
    async (payload) => {
      const newMessage = payload.new as any;
      if (newMessage.channel !== 'telegram') return;

      // 1. Buscar chat_id do cliente
      const { data: customer } = await (supabase.from('customers') as any)
        .select('channel_user_id')
        .eq('id', newMessage.customer_id)
        .single();
      
      if (!customer?.channel_user_id) return;

      // 2. Buscar nome do atendente humano (sender_id referencia tabela agents)
      let agentName = 'Atendente';
      if (newMessage.sender_id) {
        const { data: agent } = await (supabase.from('agents') as any)
          .select('name')
          .eq('id', newMessage.sender_id)
          .single();
        
        if (agent) {
          agentName = agent.name || 'Atendente';
        }
      }

      // 3. Formatar mensagem com identificação (texto puro — sem Markdown)
      const formattedBody = `${agentName}:\n${newMessage.body}`;

      await provider.sendMessage({
        to: customer.channel_user_id,
        text: formattedBody,
      });

      console.log(`✅ [Telegram Outbound] Mensagem de "${agentName}" enviada para ${customer.channel_user_id}`);
    }
  ).subscribe((status) => {
    console.log('📡 [Telegram Outbound] Status da subscrição:', status);
  });
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
