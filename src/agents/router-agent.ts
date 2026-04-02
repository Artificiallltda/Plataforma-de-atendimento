/**
 * RouterAgent
 * 
 * Orquestrador central do sistema multi-agentes (MAS).
 * Classifica intenção do cliente e roteia para agente especializado.
 * 
 * Modelo: Gemini 2.5 Flash (Jan 2026) - Latência < 500ms
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { supabase } from '../config/supabase';

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
Você é o **PAA Router**, a inteligência de triagem estratégica da Artificiall. Você é o primeiro contato do cliente e sua missão é garantir uma recepção de elite.

**PERSONALIDADE:**
- Sofisticado, ágil e extremamente educado.
- Você é o anfitrião que abre as portas e direciona o cliente para o especialista correto.

SUA FUNÇÃO:
1. Classificar a intenção do cliente com precisão cirúrgica.
2. Identificar a intenção específica (ex: "erro_de_acesso", "reembolso", "upgrade_plano")
3. Se a confiança for < 0.75, você deve ser gentil e pedir mais detalhes.

SETORES: suporte, financeiro, comercial.

FORMATO DE RESPOSTA (JSON):
{
  "sector": "suporte|financeiro|comercial",
  "intent": "descricao_em_snake_case",
  "confidence": 0.0-1.0,
  "suggestedAgent": "support|finance|sales",
  "needsClarification": true|false,
  "reasoning": "explicacao"
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
    const prompt = `Contexto do Cliente: ${JSON.stringify(context)}\nMensagem: ${message}`;
    const result = await this.model.generateContent([ROUTER_SYSTEM_PROMPT, prompt]);
    const response = result.response.text();
    return JSON.parse(response.replace(/```json|```/g, '').trim());
  }

  async getCustomerContext(customerId: string): Promise<CustomerContext | null> {
    try {
      // 1. Buscar dados do cliente (SNAKE_CASE)
      const { data: customer } = await supabase
        .from('customers')
        .select('id, name, guru_subscription_id')
        .eq('id', customerId)
        .single();

      if (!customer) return null;

      // 2. Buscar tickets recentes (CORREÇÃO AQUI: customer_id)
      const { data: tickets } = await supabase
        .from('tickets')
        .select('id, sector, intent, status, csat_score')
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
      console.error('❌ Erro ao buscar contexto do cliente:', error);
      return null;
    }
  }

  async logDecision(ticketId: string, output: RouterOutput, durationMs: number): Promise<void> {
    try {
      await supabase.from('agent_logs').insert({
        ticket_id: ticketId,
        agent_type: 'router',
        action: 'classified',
        input: { message: '...' },
        output,
        confidence: output.confidence,
        duration_ms: durationMs
      });
    } catch (error) {}
  }
}

export const routerAgent = new RouterAgent();
export const getRouterAgent = () => routerAgent;
