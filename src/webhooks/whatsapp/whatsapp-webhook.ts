/**
 * Webhook Handler do WhatsApp
 * 
 * Endpoint principal para receber eventos da WhatsApp Cloud API.
 * 
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks
 */

import { FastifyRequest, FastifyReply } from 'fastify';
import { whatsappConfig, validateWhatsappConfig } from '../../config/whatsapp';
import { verifyWebhookToken, getChallenge, verifyPayloadSignature } from '../../validators/whatsapp-webhook-validator';
import { parseWhatsAppEvent, WhatsAppWebhookPayload } from '../../parsers/whatsapp-parser';
import { normalizeAndSaveWhatsAppMessage, updateMessageStatus } from '../../services/normalization-service';
import { processIncomingMessage } from '../../services/message-processing-service';

/**
 * GET /webhooks/whatsapp
 * 
 * Handshake inicial da Meta para verificação do webhook.
 * 
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */
export async function whatsappWebhookGet(
  request: FastifyRequest<{
    Querystring: {
      'hub.mode': string;
      'hub.verify_token': string;
      'hub.challenge': string;
    };
  }>,
  reply: FastifyReply
) {
  console.log('📱 Webhook WhatsApp - Handshake recebido');
  console.log('Mode:', request.query['hub.mode']);
  console.log('Verify Token:', request.query['hub.verify_token']);

  // Verificar mode
  if (request.query['hub.mode'] !== 'subscribe') {
    console.error('❌ Mode inválido:', request.query['hub.mode']);
    return reply.code(403).send('Mode inválido');
  }

  // Verificar token
  if (!verifyWebhookToken(request.query)) {
    console.error('❌ Token de verificação inválido');
    return reply.code(403).send('Token inválido');
  }

  // Retornar challenge para confirmação
  const challenge = request.query['hub.challenge'];
  console.log('✅ Webhook verificado com sucesso!');
  return reply.code(200).send(challenge);
}

/**
 * POST /webhooks/whatsapp
 * 
 * Recebe eventos de mensagens e statuses da WhatsApp Cloud API.
 * 
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */
export async function whatsappWebhookPost(
  request: FastifyRequest<{
    Body: WhatsAppWebhookPayload;
    Headers: {
      'x-hub-signature-256'?: string;
    };
  }>,
  reply: FastifyReply
) {
  const startTime = Date.now();
  console.log('📱 Webhook WhatsApp - Evento recebido');

  try {
    // Validar configuração
    const configValidation = validateWhatsappConfig();
    if (!configValidation.valid) {
      console.error('❌ Configuração inválida:', configValidation.errors);
      return reply.code(500).send({ error: 'Configuração inválida' });
    }

    // Validar assinatura do payload — OBRIGATÓRIA em produção.
    // Em dev (NODE_ENV !== 'production') aceita ausência para facilitar testes locais.
    const signature = request.headers['x-hub-signature-256'];
    const rawBody = Buffer.from(JSON.stringify(request.body));
    const isProd = process.env.NODE_ENV === 'production';

    if (!signature) {
      if (isProd) {
        console.error('❌ Header x-hub-signature-256 ausente em produção');
        return reply.code(401).send({ error: 'Signature required' });
      }
      console.warn('⚠️ Webhook WhatsApp sem signature (aceito em DEV apenas)');
    } else {
      const signatureValid = await verifyPayloadSignature(signature, rawBody);
      if (!signatureValid) {
        console.error('❌ Assinatura do payload inválida');
        return reply.code(403).send({ error: 'Assinatura inválida' });
      }
    }

    // Validar estrutura do payload
    if (!request.body || request.body.object !== 'whatsapp_business_account') {
      console.error('❌ Payload inválido - object não é whatsapp_business_account');
      return reply.code(400).send({ error: 'Payload inválido' });
    }

    // Parse do payload
    const parsedEvents = parseWhatsAppEvent(request.body);
    console.log(`✅ ${parsedEvents.length} evento(s) parseado(s)`);

    // Processar cada evento
    for (const event of parsedEvents) {
      if (event.type === 'message') {
        console.log(`📨 ${event.messages?.length || 0} mensagem(s) recebida(s)`);

        // Usar serviço de normalização para parse, validação e persistência
        const result = await normalizeAndSaveWhatsAppMessage(request.body);
        
        if (result.success) {
          console.log(`✅ ${result.messages.length} mensagem(s) normalizada(s) e persistida(s)`);
          
          // DISPARAR PROCESSAMENTO DE IA PARA CADA MENSAGEM (O QUE ESTAVA FALTANDO!)
          for (const msg of result.messages) {
            console.log(`🤖 Disparando IA para mensagem: ${msg.external_id}`);
            processIncomingMessage({
              id: msg.id,
              channel: 'whatsapp',
              customer_id: msg.customer_id,
              ticket_id: msg.ticket_id,
              body: msg.body
            }).catch(err => console.error('❌ Erro no processamento assíncrono da IA (WhatsApp):', err));
          }
        } else {
          console.error(`❌ Erros na normalização:`, result.errors);
        }

        for (const msg of result.messages) {
          console.log('  - Mensagem:', {
            external_id: msg.external_id,
            customer_id: msg.customer_id,
            body: msg.body.substring(0, 50) + (msg.body.length > 50 ? '...' : '')
          });
        }
      } else if (event.type === 'status') {
        console.log(`📊 ${event.statuses?.length || 0} status(s) recebido(s)`);

        for (const status of event.statuses || []) {
          console.log('  - Status:', {
            external_id: status.externalId,
            status: status.status,
            error: status.error?.title
          });

          // Atualizar status da mensagem no Supabase
          await updateMessageStatus(status.externalId, 'whatsapp', {
            status: status.status,
            timestamp: status.timestamp,
            error: status.error
          });
        }
      }
    }

    // Responder em < 3 segundos (NFR-02)
    const duration = Date.now() - startTime;
    console.log(`✅ Webhook processado em ${duration}ms`);

    if (duration > 3000) {
      console.warn('⚠️ Processamento excedeu 3s - considerar processamento assíncrono');
    }

    // Meta requer resposta HTTP 200 para não reenviar
    return reply.code(200).send({ success: true });

  } catch (error) {
    console.error('❌ Erro ao processar webhook:', error);
    
    // Log de erro com retry para falhas de processamento
    // TODO: Implementar error logging com retry
    
    return reply.code(500).send({ 
      error: 'Erro interno ao processar webhook',
      message: error instanceof Error ? error.message : 'Unknown error'
    });
  }
}

/**
 * Registrar rotas do webhook WhatsApp
 */
export async function registerWhatsappWebhook(fastify: any) {
  // GET - Handshake
  fastify.get('/webhooks/whatsapp', whatsappWebhookGet);
  
  // POST - Eventos
  fastify.post('/webhooks/whatsapp', whatsappWebhookPost);
  
  console.log('✅ Webhooks WhatsApp registrados: GET/POST /webhooks/whatsapp');
}

export default {
  whatsappWebhookGet,
  whatsappWebhookPost,
  registerWhatsappWebhook
};
