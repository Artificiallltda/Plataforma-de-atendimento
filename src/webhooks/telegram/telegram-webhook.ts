/**
 * Webhook Handler do Telegram (Sincronizado)
 * 
 * Receptor de mensagens do Telegram Bot.
 * Garante que apenas UM fluxo de processamento de IA seja ativado.
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import TelegramProvider from '../../integrations/telegram-provider';
import { normalizeAndSaveGenericMessage } from '../../services/normalization-service';
import { processIncomingMessage } from '../../services/message-processing-service';
import { getSupabaseClient } from '../../config/supabase';

const supabase = getSupabaseClient();
let telegramProvider: TelegramProvider | null = null;

/**
 * Processador central de mensagens (Compartilhado entre Polling e Webhook)
 */
async function handleIncomingTelegramMessage(msg: any, provider: TelegramProvider) {
  console.log('📨 [Telegram] Processando mensagem:', {
    userId: msg.userId,
    text: msg.text?.substring(0, 50)
  });

  // 1. Salvar Mensagem do Cliente no Banco (Normalização)
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
    // 2. Verificar Status do Ticket (Humano assume = Bot cala)
    if (result.message.ticket_id) {
      const { data: ticket } = await supabase
        .from('tickets')
        .select('status')
        .eq('id', result.message.ticket_id)
        .single();
      
      if (ticket && ((ticket as any).status === 'aguardando_humano' || (ticket as any).status === 'em_atendimento' || (ticket as any).status === 'resolvido')) {
        console.log('🔇 Bot silenciado: Ticket em atendimento humano.');
        return;
      }
    }

    // 3. Delegar para o Cérebro Centralizado
    const processed = await processIncomingMessage({
      id: result.message.id,
      channel: 'telegram',
      customer_id: result.message.customer_id,
      ticket_id: result.message.ticket_id || undefined,
      body: result.message.body
    });

    // 4. Enviar Resposta para o Telegram
    if (processed.clarificationMessage) {
      console.log(`🤖 [Telegram] Enviando resposta IA para ${msg.userId}`);
      await provider.sendMessage({
        to: msg.userId,
        text: processed.clarificationMessage,
        parseMode: 'Markdown'
      });
    }

  } catch (error) {
    console.error('❌ Erro no fluxo centralizado de IA:', error);
  }
}

/**
 * Inicializar provedor Telegram
 */
export function initTelegramProvider(botToken: string): TelegramProvider {
  if (!telegramProvider) {
    const isProd = process.env.NODE_ENV === 'production' || !!process.env.RAILWAY_STATIC_URL;
    
    console.log(`[Telegram PAA] Inicializando em modo ${isProd ? 'WEBHOOK' : 'POLLING'}...`);

    telegramProvider = new TelegramProvider(botToken, { 
      polling: !isProd 
    });
    
    const provider = telegramProvider;

    // Registrar o processador no provider
    provider.onMessage((msg) => handleIncomingTelegramMessage(msg, provider));

    // Configurar Webhook no Telegram se estiver em produção
    if (isProd) {
      const domain = process.env.FRONTEND_URL || `https://${process.env.RAILWAY_STATIC_URL}`;
      const webhookUrl = `${domain}/webhooks/telegram`;
      
      // Chamada interna para o bot (TelegramProvider precisa expor o bot ou ter um método setWebhook)
      (provider as any).bot.setWebHook(webhookUrl)
        .then(() => console.log(`🚀 Webhook do Telegram configurado para: ${webhookUrl}`))
        .catch((err: any) => console.error('❌ Erro ao configurar Webhook no Telegram:', err));
    }

    console.log('✅ Telegram Provider inicializado');
    setupOutboundSync(provider);
  }

  return telegramProvider;
}

/**
 * Monitora mensagens inseridas manualmente (humanos) e as envia para o Telegram
 */
function setupOutboundSync(provider: TelegramProvider) {
  console.log('📡 Iniciando Outbound Sync (Dashboard -> Telegram)...');

  supabase
    .channel('outbound-telegram-messages')
    .on(
      'postgres_changes',
      {
        event: 'INSERT',
        schema: 'public',
        table: 'messages',
        filter: 'sender=eq.human'
      },
      async (payload) => {
        const newMessage = payload.new as any;
        if (newMessage.channel === 'telegram' && newMessage.body) {
          try {
            const { data: customer } = await (supabase
              .from('customers') as any)
              .select('channel_user_id')
              .eq('id', newMessage.customer_id)
              .single();

            if (!customer?.channel_user_id) return;

            let agentPrefix = '';
            if (newMessage.sender_id) {
              const { data: agent } = await (supabase
                .from('agents') as any)
                .select('name, sector')
                .eq('id', newMessage.sender_id)
                .single();
              
              if (agent) {
                const sectorLabel = agent.sector ? ` (${agent.sector.charAt(0).toUpperCase() + agent.sector.slice(1)})` : '';
                agentPrefix = `*${agent.name}${sectorLabel}*: `;
              }
            }

            await provider.sendMessage({
              to: customer.channel_user_id,
              text: `${agentPrefix}${newMessage.body}`,
              parseMode: 'Markdown'
            });
            console.log(`✅ Resposta humana enviada para Telegram: ${customer.channel_user_id}`);
          } catch (error) {
            console.error('❌ Falha ao enviar mensagem de saída:', error);
          }
        }
      }
    )
    .subscribe();
}

/**
 * Registrar rotas do webhook Telegram
 */
export async function registerTelegramWebhook(fastify: any, botToken: string): Promise<void> {
  const provider = initTelegramProvider(botToken);
  
  fastify.get('/webhooks/telegram', async () => ({ 
    status: 'active', 
    webhook_url: process.env.FRONTEND_URL ? `${process.env.FRONTEND_URL}/webhooks/telegram` : 'not_set'
  }));
  
  fastify.post('/webhooks/telegram', async (request: FastifyRequest, reply: FastifyReply) => {
    try {
      // LOG CRÍTICO PARA DEBUG NO RAILWAY
      console.log('📥 [Webhook] Nova requisição recebida do Telegram');
      
      // Passar o corpo da requisição diretamente para o bot processar
      // Isso disparará o evento 'message' que o provider escuta
      await (provider as any).bot.processUpdate(request.body);
      
      return reply.code(200).send({ success: true });
    } catch (error) {
      console.error('❌ Erro ao processar update via Webhook:', error);
      return reply.code(500).send({ error: 'Internal Server Error' });
    }
  });

  console.log('✅ Rota POST /webhooks/telegram configurada para receber updates.');
}

export default {
  initTelegramProvider,
  registerTelegramWebhook
};
