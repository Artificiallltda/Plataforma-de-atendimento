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
          name: msg.userName, // Passando o nome real do Telegram para o banco
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
        if (result.message.ticketId) {
          const { data: ticket } = await supabase
            .from('tickets')
            .select('status')
            .eq('id', result.message.ticketId)
            .single();
          
          if (ticket && ((ticket as any).status === 'aguardando_humano' || (ticket as any).status === 'em_atendimento' || (ticket as any).status === 'resolvido')) {
            console.log('🔇 Bot silenciado: Ticket em atendimento humano.');
            return;
          }
        }

        // 3. Delegar para o Cérebro Centralizado (Única Inteligência)
        const processed = await processIncomingMessage({
          id: result.message.id,
          channel: 'telegram',
          customerId: result.message.customerId,
          ticketId: result.message.ticketId || undefined, // '' vira undefined para lógica de ticket funcionar
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
    
    // 5. [NOVO] Outbound Sync: Escutar Dashboard e enviar para o Telegram
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
        
        // Só processa se for do canal Telegram e não tiver vindo do próprio bot/webhook
        if (newMessage.channel === 'telegram' && newMessage.body) {
          console.log(`📤 Recuperando ID real do Telegram para o cliente UUID: ${newMessage.customer_id}`);
          
          try {
            // BUSCAR O ID REAL DO TELEGRAM (NÚMERO) NO BANCO
            const { data: customer, error: custErr } = await supabase
              .from('customers')
              .select('channel_user_id')
              .eq('id', newMessage.customer_id)
              .single();

            if (custErr || !customer?.channel_user_id) {
              console.error(`❌ Não foi possível encontrar o ID do Telegram para o UUID ${newMessage.customer_id}:`, custErr);
              return;
            }

            console.log(`📡 Enviando mensagem para o ChatID Telegram: ${customer.channel_user_id}`);
            
            // BUSCAR NOME DO AGENTE PARA IDENTIFICAÇÃO (OPCIONAL MAS RECOMENDADO)
            let agentPrefix = '';
            if (newMessage.sender === 'human' && newMessage.sender_id) {
              const { data: agent } = await supabase
                .from('agents')
                .select('name, sector')
                .eq('id', newMessage.sender_id)
                .single();
              
              if (agent) {
                const sectorLabel = agent.sector ? ` (${agent.sector.charAt(0).toUpperCase() + agent.sector.slice(1)})` : '';
                agentPrefix = `*${agent.name}${sectorLabel}*: `;
              }
            }

            const result = await provider.sendMessage({
              to: customer.channel_user_id, // AGORA USANDO O ID CORRETO (NÚMERO)
              text: `${agentPrefix}${newMessage.body}`,
              parseMode: 'Markdown'
            });
            console.log(`✅ Resultado do envio para Telegram: ${result ? 'Sucesso' : 'Falha'}`);
          } catch (error) {
            console.error('❌ Falha ao enviar mensagem de saída para o Telegram:', error);
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


