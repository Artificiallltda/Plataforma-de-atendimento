import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerWhatsappWebhook } from './webhooks/whatsapp/whatsapp-webhook';
import { registerTelegramWebhook, setupTelegramWebhookUrl } from './webhooks/telegram/telegram-webhook';
import { registerAdminAuthRoutes } from './webhooks/admin-auth';
import { registerFeedbackTriggerRoutes } from './webhooks/feedback-trigger';

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  }
});

const start = async () => {
  // CORS
  await fastify.register(cors, {
    origin: [
      'http://localhost:3000',
      'http://localhost:3001',
      'https://plataformadeatendimentoartificiall.up.railway.app',
      'https://artificiall.ai'
    ],
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
    credentials: true
  });

  // Health check
  fastify.get('/health', async () => ({
    status: 'ok',
    timestamp: new Date().toISOString(),
    service: 'paa-api'
  }));

  // Webhooks na instância RAIZ (sem plugin wrapper)
  await fastify.register(registerWhatsappWebhook);
  await fastify.register(registerAdminAuthRoutes);
  await fastify.register(registerFeedbackTriggerRoutes);

  // Telegram: rota registrada diretamente na instância raiz
  if (process.env.TELEGRAM_BOT_TOKEN) {
    await registerTelegramWebhook(fastify, process.env.TELEGRAM_BOT_TOKEN);
    console.log('✅ Rota POST /webhooks/telegram registrada na instância raiz');
  } else {
    console.log('⚠️ TELEGRAM_BOT_TOKEN não configurado - Telegram desabilitado');
  }

  // Iniciar servidor
  const PORT = process.env.PORT || 3000;
  const address = await fastify.listen({ port: Number(PORT), host: '0.0.0.0' });
  console.log(`🚀 PAA API rodando em ${address}`);

  // Registrar webhook no Telegram APÓS o servidor estar UP
  if (process.env.TELEGRAM_BOT_TOKEN) {
    setupTelegramWebhookUrl(process.env.TELEGRAM_BOT_TOKEN);
  }
};

start().catch(err => {
  console.error('❌ Erro fatal ao iniciar servidor:', err);
  process.exit(1);
});

export default fastify;
