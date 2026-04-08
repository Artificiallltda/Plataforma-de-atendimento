/**
 * Health Check Endpoint
 * 
 * Verifica saúde do sistema incluindo:
 * - Conexão com banco de dados
 * - Uso de memória
 * - Uptime
 * - Status dos serviços externos
 */

import { FastifyInstance } from 'fastify';
import { getSupabaseClient } from '../config/supabase';
import { logger } from '../utils/logger';

interface HealthCheck {
  status: 'ok' | 'degraded' | 'error';
  timestamp: string;
  version: string;
  uptime: number;
  checks: {
    database: { status: 'ok' | 'error'; responseTime?: number; error?: string };
    memory: { status: 'ok' | 'warning' | 'error'; used: string; total: string; percentage: number };
    environment: { status: 'ok' | 'error'; missingVars: string[] };
  };
}

export async function registerHealthRoutes(fastify: FastifyInstance) {
  
  // Health check básico (rápido, para load balancers)
  fastify.get('/health', async (_request, reply) => {
    return reply.code(200).send({ status: 'ok', timestamp: new Date().toISOString() });
  });

  // Health check detalhado (para monitoramento)
  fastify.get('/health/detailed', async (_request, reply) => {
    const checks: HealthCheck = {
      status: 'ok',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version || '1.0.0',
      uptime: process.uptime(),
      checks: {
        database: { status: 'ok' },
        memory: { status: 'ok', used: '0MB', total: '0MB', percentage: 0 },
        environment: { status: 'ok', missingVars: [] }
      }
    };

    // Check database
    try {
      const startTime = Date.now();
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('tickets').select('id').limit(1);
      const responseTime = Date.now() - startTime;

      if (error) {
        checks.checks.database = { status: 'error', error: error.message, responseTime };
      } else {
        checks.checks.database = { status: 'ok', responseTime };
      }
    } catch (err: any) {
      checks.checks.database = { status: 'error', error: err.message };
    }

    // Check memory
    const memUsage = process.memoryUsage();
    const memLimit = 512 * 1024 * 1024; // 512MB warning threshold
    const usedMB = Math.round(memUsage.heapUsed / 1024 / 1024);
    const totalMB = Math.round(memUsage.heapTotal / 1024 / 1024);
    const percentage = Math.round((memUsage.heapUsed / memLimit) * 100);

    checks.checks.memory = {
      status: memUsage.heapUsed > memLimit ? 'warning' : 'ok',
      used: `${usedMB}MB`,
      total: `${totalMB}MB`,
      percentage
    };

    // Check environment variables
    const requiredVars = [
      'SUPABASE_URL',
      'SUPABASE_SERVICE_ROLE_KEY',
      'GEMINI_API_KEY'
    ];
    const missingVars = requiredVars.filter(v => !process.env[v]);
    
    checks.checks.environment = {
      status: missingVars.length > 0 ? 'error' : 'ok',
      missingVars
    };

    // Determinar status geral
    const checkResults = Object.values(checks.checks);
    if (checkResults.some((c: any) => c.status === 'error')) {
      checks.status = 'error';
    } else if (checkResults.some((c: any) => c.status === 'warning')) {
      checks.status = 'degraded';
    }

    const statusCode = checks.status === 'error' ? 503 : 200;
    
    if (checks.status !== 'ok') {
      logger.warn('Health check falhou', { checks });
    }

    return reply.code(statusCode).send(checks);
  });

  // Readiness check (para Kubernetes)
  fastify.get('/health/ready', async (_request, reply) => {
    try {
      const supabase = getSupabaseClient();
      const { error } = await supabase.from('tickets').select('id').limit(1);
      
      if (error) throw error;
      
      return reply.code(200).send({ ready: true });
    } catch (err) {
      return reply.code(503).send({ ready: false });
    }
  });

  // Liveness check (para Kubernetes)
  fastify.get('/health/live', async (_request, reply) => {
    return reply.code(200).send({ alive: true });
  });
}

export default registerHealthRoutes;
