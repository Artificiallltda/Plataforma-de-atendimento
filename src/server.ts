/**
 * Servidor Fastify - Plataforma de Atendimento Artificiall (PAA)
 * 
 * API Gateway para receber webhooks e gerenciar atendimento omnichannel.
 */

import Fastify from 'fastify';
import { registerWhatsappWebhook } from './webhooks/whatsapp/whatsapp-webhook';
import { registerTelegramWebhook } from './webhooks/telegram/telegram-webhook';

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  }
});

// Health check
fastify.get('/health', async (request, reply) => {
  return { 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'paa-api'
  };
});

// Registrar webhooks
fastify.register(registerWhatsappWebhook);

// Registrar Telegram (se token configurado)
if (process.env.TELEGRAM_BOT_TOKEN) {
  fastify.register((instance, opts, done) => {
    registerTelegramWebhook(instance, process.env.TELEGRAM_BOT_TOKEN!);
    done();
  });
} else {
  console.log('⚠️ TELEGRAM_BOT_TOKEN não configurado - Telegram desabilitado');
}

// Start server
const PORT = process.env.PORT || 3000;

fastify.listen({ port: Number(PORT), host: '0.0.0.0' }, (err, address) => {
  if (err) {
    console.error('❌ Erro ao iniciar servidor:', err);
    process.exit(1);
  }
  console.log(`🚀 PAA API rodando em ${address}`);
  console.log(`📱 Webhook WhatsApp: ${address}/webhooks/whatsapp`);
  console.log(`✈️ Webhook Telegram: ${address}/webhooks/telegram`);
  console.log(`💚 Health check: ${address}/health`);
});

export default fastify;
