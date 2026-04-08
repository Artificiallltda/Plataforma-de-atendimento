import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { VertexAI } from '@google-cloud/vertexai';
import * as dotenv from 'dotenv';
import path from 'path';
import { CircuitBreaker } from '../../utils/circuit-breaker';
import { logger } from '../../utils/logger';

// Garante que as variáveis de ambiente base sejam carregadas caso a injeção em outro canto falhe.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

// Circuit breaker para proteger chamadas à API Gemini
const geminiCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,    // Abre após 5 falhas
  timeout: 60000,         // Tenta novamente após 60s
  halfOpenMaxCalls: 3     // Testa 3 chamadas no modo half-open
});

// Cache de modelos para evitar recriação
const modelCache: Map<string, unknown> = new Map();

/**
 * Retorna o modelo do Gemini instanciado (da Vertex AI ou da API padrão).
 * 
 * Esta função agora inclui:
 * - Circuit breaker para proteger contra falhas em cascata
 * - Cache de modelos para performance
 * - Logging estruturado
 *
 * @param modelName O nome do modelo (ex: 'gemini-1.5-pro' ou 'gemini-1.5-flash')
 * @returns Instância de um GenerativeModel da Google (Vertex ou SDK Padrão)
 */
export function getGeminiModel(modelName: string): unknown {
  // Verifica cache
  const cachedKey = `${modelName}-${process.env.NODE_ENV}`;
  if (modelCache.has(cachedKey)) {
    return modelCache.get(cachedKey);
  }

  try {
    const projectId = process.env.GOOGLE_CLOUD_PROJECT;
    const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

    // Se tiver projeto configurado, usa a Vertex AI (Plataforma Profissional e Sem Rate Limits excessivos)
    if (projectId && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
      logger.info(`[LLM Factory] Inicializando Vertex AI (Proj: ${projectId}, Loc: ${location}) -> ${modelName}`);
      
      const vertexAI = new VertexAI({ project: projectId, location: location });
      const model = vertexAI.getGenerativeModel({ model: modelName });

      modelCache.set(cachedKey, model);
      return model;
    } else {
      throw new Error("Credenciais da Vertex AI ausentes ou incompletas, tentando fallback...");
    }
  } catch (error) {
    logger.warn(`[LLM Factory] Aviso da Vertex AI: ${(error as Error).message}`);
    logger.info(`[LLM Factory] Fazendo fallback para GEMINI_API_KEY pessoal...`);
    
    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error("[CRÍTICO] GEMINI_API_KEY não está configurada e a infraestrutura principal falhou!");
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    const model = genAI.getGenerativeModel({ model: modelName });
    
    modelCache.set(cachedKey, model);
    return model;
  }
}

/**
 * Executa geração de conteúdo com proteção de circuit breaker
 * 
 * @param modelName Nome do modelo
 * @param content Conteúdo para gerar
 * @returns Resultado da geração
 */
export async function generateContentWithCircuitBreaker(
  modelName: string,
  content: string[]
): Promise<{ response: { text: () => string } }> {
  return geminiCircuitBreaker.execute(async () => {
    const model = getGeminiModel(modelName) as { generateContent: (content: string[]) => Promise<{ response: { text: () => string } }> };
    return model.generateContent(content);
  });
}

/**
 * Retorna o estado atual do circuit breaker
 */
export function getCircuitBreakerState(): string {
  return geminiCircuitBreaker.getState();
}
