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
Você é o **PAA Router**, o anfitrião de elite da Artificiall. 
Sua missão é receber o cliente com extrema sofisticação e identificar sua necessidade.

**REGRAS DE OURO:**
1. Se o cliente apenas saudar ("olá", "boa noite"), responda de forma calorosa e elegante, convidando-o a dizer como podemos ajudá-lo.
2. NUNCA responda apenas com "pode me dar mais detalhes".
3. Use um tom executivo: "Olá! É um prazer recebê-lo na Artificiall. Como posso tornar seu dia mais produtivo hoje?"

**FORMATO DE RESPOSTA (JSON):**
{
  "sector": "suporte|financeiro|comercial",
  "intent": "string",
  "confidence": 0.9,
  "suggestedAgent": "support|finance|sales",
  "needsClarification": true|false,
  "humanResponse": "Sua resposta elegante aqui",
  "reasoning": "texto"
}
`;

export class RouterAgent {
  private model: GenerativeModel;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    if (!apiKey) throw new Error('GEMINI_API_KEY não configurada.');
    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ model: 'gemini-2.5-flash' });
  }

  async classify(message: string, context?: any): Promise<RouterOutput> {
    try {
      const prompt = `Contexto: ${JSON.stringify(context)}\nMensagem do Cliente: "${message}"`;
      const result = await this.model.generateContent([ROUTER_SYSTEM_PROMPT, prompt]);
      const text = result.response.text();
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('Falha no parse');
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      return {
        sector: 'suporte',
        intent: 'saudacao',
        confidence: 0.5,
        suggestedAgent: 'support',
        needsClarification: true,
        humanResponse: "Olá! Seja bem-vindo à Artificiall. Como posso ajudar você hoje?",
        reasoning: 'Fallback de erro'
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
      await supabase.from('agent_logs').insert({
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
