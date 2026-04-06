import { GoogleGenerativeAI } from '@google/generative-ai';
import { VertexAI } from '@google-cloud/vertexai';
import * as dotenv from 'dotenv';
import path from 'path';

// Garante que as variáveis de ambiente base sejam carregadas caso a injeção em outro canto falhe.
dotenv.config({ path: path.resolve(process.cwd(), '.env') });

/**
 * Retorna o modelo do Gemini instanciado (da Vertex AI ou da API padrão).
 *
 * @param modelName O nome do modelo (ex: 'gemini-1.5-pro' ou 'gemini-1.5-flash')
 * @returns Instância de um GenerativeModel da Google (Vertex ou SDK Padrão)
 */
export function getGeminiModel(modelName: string) {
    try {
        const projectId = process.env.GOOGLE_CLOUD_PROJECT;
        const location = process.env.GOOGLE_CLOUD_LOCATION || 'us-central1';

        // Se tiver projeto configurado, usa a Vertex AI (Plataforma Profissional e Sem Rate Limits excessivos)
        if (projectId && process.env.GOOGLE_APPLICATION_CREDENTIALS) {
            console.log(`[LLM Factory] Inicializando Vertex AI (Proj: ${projectId}, ID: ${location}) -> ${modelName}`);
            
            const vertexAI = new VertexAI({ project: projectId, location: location });
            const model = vertexAI.getGenerativeModel({
                model: modelName,
            });

            return model;
        } else {
            throw new Error("Credenciais da Vertex AI ausentes ou incompletas, tentando fallback...");
        }
    } catch (error) {
        console.warn(`[LLM Factory] Aviso da Vertex AI: ${(error as Error).message}`);
        console.warn(`[LLM Factory] Fazendo fallback para GEMINI_API_KEY pessoal...`);
        
        const apiKey = process.env.GEMINI_API_KEY;
        if (!apiKey) {
             throw new Error("[CRÍTICO] GEMINI_API_KEY não está configurada e a infraestrutura principal falhou!");
        }

        const genAI = new GoogleGenerativeAI(apiKey);
        return genAI.getGenerativeModel({ model: modelName });
    }
}
