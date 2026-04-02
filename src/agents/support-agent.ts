/**
 * SupportAgent
 * 
 * Agente especializado em suporte técnico.
 * Resolve problemas de acesso, bugs, dúvidas de uso e erros do sistema.
 * 
 * Modelo: Gemini 3.1 Pro (Fev 2026) - Melhor precisão para problemas técnicos complexos
 * 
 * @see docs/architecture/architecture.md#3-protocolo-de-handoff-entre-agentes
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { supabase } from '../config/supabase';
import { guruService } from '../integrations/guru-service';
import { asaasService } from '../integrations/asaas-service';

export interface SupportAgentOutput {
  response: string;           // Resposta para o cliente
  action: 'responded' | 'tool_call' | 'handoff' | 'escalated';
  toolUsed?: string;          // Ferramenta usada (se aplicável)
  confidence: number;         // 0.0 a 1.0
  needsHumanHandoff: boolean; // Precisa escalar para humano?
  escalationReason?: string;  // Motivo da escalada (se aplicável)
}

export interface SupportAgentContext {
  ticketId: string;
  customerId: string;
  sector: 'suporte';
  intent: string;
  conversationHistory: Array<{
    sender: 'customer' | 'bot';
    body: string;
    timestamp: Date;
  }>;
  customerProfile: {
    id: string;
    name?: string;
    plan?: 'basico' | 'premium' | 'enterprise';
    isActive: boolean;
    guruSubscriptionId?: string;
    asaasCustomerId?: string;
  };
}

/**
 * System prompt do SupportAgent
 */
const SUPPORT_AGENT_SYSTEM_PROMPT = `
Você é o **PAA Tech Guide**, o guia especializado da Artificiall. 
Sua missão é resolver problemas técnicos com clareza, empatia e agilidade.

**DIRETRIZES DE GUIA:**
1. **Linguagem Simples:** Não use termos técnicos excessivos. Explique o "porquê" e o "como" de forma amigável.
2. **Resolução Autônoma:** Tente todas as ferramentas e dicas de uso antes de passar para um humano. Você é capaz de resolver 90% dos casos.
3. **Empatia Real:** Se o cliente está frustrado, reconheça isso: "Entendo como isso atrapalha seu dia, vamos resolver agora."
4. **Sem Robôs:** Evite "transferindo seu ticket". Use: "Vou pedir para o meu colega da engenharia olhar isso comigo se a gente não conseguir resolver agora."

**OBJETIVO:** 
O cliente deve sentir que tem um especialista sênior dedicado a ele, não que está em uma fila de suporte.
`;

/**
 * SupportAgent Class
 */
export class SupportAgent {
  private model: GenerativeModel;
  private retryCount: Map<string, number> = new Map();

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY não configurada. SupportAgent não pode funcionar sem IA.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ 
      model: process.env.GEMINI_MODEL_SUPPORT || 'gemini-3.1-pro-preview'
    });
  }

  /**
   * Processar mensagem e gerar resposta
   */
  async processMessage(context: SupportAgentContext): Promise<SupportAgentOutput> {
    const lastMessage = context.conversationHistory[context.conversationHistory.length - 1];
    
    if (!lastMessage || lastMessage.sender !== 'customer') {
      return {
        response: '',
        action: 'responded',
        confidence: 0,
        needsHumanHandoff: false
      };
    }

    try {
      // Construir contexto para o modelo
      const prompt = this.buildPrompt(context, lastMessage.body);
      
      // Chamar Gemini
      const result = await this.model.generateContent(prompt);
      const responseText = result.response.text();
      
      // Parse do JSON response
      const parsed = this.parseResponse(responseText);
      
      // Verificar gatilhos de escalada
      if (this.shouldEscalate(context, lastMessage.body)) {
        return {
          response: this.getEscalationMessage(),
          action: 'escalated',
          confidence: 1.0,
          needsHumanHandoff: true,
          escalationReason: this.getEscalationReason(context, lastMessage.body)
        };
      }

      // Verificar retry count
      const retries = this.retryCount.get(context.ticketId) || 0;
      if (retries >= 3) {
        return {
          response: 'Vou transferir você para um de nossos especialistas humanos que poderá ajudar melhor.',
          action: 'escalated',
          confidence: 1.0,
          needsHumanHandoff: true,
          escalationReason: 'Múltiplas tentativas sem sucesso'
        };
      }

      return parsed;
    } catch (error) {
      console.error('❌ Erro no SupportAgent:', error);
      
      // Fallback: resposta genérica
      return {
        response: 'Entendi seu problema. Vou verificar o que está acontecendo e já te retorno.',
        action: 'responded',
        confidence: 0.5,
        needsHumanHandoff: false
      };
    }
  }

  /**
   * Construir prompt para o modelo
   */
  private buildPrompt(context: SupportAgentContext, message: string): string {
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    let prompt = SUPPORT_AGENT_SYSTEM_PROMPT + '\n\n';
    
    prompt += `<HORA_ATUAL>: ${now}\n`;
    prompt += `CONTEXTO DO ATENDIMENTO:\n`;
    prompt += `- Ticket: ${context.ticketId}\n`;
    prompt += `- Cliente: ${context.customerProfile.name || 'Não informado'}\n`;
    prompt += `- Plano: ${context.customerProfile.plan || 'Não informado'}\n`;
    prompt += `- Status: ${context.customerProfile.isActive ? 'Ativo' : 'Inativo'}\n`;
    prompt += `- Intenção: ${context.intent}\n\n`;

    // Histórico da conversa (últimas 5 mensagens)
    const recentHistory = context.conversationHistory.slice(-5);
    if (recentHistory.length > 0) {
      prompt += `HISTÓRICO DA CONVERSA:\n`;
      recentHistory.forEach(msg => {
        prompt += `[${msg.sender === 'customer' ? 'Cliente' : 'Bot'}]: ${msg.body}\n`;
      });
      prompt += '\n';
    }

    prompt += `MENSAGEM ATUAL DO CLIENTE: "${message}"\n\n`;
    prompt += `Responda EXCLUSIVAMENTE com um bloco JSON válido, sem texto antes ou depois:\n{\n  "response": "<sua resposta técnica, empática e clara ao cliente>",\n  "action": "responded",\n  "confidence": <0.0 a 1.0>,\n  "needsHumanHandoff": false,\n  "escalationReason": null\n}`;
    
    return prompt;
  }

  /**
   * Parse da resposta do modelo
   */
  private parseResponse(responseText: string): SupportAgentOutput {
    try {
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : responseText;
      const parsed = JSON.parse(jsonString);

      return {
        response: parsed.response || '',
        action: parsed.action || 'responded',
        toolUsed: parsed.toolUsed,
        confidence: parsed.confidence || 0.5,
        needsHumanHandoff: parsed.needsHumanHandoff || false,
        escalationReason: parsed.escalationReason
      };
    } catch (error) {
      console.warn('⚠️ Falha ao parsear JSON do SupportAgent');
      return {
        response: responseText,
        action: 'responded',
        confidence: 0.5,
        needsHumanHandoff: false
      };
    }
  }

  /**
   * Verificar gatilhos de escalada
   */
  private shouldEscalate(context: SupportAgentContext, message: string): boolean {
    const lowerMessage = message.toLowerCase();
    
    // Palavras-chave de crise
    const crisisKeywords = ['absurdo', 'cancelar', 'procon', 'juizado', 'advogado', 'vergonha', 'enganado'];
    const hasCrisisKeywords = crisisKeywords.some(keyword => lowerMessage.includes(keyword));
    
    // Cliente Enterprise
    const isEnterprise = context.customerProfile.plan === 'enterprise';
    
    // Cliente inativo/inadimplente
    const isInactive = !context.customerProfile.isActive;

    // Se tem crise + enterprise → escala imediata
    if (hasCrisisKeywords && isEnterprise) {
      return true;
    }

    return false;
  }

  /**
   * Obter motivo da escalada
   */
  private getEscalationReason(context: SupportAgentContext, message: string): string {
    const lowerMessage = message.toLowerCase();
    
    if (lowerMessage.includes('cancelar')) {
      return 'Cliente solicitou cancelamento';
    }
    if (lowerMessage.includes('procon') || lowerMessage.includes('advogado')) {
      return 'Cliente mencionou ações legais';
    }
    if (context.customerProfile.plan === 'enterprise') {
      return 'Cliente Enterprise - prioridade máxima';
    }
    
    return 'Escalado pelo SupportAgent';
  }

  /**
   * Mensagem de escalada
   */
  private getEscalationMessage(): string {
    const messages = [
      'Entendi sua insatisfação e lamento pela experiência. Vou transferir você imediatamente para um de nossos supervisores que poderá ajudar melhor.',
      'Compreendo perfeitamente. Para resolver isso da melhor forma, vou acionar nosso time de atendimento especializado agora mesmo.',
      'Sinto muito pelo ocorrido. Vou transferir você para um especialista humano que vai resolver isso com prioridade.'
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  /**
   * Ferramenta: checkUserStatus
   */
  async checkUserStatus(customerId: string): Promise<{
    isActive: boolean;
    plan: 'basico' | 'premium' | 'enterprise';
    expiresAt?: Date;
    hasAccess: boolean;
    guruData?: any;
    asaasData?: any;
  }> {
    try {
      // Buscar dados do cliente no Supabase
      const { data: customer } = await supabase
        .from('customers')
        .select('guru_subscription_id, asaas_customer_id')
        .eq('id', customerId)
        .single();

      if (!customer) {
        return { isActive: false, plan: 'basico', hasAccess: false };
      }

      // Buscar no GURU
      let guruData = null;
      if (customer.guruSubscriptionId) {
        guruData = await guruService.findSubscriptionById(customer.guruSubscriptionId);
      }

      // Buscar no Asaas
      let asaasData = null;
      if (customer.asaasCustomerId) {
        const invoices = await asaasService.findPendingInvoices(customer.asaasCustomerId);
        asaasData = { hasPendingInvoices: invoices.length > 0 };
      }

      const isActive = guruData?.status === 'ativo' || (!asaasData?.hasPendingInvoices);
      const plan = this.mapPlan(guruData?.plan?.type);

      return {
        isActive,
        plan,
        expiresAt: guruData?.expiresAt,
        hasAccess: isActive,
        guruData,
        asaasData
      };
    } catch (error) {
      console.error('❌ Erro ao verificar status do usuário:', error);
      return { isActive: false, plan: 'basico', hasAccess: false };
    }
  }

  /**
   * Mapear tipo de plano
   */
  private mapPlan(planType?: string): 'basico' | 'premium' | 'enterprise' {
    const mapping: Record<string, 'basico' | 'premium' | 'enterprise'> = {
      'basic': 'basico',
      'basico': 'basico',
      'premium': 'premium',
      'enterprise': 'enterprise',
      'corp': 'enterprise'
    };
    return mapping[planType?.toLowerCase()] || 'basico';
  }

  /**
   * Incrementar retry count
   */
  incrementRetryCount(ticketId: string): void {
    const current = this.retryCount.get(ticketId) || 0;
    this.retryCount.set(ticketId, current + 1);
  }

  /**
   * Resetar retry count
   */
  resetRetryCount(ticketId: string): void {
    this.retryCount.delete(ticketId);
  }
}

// Singleton
let supportAgentInstance: SupportAgent | null = null;

export function getSupportAgent(): SupportAgent {
  if (!supportAgentInstance) {
    supportAgentInstance = new SupportAgent();
  }
  return supportAgentInstance;
}

export const supportAgent = getSupportAgent();

export default supportAgent;
