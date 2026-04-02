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
 * Inicializar provedor Telegram
 */
export function initTelegramProvider(botToken: string): TelegramProvider {
  if (!telegramProvider) {
    // Railway (Production) -> Desativar Polling se possível, mas manter como fallback seguro
    const isProd = process.env.NODE_ENV === 'production';
    
    telegramProvider = new TelegramProvider(botToken, { 
      polling: true // Mantemos polling mas limpamos a lógica de IA duplicada
    });
    
    const provider = telegramProvider;

    provider.onMessage(async (msg) => {
      console.log('📨 Telegram mensagem recebida:', {
        userId: msg.userId,
        text: msg.text.substring(0, 50)
      });

      // 1. Salvar Mensagem do Cliente no Banco (Normalização)
      const result = await normalizeAndSaveGenericMessage(
        {
          externalId: `${msg.userId}-${Date.now()}`,
          from: msg.userId,
          body: msg.text,
          timestamp: new Date(),
          rawPayload: msg.rawPayload
        },
        'telegram'
      );

      if (!result.success || !result.message) return;

      try {
        // 2. Verificar Status do Ticket (Humano assume = Bot cala)
        if (result.message.ticketId) {
          const { data: ticket } = await supabase
            .from('tickets')
            .select('status')
            .eq('id', result.message.ticketId)
            .single();
          
          if (ticket && (ticket.status === 'aguardando_humano' || ticket.status === 'em_atendimento' || ticket.status === 'resolvido')) {
            console.log('🔇 Bot silenciado: Ticket em atendimento humano.');
            return;
          }
        }

        // 3. Delegar para o Cérebro Centralizado (Única Inteligência)
        const processed = await processIncomingMessage({
          id: result.message.id,
          channel: 'telegram',
          customerId: result.message.customerId,
          ticketId: result.message.ticketId || '',
          body: result.message.body
        });

        // 4. Enviar Resposta para o Telegram
        if (processed.clarificationMessage) {
          await provider.sendMessage({
            to: msg.userId,
            text: processed.clarificationMessage,
            parseMode: 'Markdown'
          });
        }

      } catch (error) {
        console.error('❌ Erro no fluxo centralizado de IA:', error);
      }
    });

    console.log('✅ Telegram Provider inicializado');
  }

  return telegramProvider;
}

/**
 * Registrar rotas do webhook Telegram
 */
export async function registerTelegramWebhook(fastify: any, botToken: string): Promise<void> {
  initTelegramProvider(botToken);
  
  fastify.get('/webhooks/telegram', async () => ({ 
    status: 'active', 
    mode: 'synchronized', 
    platform: 'telegram' 
  }));
  
  fastify.post('/webhooks/telegram', async (request: FastifyRequest) => {
    // Se o modo webhook for ativado via BotFather, a lógica deve espelhar o onMessage acima.
    return { success: true };
  });

  console.log('✅ Webhooks Telegram registrados: GET/POST /webhooks/telegram');
}

export default {
  initTelegramProvider,
  registerTelegramWebhook
};
