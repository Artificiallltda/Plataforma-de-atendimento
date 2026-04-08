import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerWhatsappWebhook } from './webhooks/whatsapp/whatsapp-webhook';
import { registerTelegramWebhook, setupTelegramWebhookUrl } from './webhooks/telegram/telegram-webhook';
import { registerAdminAuthRoutes } from './webhooks/admin-auth';
import { registerFeedbackTriggerRoutes } from './webhooks/feedback-trigger';
import { registerHealthRoutes } from './routes/health';
import { webhookRateLimiter, apiRateLimiter, cleanupRateLimiter } from './middleware/rate-limiter';
import { getSupabaseClient } from './config/supabase';
import { logger } from './utils/logger';

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  },
  trustProxy: true // Importante para obter IP real atrás de Load Balancer/Proxy
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

  // Health checks detalhados
  await fastify.register(registerHealthRoutes);

  // Rate limiting global para API
  fastify.addHook('onRequest', apiRateLimiter);

  // Webhooks - rate limiting APENAS em POST, não no GET de verificação
  // Registra o webhook do WhatsApp sem rate limiting (aplicado dentro do handler)
  await fastify.register(registerWhatsappWebhook);
  
  // Aplica rate limiting específico apenas nas rotas POST de webhooks
  fastify.addHook('onRequest', async (request, reply) => {
    // Aplica rate limit apenas em POSTs de webhooks
    if (request.method === 'POST' && request.url.startsWith('/webhooks/')) {
      return webhookRateLimiter(request, reply);
    }
  });

  await fastify.register(registerAdminAuthRoutes);
  await fastify.register(registerFeedbackTriggerRoutes);

  // Telegram: rota registrada diretamente na instância raiz
  if (process.env.TELEGRAM_BOT_TOKEN) {
    await registerTelegramWebhook(fastify, process.env.TELEGRAM_BOT_TOKEN);
    logger.info('✅ Rota POST /webhooks/telegram registrada na instância raiz');
  } else {
    logger.warn('⚠️ TELEGRAM_BOT_TOKEN não configurado - Telegram desabilitado');
  }

  // Iniciar servidor
  const PORT = process.env.PORT || 3000;
  const address = await fastify.listen({ port: Number(PORT), host: '0.0.0.0' });
  logger.info(`🚀 PAA API rodando em ${address}`, { port: PORT, env: process.env.NODE_ENV });

  // Registrar webhook no Telegram APÓS o servidor estar UP
  if (process.env.TELEGRAM_BOT_TOKEN) {
    setupTelegramWebhookUrl(process.env.TELEGRAM_BOT_TOKEN);
  }

  // Graceful shutdown
  setupGracefulShutdown(fastify);
};

function setupGracefulShutdown(fastify: typeof Fastify.prototype) {
  const shutdown = async (signal: string) => {
    logger.info(`\n${signal} recebido. Iniciando graceful shutdown...`);

    // Timeout de segurança para forçar encerramento
    const forceExit = setTimeout(() => {
      logger.error('⚠️ Forçando shutdown após timeout de 30s');
      process.exit(1);
    }, 30000);

    try {
      // Parar de aceitar novas conexões
      await fastify.close();
      logger.info('✅ HTTP server fechado');

      // Fechar conexões do Supabase
      const supabase = getSupabaseClient();
      await supabase.removeAllChannels();
      logger.info('✅ Conexões Supabase fechadas');

      // Limpar rate limiter
      cleanupRateLimiter();
      logger.info('✅ Rate limiter limpo');

      logger.info('👋 Shutdown completo');
      clearTimeout(forceExit);
      process.exit(0);
    } catch (error) {
      logger.error('❌ Erro durante shutdown', error as Error);
      clearTimeout(forceExit);
      process.exit(1);
    }
  };

  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));

  // Uncaught Exception: log síncrono e saída imediata
  // Não executa graceful shutdown assíncrono pois o estado do runtime está corrompido
  process.on('uncaughtException', (error) => {
    // eslint-disable-next-line no-console
    console.error('💥 Uncaught Exception:', error);
    process.exit(1);
  });

  process.on('unhandledRejection', (reason) => {
    logger.error('💥 Unhandled Rejection', reason as Error);
  });
}

start().catch(err => {
  logger.error('❌ Erro fatal ao iniciar servidor:', err);
  process.exit(1);
});

export default fastify;
