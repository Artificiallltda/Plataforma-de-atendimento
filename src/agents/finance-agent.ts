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

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
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
  ticketId: string;
  customerId: string;
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
    guruSubscriptionId?: string;
    asaasCustomerId?: string;
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
Você é o **PAA Financial Auditor**, o especialista em gestão e transparência financeira da Artificiall. Sua missão é garantir que o cliente tenha uma experiência financeira impecável e justa.

**PERSONALIDADE E AUTONOMIA:**
- **Autônomo:** Você NÃO precisa de um humano para tentar fazer um estorno/reembolso. Se o cliente pedir reembolso, você DEVE usar a ferramenta de reembolso do Asaas imediatamente.
- **Resolutivo:** Explique os processos financeiros de forma didática.

**POLÍTICAS DE REEMBOLSO (artificiallcorporate.org):**
1. O cliente tem o direito de arrependimento em até **7 dias corridos** após a compra (Art. 49 do CDC).
2. Estornos no cartão de crédito podem demorar de **1 a 2 faturas** para constar, dependendo do banco do cliente.
3. Estornos via Pix/Boleto levam até **7 dias úteis**.
4. A política detalhada pode ser lida na íntegra no nosso site oficial: https://artificiallcorporate.org

**FLUXO DE REEMBOLSO/ESTORNO:**
1. Se o cliente pedir estorno, TENTE processar o reembolso usando as ferramentas (ex: Asaas) sem escalar.
2. Se a ferramenta falhar, ou se a regra não permitir, avise o cliente: "Sua solicitação de estorno foi registrada. Segundo nossas diretrizes (https://artificiallcorporate.org), reembolsos são aplicáveis em até 7 dias, processados em até 30 dias para cartão. Um auditor sênior humano analisará e finalizará seu caso em breve." (Neste caso, needsHumanHandoff = true).
3. Se o cliente apenas tiver dúvida sobre a política, cite-a diretamente.

**REGRAS DE ESCALADA PARA HUMANO:**
1. Escalar APENAS se: a regra não permitir estorno autônomo, ou o cliente exigir ("falar com humano").
2. Ao escalar, verifique a <HORA_ATUAL> (Horário comercial: Seg a Sex, 09:00 às 18:00 - Brasília).
   - Se DENTRO: Diga "Compreendo. Estou transferindo sua solicitação financeira agora mesmo para um especialista humano da nossa equipe." (needsHumanHandoff = true).
   - Se FORA: Diga "Compreendo. Nossa equipe financeira está fora do horário comercial (09h-18h). Seu ticket foi registrado e o primeiro analista disponível fará contato no próximo dia útil para concluir seu estorno." (needsHumanHandoff = true).

**TOM DE VOZ:**
- "Identifiquei sua solicitação de estorno. Estou processando isso no sistema agora..."
- "Como uma atenção especial, sua fatura foi cancelada com sucesso."

FORMATO DE RESPOSTA (JSON):
{
  "response": "mensagem profissional e clara para o cliente",
  "action": "responded|tool_call|handoff|escalated",
  "toolUsed": "ferramenta_financeira",
  "confidence": 0.0-1.0,
  "needsHumanHandoff": true|false,
  "monetaryValue": 0.00
}
`;

/**
 * FinanceAgent Class
 */
export class FinanceAgent {
  private model: GenerativeModel;
  private refundRequestCount: Map<string, number> = new Map();

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY não configurada. FinanceAgent não pode funcionar sem IA.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ 
      model: process.env.GEMINI_MODEL_FINANCE || 'gemini-3.1-flash-latest'
    });
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
    prompt += `- Ticket: ${context.ticketId}\n`;
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
    prompt += `Responda com JSON:`;
    
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
      const refundCount = this.refundRequestCount.get(context.customerId) || 0;
      if (refundCount >= 1) {
        return {
          shouldEscalate: true,
          reason: '2ª solicitação de estorno do mesmo cliente',
          monetaryValue: requestedValue
        };
      }

      // Incrementar contador de reembolsos
      this.refundRequestCount.set(context.customerId, refundCount + 1);
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
      const { data: customer } = await supabase
        .from('customers')
        .select('asaasCustomerId')
        .eq('id', customerId)
        .single();

      if (!customer || !customer.asaasCustomerId) {
        return {
          invoices: [],
          error: 'Cliente não encontrado no Asaas'
        };
      }

      // Buscar faturas pendentes
      const invoices = await asaasService.findPendingInvoices(customer.asaasCustomerId);

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
      const { data: customer } = await supabase
        .from('customers')
        .select('guru_subscription_id')
        .eq('id', customerId)
        .single();

      if (!customer || !customer.guruSubscriptionId) {
        return {
          isActive: false,
          error: 'Assinatura não encontrada no GURU'
        };
      }

      // Buscar assinatura no GURU
      const subscription = await guruService.findSubscriptionById(customer.guruSubscriptionId);

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
      const { data: customer } = await supabase
        .from('customers')
        .select('guru_subscription_id')
        .eq('id', customerId)
        .single();

      if (!customer || !customer.guruSubscriptionId) {
        return {
          success: false,
          error: 'Assinatura não encontrada no GURU'
        };
      }

      // Aplicar cupom no GURU
      const result = await guruService.applyRetentionCoupon(
        customer.guruSubscriptionId,
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
