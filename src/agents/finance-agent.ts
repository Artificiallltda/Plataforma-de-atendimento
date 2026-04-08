/**
 * FinanceAgent
 * 
 * Agente especializado em questões financeiras (cobranças, faturas, reembolsos, pagamentos).
 * Integra com Asaas (faturas, boletos, reembolsos) e GURU (assinaturas, cupons).
 * 
 * Modelo: Gemini 2.5 Flash (Jan 2026) - Velocidade para transações financeiras
 * 
 * @see docs/architecture/architecture.md#3-protocolo-de-handoff-entre-agentes
 */

import { getGeminiModel } from '../core/llm/factory';
import { supabase } from '../config/supabase';
import { asaasService } from '../integrations/asaas-service';
import { guruService } from '../integrations/guru-service';

export interface FinanceAgentOutput {
  response: string;           // Resposta para o cliente
  action: 'responded' | 'tool_call' | 'handoff' | 'escalated';
  toolUsed?: string;          // Ferramenta usada (se aplicável)
  confidence: number;         // 0.0 a 1.0
  needsHumanHandoff: boolean; // Precisa escalar para humano?
  escalationReason?: string;  // Motivo da escalada (se aplicável)
  monetaryValue?: number;     // Valor monetário envolvido (se aplicável)
}

export interface FinanceAgentContext {
  ticket_id: string;
  customer_id: string;
  sector: 'financeiro';
  intent: string;
  conversationHistory: Array<{
    sender: 'customer' | 'bot';
    body: string;
    timestamp: Date;
  }>;
  customerProfile: {
    id: string;
    name?: string;
    email?: string;
    phone?: string;
    plan?: 'basico' | 'premium' | 'enterprise';
    guru_subscription_id?: string;
    asaas_customer_id?: string;
  };
}

/**
 * Configurações de limites e regras de negócio
 */
export const FINANCE_CONFIG = {
  // Limite para reembolso autônomo (em reais)
  autonomousRefundLimit: 100.00,
  
  // Dias de garantia para reembolso automático
  guaranteeDays: 7,
  
  // Desconto máximo de cupom de retenção (percentual)
  maxRetentionDiscount: 30,
  
  // Duração máxima do cupom (meses)
  maxCouponDuration: 3
};

/**
 * System prompt do FinanceAgent
 */
const FINANCE_AGENT_SYSTEM_PROMPT = `
Você é o **PAA Finance Specialist**, o braço direito financeiro do cliente na Artificiall. 
Sua missão é resolver qualquer questão de pagamento de forma simples, fluida e sem burocracia.

**DIRETRIZES DE ATUAÇÃO:**
1. **Poder Total:** Você tem acesso ao Asaas e ao Guru. Se o cliente pergunta sobre um pagamento, sua primeira reação deve ser CONSULTAR o sistema, não fazer perguntas óbvias.
2. **Resolução Proativa:** Se identificar uma fatura atrasada, não espere o cliente pedir. Diga: "Notei que temos uma pendência aqui, vou te mandar o link atualizado agora para facilitar."
3. **Estornos sem Atrito:** Se o cliente tem direito a estorno (7 dias), processe-o imediatamente usando as ferramentas. Se não tem certeza, registre a intenção e avise que o auditor vai finalizar, mas mantenha a conversa leve.
4. **Sem Robôs:** Evite termos como "protocolo", "escalonamento" ou "transferência". Use: "Vou pedir para o meu colega do financeiro dar o OK final aqui para você".

**OBJETIVO:** 
O cliente deve sair da conversa sentindo que o financeiro da Artificiall é o mais eficiente que ele já viu.
`;

/**
 * FinanceAgent Class
 */
export class FinanceAgent {
  private model: any;
  private refundRequestCount: Map<string, number> = new Map();

  constructor() {
    this.model = getGeminiModel(process.env.GEMINI_MODEL_FINANCE || 'gemini-2.5-flash');
  }

  /**
   * Processar mensagem e gerar resposta
   */
  async processMessage(context: FinanceAgentContext): Promise<FinanceAgentOutput> {
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
      
      // Verificar gatilhos de escalada específicos do FinanceAgent
      const escalationCheck = await this.checkFinancialEscalation(context, lastMessage.body, parsed);
      
      if (escalationCheck.shouldEscalate) {
        return {
          response: this.getEscalationMessage(),
          action: 'escalated',
          confidence: 1.0,
          needsHumanHandoff: true,
          escalationReason: escalationCheck.reason,
          monetaryValue: escalationCheck.monetaryValue
        };
      }

      return parsed;
    } catch (error) {
      console.error('❌ Erro no FinanceAgent:', error);
      
      // Fallback: resposta genérica
      return {
        response: 'Entendi sua questão financeira. Vou verificar e já te retorno.',
        action: 'responded',
        confidence: 0.5,
        needsHumanHandoff: false
      };
    }
  }

  /**
   * Construir prompt para o modelo
   */
  private buildPrompt(context: FinanceAgentContext, message: string): string {
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    let prompt = FINANCE_AGENT_SYSTEM_PROMPT + '\n\n';
    
    prompt += `<HORA_ATUAL>: ${now}\n`;
    prompt += `CONTEXTO DO ATENDIMENTO:\n`;
    prompt += `- Ticket: ${context.ticket_id}\n`;
    prompt += `- Cliente: ${context.customerProfile.name || 'Não informado'}\n`;
    prompt += `- Plano: ${context.customerProfile.plan || 'Não informado'}\n`;
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
    prompt += `Responda EXCLUSIVAMENTE com um bloco JSON válido, sem texto antes ou depois:\n{\n  "response": "<sua resposta natural, empática e objetiva ao cliente>",\n  "action": "responded",\n  "confidence": <0.0 a 1.0>,\n  "needsHumanHandoff": false,\n  "escalationReason": null\n}`;
    
    return prompt;
  }

  /**
   * Parse da resposta do modelo
   */
  private parseResponse(responseText: string): FinanceAgentOutput {
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
        escalationReason: parsed.escalationReason,
        monetaryValue: parsed.monetaryValue
      };
    } catch (error) {
      console.warn('⚠️ Falha ao parsear JSON do FinanceAgent');
      return {
        response: responseText,
        action: 'responded',
        confidence: 0.5,
        needsHumanHandoff: false
      };
    }
  }

  /**
   * Verificar gatilhos de escalada específicos do FinanceAgent
   */
  private async checkFinancialEscalation(
    context: FinanceAgentContext,
    message: string,
    parsed: FinanceAgentOutput
  ): Promise<{
    shouldEscalate: boolean;
    reason?: string;
    monetaryValue?: number;
  }> {
    const lowerMessage = message.toLowerCase();

    // 1. Verificar solicitação de reembolso
    if (lowerMessage.includes('reembolso') || lowerMessage.includes('estorno') || lowerMessage.includes('devolver')) {
      // Extrair valor da mensagem (regex simples)
      const valueMatch = message.match(/R\$\s?(\d+([.,]\d{1,2})?)/);
      const requestedValue = valueMatch ? parseFloat(valueMatch[1].replace(',', '.')) : 0;

      // Verificar limite de reembolso autônomo
      if (requestedValue > FINANCE_CONFIG.autonomousRefundLimit) {
        return {
          shouldEscalate: true,
          reason: `Reembolso de R$ ${requestedValue.toFixed(2)} excede limite de R$ ${FINANCE_CONFIG.autonomousRefundLimit.toFixed(2)}`,
          monetaryValue: requestedValue
        };
      }

      // Verificar se é 2ª solicitação de estorno
      const refundCount = this.refundRequestCount.get(context.customer_id) || 0;
      if (refundCount >= 1) {
        return {
          shouldEscalate: true,
          reason: '2ª solicitação de estorno do mesmo cliente',
          monetaryValue: requestedValue
        };
      }

      // Incrementar contador de reembolsos
      this.refundRequestCount.set(context.customer_id, refundCount + 1);
    }

    // 2. Verificar palavras-chave de crise financeira
    const crisisKeywords = ['processar', 'advogado', 'procon', 'juizado', 'cancelar cartão'];
    const hasCrisisKeywords = crisisKeywords.some(keyword => lowerMessage.includes(keyword));
    
    if (hasCrisisKeywords) {
      return {
        shouldEscalate: true,
        reason: 'Cliente mencionou ações legais/crise'
      };
    }

    return { shouldEscalate: false };
  }

  /**
   * Mensagem de escalada
   */
  private getEscalationMessage(): string {
    const messages = [
      'Entendi sua solicitação. Vou transferir você para um de nossos especialistas financeiros que poderá analisar seu caso com mais detalhes.',
      'Compreendo perfeitamente. Para resolver isso da melhor forma, vou acionar nosso time financeiro agora mesmo.',
      'Sinto muito pelo ocorrido. Vou transferir você para um especialista que vai resolver isso com prioridade.'
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  /**
   * Ferramenta: getInvoice
   * 
   * Busca faturas do cliente no Asaas
   */
  async getInvoice(customerId: string): Promise<{
    invoices: Array<{
      id: string;
      value: number;
      status: 'PENDING' | 'RECEIVED' | 'OVERDUE' | 'REFUNDED' | 'CANCELLED';
      dueDate: Date;
      invoiceUrl?: string;
    }>;
    error?: string;
  }> {
    try {
      // Buscar dados do cliente para obter asaasCustomerId
      const { data: customer } = await (supabase
        .from('customers') as any)
        .select('asaas_customer_id')
        .eq('id', customerId)
        .single();

      if (!customer || !(customer as any).asaas_customer_id) {
        return {
          invoices: [],
          error: 'Cliente não encontrado no Asaas'
        };
      }

      // Buscar faturas pendentes
      const invoices = await asaasService.findPendingInvoices((customer as any).asaas_customer_id);

      return {
        invoices: invoices.map(inv => ({
          id: inv.id,
          value: inv.value,
          status: inv.status,
          dueDate: inv.dueDate,
          invoiceUrl: inv.invoiceUrl
        }))
      };
    } catch (error) {
      console.error('❌ Erro em getInvoice:', error);
      return {
        invoices: [],
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Ferramenta: resendBoleto
   * 
   * Reenvia boleto/Pix para o cliente
   */
  async resendBoleto(invoiceId: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    try {
      const result = await asaasService.resendInvoice(invoiceId);
      return result;
    } catch (error) {
      console.error('❌ Erro em resendBoleto:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Ferramenta: processRefund
   * 
   * Processa reembolso/estorno
   */
  async processRefund(
    invoiceId: string,
    amount: number,
    reason: string
  ): Promise<{
    success: boolean;
    error?: string;
    requiresApproval?: boolean;
  }> {
    try {
      // Verificar limite de reembolso autônomo
      if (amount > FINANCE_CONFIG.autonomousRefundLimit) {
        return {
          success: false,
          requiresApproval: true,
          error: `Reembolso de R$ ${amount.toFixed(2)} excede limite de R$ ${FINANCE_CONFIG.autonomousRefundLimit.toFixed(2)} e requer aprovação`
        };
      }

      // Processar reembolso no Asaas
      const result = await asaasService.processRefund(invoiceId, amount, reason);
      return result;
    } catch (error) {
      console.error('❌ Erro em processRefund:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Ferramenta: checkSubscription
   * 
   * Verifica assinatura do cliente no GURU
   */
  async checkSubscription(customerId: string): Promise<{
    isActive: boolean;
    plan?: string;
    expiresAt?: Date;
    status?: string;
    error?: string;
  }> {
    try {
      // Buscar dados do cliente para obter guruSubscriptionId
      const { data: customer } = await (supabase
        .from('customers') as any)
        .select('guru_subscription_id')
        .eq('id', customerId)
        .single();

      if (!customer || !(customer as any).guru_subscription_id) {
        return {
          isActive: false,
          error: 'Assinatura não encontrada no GURU'
        };
      }

      // Buscar assinatura no GURU
      const subscription = await guruService.findSubscriptionById((customer as any).guru_subscription_id);

      if (!subscription) {
        return {
          isActive: false,
          error: 'Assinatura não encontrada'
        };
      }

      return {
        isActive: subscription.status === 'ativo',
        plan: subscription.plan?.name,
        expiresAt: subscription.expiresAt,
        status: subscription.status
      };
    } catch (error) {
      console.error('❌ Erro em checkSubscription:', error);
      return {
        isActive: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Ferramenta: applyRetentionCoupon
   * 
   * Aplica cupom de desconto para retenção de clientes
   */
  async applyRetentionCoupon(
    customerId: string,
    discountPercent: number,
    months: number = FINANCE_CONFIG.maxCouponDuration
  ): Promise<{
    success: boolean;
    error?: string;
    appliedDiscount?: number;
    appliedMonths?: number;
  }> {
    try {
      // Validar limites de desconto
      if (discountPercent > FINANCE_CONFIG.maxRetentionDiscount) {
        return {
          success: false,
          error: `Desconto de ${discountPercent}% excede limite máximo de ${FINANCE_CONFIG.maxRetentionDiscount}%`
        };
      }

      if (months > FINANCE_CONFIG.maxCouponDuration) {
        return {
          success: false,
          error: `Duração de ${months} meses excede limite máximo de ${FINANCE_CONFIG.maxCouponDuration} meses`
        };
      }

      // Buscar dados do cliente para obter guruSubscriptionId
      const { data: customer } = await (supabase
        .from('customers') as any)
        .select('guru_subscription_id')
        .eq('id', customerId)
        .single();

      if (!customer || !(customer as any).guru_subscription_id) {
        return {
          success: false,
          error: 'Assinatura não encontrada no GURU'
        };
      }

      // Aplicar cupom no GURU
      const result = await guruService.applyRetentionCoupon(
        (customer as any).guru_subscription_id,
        discountPercent,
        months
      );

      return {
        success: result.success,
        appliedDiscount: discountPercent,
        appliedMonths: months
      };
    } catch (error) {
      console.error('❌ Erro em applyRetentionCoupon:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Resetar contador de reembolsos (após resolução)
   */
  resetRefundCount(customerId: string): void {
    this.refundRequestCount.delete(customerId);
  }
}

// Singleton
let financeAgentInstance: FinanceAgent | null = null;

export function getFinanceAgent(): FinanceAgent {
  if (!financeAgentInstance) {
    financeAgentInstance = new FinanceAgent();
  }
  return financeAgentInstance;
}

export const financeAgent = getFinanceAgent();

export default financeAgent;
