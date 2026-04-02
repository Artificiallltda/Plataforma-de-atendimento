/**
 * RouterAgent
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { getSupabaseClient } from '../config/supabase';

const supabase = getSupabaseClient();

export type Sector = 'suporte' | 'financeiro' | 'comercial';
export type AgentType = 'router' | 'support' | 'finance' | 'sales' | 'escalation' | 'human' | 'feedback';

export interface RouterOutput {
  sector: Sector;
  intent: string;
  confidence: number;
  suggestedAgent: AgentType;
  needsClarification: boolean;
  reasoning?: string;
  humanResponse?: string; // NOVO: Resposta elegante gerada pela IA
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
  "suggestedAgent": "support" | "finance" | "sales",
  "needsClarification": <true se a mensagem é ambígua, false caso contrário>,
  "humanResponse": "<sua resposta elegante e natural ao cliente, SEM saudação robótica>",
  "reasoning": "<motivo interno da classificação, 1 linha>"
}
`;

export class RouterAgent {
  private model: GenerativeModel;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.');
    const genAI = new GoogleGenerativeAI(apiKey);
    // gemini-3.1-flash-preview NÃO EXISTE na API (Abril 2026). Usar gemini-2.5-flash (estável).
    this.model = genAI.getGenerativeModel({ 
      model: process.env.GEMINI_MODEL_ROUTER || 'gemini-2.5-flash' 
    });
  }

  async classify(message: string, context?: any): Promise<RouterOutput> {
    try {
      const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
      const prompt = `<HORA_ATUAL>: ${now}\nContexto: ${JSON.stringify(context)}\nMensagem do Cliente: "${message}"`;
      const result = await this.model.generateContent([ROUTER_SYSTEM_PROMPT, prompt]);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Falha no parse');
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('❌ RouterAgent.classify() falhou:', error instanceof Error ? error.message : error);
      return {
        sector: 'suporte',
        intent: 'erro_classificacao',
        confidence: 0.3,
        suggestedAgent: 'support',
        needsClarification: true,
        humanResponse: "Desculpe pela demora! Estou processando sua mensagem. Pode me contar mais sobre o que precisa?",
        reasoning: `Fallback de erro: ${error instanceof Error ? error.message : 'desconhecido'}`
      };
    }
  }

  async getCustomerContext(customerId: string): Promise<any> {
    try {
      const { data: customer } = await supabase.from('customers').select('*').eq('id', customerId).single();
      const { data: tickets } = await supabase.from('tickets').select('*').eq('customer_id', customerId).order('created_at', { ascending: false }).limit(1);
      return { customer, activeTicket: tickets?.[0] };
    } catch (error) { return null; }
  }

  async logDecision(ticketId: string, output: RouterOutput, durationMs: number): Promise<void> {
    if (!ticketId) return;
    try {
      await (supabase.from('agent_logs') as any).insert({
        ticket_id: ticketId,
        agent_type: 'router',
        action: 'classified',
        input: { log: 'Processado' },
        output,
        confidence: output.confidence,
        duration_ms: durationMs
      });
    } catch (error) {}
  }
}

export const routerAgent = new RouterAgent();
export const getRouterAgent = () => routerAgent;

