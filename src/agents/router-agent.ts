/**
 * RouterAgent
 * 
 * Orquestrador central do sistema multi-agentes (MAS).
 * Classifica intenção do cliente e roteia para agente especializado.
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
}

export interface CustomerContext {
  id: string;
  name?: string;
  plan?: 'basico' | 'premium' | 'enterprise';
  activeTicketId?: string;
  recentTickets: any[];
}

const ROUTER_SYSTEM_PROMPT = `
Você é o PAA Router da Artificiall.
Responda EXCLUSIVAMENTE em formato JSON.

{
  "sector": "suporte|financeiro|comercial",
  "intent": "string_snake_case",
  "confidence": 0.9,
  "suggestedAgent": "support|finance|sales",
  "needsClarification": false,
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

  async classify(message: string, context?: CustomerContext): Promise<RouterOutput> {
    try {
      const prompt = `Contexto: ${JSON.stringify(context)}\nMensagem: ${message}`;
      const result = await this.model.generateContent([ROUTER_SYSTEM_PROMPT, prompt]);
      const text = result.response.text();
      
      // Limpeza de JSON robusta
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('IA não retornou JSON válido');
      
      return JSON.parse(jsonMatch[0]);
    } catch (error) {
      console.error('❌ Erro ao classificar:', error);
      // Fallback seguro para não crashar
      return {
        sector: 'suporte',
        intent: 'erro_classificacao',
        confidence: 0.5,
        suggestedAgent: 'support',
        needsClarification: true,
        reasoning: 'Erro no parse de IA'
      };
    }
  }

  async getCustomerContext(customerId: string): Promise<CustomerContext | null> {
    try {
      const { data: customer } = await supabase
        .from('customers')
        .select('*')
        .eq('id', customerId)
        .single();

      if (!customer) return null;

      const { data: tickets } = await supabase
        .from('tickets')
        .select('*')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(5);

      const activeTicket = tickets?.find(t => t.status !== 'resolvido');

      return {
        id: customer.id,
        name: customer.name || undefined,
        plan: customer.guru_subscription_id ? 'premium' : 'basico',
        activeTicketId: activeTicket?.id,
        recentTickets: tickets || []
      };
    } catch (error) {
      return null;
    }
  }

  async logDecision(ticketId: string, output: RouterOutput, durationMs: number): Promise<void> {
    if (!ticketId || ticketId === '') return;
    try {
      await supabase.from('agent_logs').insert({
        ticket_id: ticketId,
        agent_type: 'router',
        action: 'classified',
        input: { log: 'IA processada' },
        output,
        confidence: output.confidence,
        duration_ms: durationMs
      });
    } catch (error) {}
  }
}

export const routerAgent = new RouterAgent();
export const getRouterAgent = () => routerAgent;
