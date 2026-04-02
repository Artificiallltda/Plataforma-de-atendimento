/**
 * Servidor Fastify - Plataforma de Atendimento Artificiall (PAA)
 * 
 * API Gateway para receber webhooks e gerenciar atendimento omnichannel.
 */

import Fastify from 'fastify';
import cors from '@fastify/cors';
import { registerWhatsappWebhook } from './webhooks/whatsapp/whatsapp-webhook';
import { registerTelegramWebhook } from './webhooks/telegram/telegram-webhook';
import { registerAdminAuthRoutes } from './webhooks/admin-auth';
import { registerFeedbackTriggerRoutes } from './webhooks/feedback-trigger';

const fastify = Fastify({
  logger: {
    level: process.env.NODE_ENV === 'production' ? 'info' : 'debug'
  }
});

// Configurar CORS para o Dashboard
fastify.register(cors, {
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
fastify.get('/health', async (request, reply) => {
  return { 
    status: 'ok', 
    timestamp: new Date().toISOString(),
    service: 'paa-api'
  };
});

// ROTA DE DEBUG - RESET DO BANCO (LIMPEZA TOTAL)
fastify.get('/api/debug/reset', async (request, reply) => {
  const { getSupabaseClient } = require('./config/supabase');
  const supabase = getSupabaseClient();
  
  console.log('🧹 Iniciando limpeza total do banco de dados...');
  
  try {
    // A ordem importa por causa das foreign keys
    await (supabase.from('messages') as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    await (supabase.from('tickets') as any).delete().neq('id', '00000000-0000-0000-0000-000000000000');
    
    return { success: true, message: 'Banco de dados limpo com sucesso!' };
  } catch (error: any) {
    console.error('❌ Erro na limpeza:', error);
    return reply.status(500).send({ success: false, error: error.message });
  }
});

// Registrar webhooks
fastify.register(registerWhatsappWebhook);
fastify.register(registerAdminAuthRoutes);
fastify.register(registerFeedbackTriggerRoutes);

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
});

export default fastify;
