/**
 * RouterAgent
 * 
 * Agente de roteamento inteligente com:
 * - Retry exponencial backoff
 * - Circuit breaker protection
 * - Logging estruturado
 */

import { getGeminiModel, getCircuitBreakerState } from '../core/llm/factory';
import { getSupabaseClient } from '../config/supabase';
import { logger } from '../utils/logger';

const supabase = getSupabaseClient();

export type Sector = 'suporte' | 'financeiro' | 'comercial';
export type AgentType = 'router' | 'support' | 'finance' | 'sales' | 'escalation' | 'human' | 'feedback';

export interface RouterOutput {
  sector: Sector;
  intent: string;
  confidence: number;
  priority: 'baixa' | 'media' | 'alta' | 'critica';
  suggestedAgent: AgentType;
  needsClarification: boolean;
  reasoning?: string;
  humanResponse?: string;
}

const ROUTER_SYSTEM_PROMPT = `
Você é o **PAA Concierge**, a inteligência central da Artificiall. 
Sua única missão é entender o coração do problema do cliente e direcioná-lo com elegância.

**DIRETRIZES DE INTELIGÊNCIA:**
1. **Sem Respostas Prontas:** Não use saudações robóticas. Responda de acordo com o tom do cliente.
2. **Identificação Fluida:** Se o cliente quer comprar ou saber preços, ele é Comercial. Se tem problemas técnicos, é Suporte. Se fala de pagamentos ou faturas, é Financeiro.
3. **Poder de Decisão:** Você tem autonomia total para classificar. Use o histórico da conversa para não repetir perguntas que o cliente já respondeu.

**OBJETIVO:** 
Gere uma "humanResponse" que faça o cliente sentir que já começou a ser atendido, não que caiu em um menu.

**FORMATO DE RESPOSTA OBRIGATÓRIO (JSON):**
Responda EXCLUSIVAMENTE com um único bloco JSON válido, sem nenhum texto antes ou depois:
{
  "sector": "suporte" | "financeiro" | "comercial",
  "intent": "<intenção detectada, ex: consulta_preco, problema_login, fatura_atrasada, saudacao>",
  "confidence": <número de 0.0 a 1.0>,
  "priority": "baixa" | "media" | "alta" | "critica",
  "suggestedAgent": "support" | "finance" | "sales",
  "needsClarification": <true se a mensagem é ambígua, false caso contrário>,
  "humanResponse": "<sua resposta elegante e natural ao cliente, SEM saudação robótica>",
  "reasoning": "<motivo interno da classificação, 1 linha>"
}
`;

interface RetryConfig {
  maxRetries: number;
  baseDelay: number;
  maxDelay: number;
}

export class RouterAgent {
  private model: any;
  private modelFallback: any;
  private retryConfig: RetryConfig = {
    maxRetries: 3,
    baseDelay: 1000, // 1s
    maxDelay: 8000   // 8s
  };

  constructor() {
    this.model = getGeminiModel(process.env.GEMINI_MODEL_ROUTER || 'gemini-2.5-flash');
    this.modelFallback = getGeminiModel(process.env.GEMINI_MODEL_ROUTER_FALLBACK || 'gemini-3.1-flash-lite-preview');
  }

  private async tryGenerate(model: any, userPrompt: string): Promise<RouterOutput> {
    const startTime = Date.now();
    
    try {
      const result = await model.generateContent([ROUTER_SYSTEM_PROMPT, userPrompt]);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      
      if (!jsonMatch) {
        throw new Error('JSON nao encontrado na resposta.');
      }
      
      const parsed = JSON.parse(jsonMatch[0]);
      
      // Validar campos obrigatórios
      if (!parsed.sector || !parsed.intent || typeof parsed.confidence !== 'number') {
        throw new Error('Resposta JSON incompleta');
      }
      
      logger.debug('[Router] Classificação bem-sucedida', {
        duration: Date.now() - startTime,
        sector: parsed.sector,
        confidence: parsed.confidence
      });
      
      return parsed;
    } catch (error) {
      logger.warn('[Router] Falha na geração', {
        error: error instanceof Error ? error.message : 'unknown',
        duration: Date.now() - startTime
      });
      throw error;
    }
  }

  /**
   * Retry com exponential backoff
   */
  private async retryWithBackoff<T>(
    fn: () => Promise<T>,
    attempt: number
  ): Promise<T> {
    try {
      return await fn();
    } catch (error) {
      const isLastAttempt = attempt >= this.retryConfig.maxRetries - 1;
      
      if (isLastAttempt) {
        throw error;
      }
      
      // Exponential backoff: 1s, 2s, 4s
      const delay = Math.min(
        this.retryConfig.baseDelay * Math.pow(2, attempt),
        this.retryConfig.maxDelay
      );
      
      logger.warn(`[Router] Retry ${attempt + 1}/${this.retryConfig.maxRetries} em ${delay}ms`);
      
      await new Promise(resolve => setTimeout(resolve, delay));
      return this.retryWithBackoff(fn, attempt + 1);
    }
  }

  async classify(message: string, context?: unknown): Promise<RouterOutput> {
    const startTime = Date.now();
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    const prompt = `<HORA_ATUAL>: ${now}\nContexto: ${JSON.stringify(context)}\nMensagem do Cliente: "${message}"`;

    // Verificar estado do circuit breaker
    const circuitState = getCircuitBreakerState();
    if (circuitState === 'OPEN') {
      logger.warn('[Router] Circuit breaker OPEN - usando fallback imediato');
      return this.getFallbackResponse('Circuit breaker aberto');
    }

    // Tentativa com modelo primário e retry
    try {
      return await this.retryWithBackoff(
        () => this.tryGenerate(this.model, prompt),
        0
      );
    } catch (err1) {
      logger.warn('[Router] Modelo primário falhou após retries', {
        error: err1 instanceof Error ? err1.message : 'unknown'
      });
    }

    // Fallback para modelo secundário
    try {
      logger.info('[Router] Tentando modelo fallback...');
      const result = await this.retryWithBackoff(
        () => this.tryGenerate(this.modelFallback, prompt),
        0
      );
      logger.info('[Router] ✅ Fallback funcionou');
      return result;
    } catch (err2) {
      logger.error('[Router] Fallback também falhou', 
        err2 instanceof Error ? err2 : new Error(String(err2))
      );
    }

    // Último recurso
    return this.getFallbackResponse(
      `Erro após ${this.retryConfig.maxRetries} tentativas em ambos os modelos`
    );
  }

  private getFallbackResponse(reason: string): RouterOutput {
    return {
      sector: 'suporte',
      intent: 'erro_classificacao',
      confidence: 0.3,
      priority: 'media',
      suggestedAgent: 'support',
      needsClarification: true,
      humanResponse: "Estou com instabilidade no momento. Pode repetir sua mensagem? Já estou tentando reconectar.",
      reasoning: reason
    };
  }

  async getCustomerContext(customerId: string): Promise<unknown | null> {
    try {
      const { data: customer, error: customerError } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();
      
      if (customerError) throw customerError;

      const { data: tickets, error: ticketsError } = await supabase
        .from('tickets')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(1);
      
      if (ticketsError) throw ticketsError;

      return { customer, active_ticket: tickets?.[0] };
    } catch (error) {
      logger.warn('[Router] Erro ao buscar contexto do cliente', {
        customerId,
        error: error instanceof Error ? error.message : 'unknown'
      });
      return null;
    }
  }

  async logDecision(ticketId: string, output: RouterOutput, durationMs: number): Promise<void> {
    if (!ticketId) return;
    
    try {
      // eslint-disable-next-line @typescript-eslint/no-explicit-any
      const { error } = await (supabase.from('agent_logs') as any).insert({
        ticket_id: ticketId,
        agent_type: 'router',
        action: 'classified',
        input: { log: 'Processado' },
        output,
        confidence: output.confidence,
        duration_ms: durationMs
      });
      
      if (error) throw error;
    } catch (error) {
      logger.warn('[Router] Erro ao logar decisão', {
        ticketId,
        error: error instanceof Error ? error.message : 'unknown'
      });
    }
  }
}

export const routerAgent = new RouterAgent();
export const getRouterAgent = () => routerAgent;
