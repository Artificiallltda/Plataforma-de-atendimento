/**
 * Rate Limiter para Fastify
 * 
 * Protege endpoints contra flood de requisições.
 * Implementação em memória usando Map (adequado para single instance).
 * Para múltiplas instâncias, usar Redis.
 */

interface RateLimitEntry {
  count: number;
  resetTime: number;
}

// Usando Map ao invés de objeto para evitar prototype pollution
const store: Map<string, RateLimitEntry> = new Map();

// Limpa entradas expiradas a cada 5 minutos
const cleanupInterval = setInterval(() => {
  const now = Date.now();
  for (const [key, entry] of store.entries()) {
    if (entry.resetTime < now) {
      store.delete(key);
    }
  }
}, 5 * 60 * 1000);

export interface RateLimiterOptions {
  maxRequests?: number;
  windowMs?: number;
  keyGenerator?: (request: unknown) => string;
}

export function createRateLimiter(options: RateLimiterOptions = {}) {
  const {
    maxRequests = 100,
    windowMs = 60000, // 1 minuto
    keyGenerator = (request: unknown) => {
      const req = request as { ip?: string; socket?: { remoteAddress?: string } };
      return req.ip || req.socket?.remoteAddress || 'unknown';
    }
  } = options;

  return async function rateLimiter(request: unknown, reply: unknown) {
    const key = keyGenerator(request);
    const now = Date.now();

    // Limpa e inicializa se necessário
    const existing = store.get(key);
    if (!existing || now > existing.resetTime) {
      store.set(key, { count: 1, resetTime: now + windowMs });
      return;
    }

    // Verifica limite
    if (existing.count >= maxRequests) {
      const typedReply = reply as { 
        header: (name: string, value: number) => void; 
        code: (status: number) => { send: (body: unknown) => void };
      };
      const retryAfter = Math.ceil((existing.resetTime - now) / 1000);
      typedReply.header('Retry-After', retryAfter);
      return typedReply.code(429).send({
        error: 'Too many requests',
        message: `Limite de ${maxRequests} requisições excedido. Tente novamente em ${retryAfter}s.`
      });
    }

    existing.count++;
  };
}

// Função de cleanup para graceful shutdown
export function cleanupRateLimiter(): void {
  clearInterval(cleanupInterval);
  store.clear();
}

// Pre-configurados para cenários comuns
export const webhookRateLimiter = createRateLimiter({
  maxRequests: 30,  // 30 req/min para webhooks
  windowMs: 60000
});

export const apiRateLimiter = createRateLimiter({
  maxRequests: 100, // 100 req/min para API
  windowMs: 60000
});

export const strictRateLimiter = createRateLimiter({
  maxRequests: 10,  // 10 req/min para rotas sensíveis
  windowMs: 60000
});

export default createRateLimiter;
