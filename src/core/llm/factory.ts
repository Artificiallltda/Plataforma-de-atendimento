import { VertexAI } from '@google-cloud/vertexai';
import * as dotenv from 'dotenv';
import path from 'path';
import { CircuitBreaker } from '../../utils/circuit-breaker';
import { logger } from '../../utils/logger';

dotenv.config({ path: path.resolve(process.cwd(), '.env') });

const geminiCircuitBreaker = new CircuitBreaker({
  failureThreshold: 5,
  timeout: 60000,
  halfOpenMaxCalls: 3
});

const modelCache: Map<string, unknown> = new Map();

/**
 * Retorna um modelo Gemini via Vertex AI.
 *
 * Vertex-only por design: a operação roda em ambiente GCP com Service Account
 * (paa-gcp-key.json). A API pública do Google AI Studio (GEMINI_API_KEY) NÃO
 * é usada — modelos como gemini-2.5-pro têm limit=0 no free tier e modelos
 * preview-only de AI Studio não existem no Vertex.
 *
 * @param modelName Nome do modelo Vertex (ex: 'gemini-2.5-pro', 'gemini-2.5-flash')
 */
export function getGeminiModel(modelName: string): unknown {
  const cachedKey = `${modelName}-${process.env.NODE_ENV}`;
  if (modelCache.has(cachedKey)) {
    return modelCache.get(cachedKey);
  }

  const projectId = process.env.GOOGLE_CLOUD_PROJECT;
  const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';
  const credentialsPath = process.env.GOOGLE_APPLICATION_CREDENTIALS;

  if (!projectId || !credentialsPath) {
    const missing = [
      !projectId && 'GOOGLE_CLOUD_PROJECT',
      !credentialsPath && 'GOOGLE_APPLICATION_CREDENTIALS'
    ].filter(Boolean).join(', ');
    throw new Error(
      `[LLM Factory] Vertex AI não configurado. Faltando: ${missing}. ` +
      `A API pública do Google AI Studio não é suportada — Vertex é obrigatório.`
    );
  }

  logger.info(
    `[LLM Factory] LLM_PATH=vertex project=${projectId} location=${location} model=${modelName}`
  );

  const vertexAI = new VertexAI({ project: projectId, location });
  const model = vertexAI.getGenerativeModel({ model: modelName });

  modelCache.set(cachedKey, model);
  return model;
}

/**
 * Executa geração de conteúdo com proteção de circuit breaker.
 *
 * NOTA: A SDK @google-cloud/vertexai v1.x só converte `string` para
 * `{contents: [...]}`. `string[]` é tratado como GenerateContentRequest
 * bruto, causando erro 400. Por isso, concatenamos o array aqui.
 */
export async function generateContentWithCircuitBreaker(
  modelName: string,
  content: string | string[]
): Promise<{ response: { text: () => string } }> {
  const prompt = Array.isArray(content) ? content.join('\n\n') : content;
  return geminiCircuitBreaker.execute(async () => {
    const model = getGeminiModel(modelName) as { generateContent: (content: string) => Promise<{ response: { text: () => string } }> };
    return model.generateContent(prompt);
  });
}

export function getCircuitBreakerState(): string {
  return geminiCircuitBreaker.getState();
}
