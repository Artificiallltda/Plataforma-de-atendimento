/**
 * SalesAgent
 * 
 * Agente especializado em vendas e qualificação de leads.
 * Integra com GURU (checkout, planos) e Supabase (CRM, leads).
 * 
 * Modelo: Gemini 3.1 Pro (Fev 2026) - Mais contexto para negociação
 * 
 * @see docs/architecture/architecture.md#3-protocolo-de-handoff-entre-agentes
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { supabase } from '../config/supabase';
import { guruService } from '../integrations/guru-service';

export type LeadProfile = 'basico' | 'premium' | 'enterprise' | 'unknown';

export interface SalesAgentOutput {
  response: string;           // Resposta para o cliente
  action: 'responded' | 'tool_call' | 'handoff' | 'escalated';
  toolUsed?: string;          // Ferramenta usada (se aplicável)
  confidence: number;         // 0.0 a 1.0
  needsHumanHandoff: boolean; // Precisa escalar para humano?
  escalationReason?: string;  // Motivo da escalada (se aplicável)
  leadProfile?: LeadProfile;  // Perfil qualificado do lead
  potentialValue?: number;    // Valor potencial do lead (R$)
}

export interface SalesAgentContext {
  ticketId: string;
  customerId: string;
  sector: 'comercial';
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
    company?: string;
    cnpj?: string;
    employeeCount?: number;
  };
}

/**
 * Planos disponíveis
 */
export const PLANS = {
  basico: {
    id: 'plan_basic',
    name: 'Básico',
    price: 49.90,
    users: 5,
    features: ['5 usuários', '10GB armazenamento', 'Suporte por email', 'Relatórios básicos']
  },
  premium: {
    id: 'plan_premium',
    name: 'Premium',
    price: 99.90,
    users: 10,
    features: ['10 usuários', '100GB armazenamento', 'Suporte prioritário', 'Relatórios avançados', 'API access']
  },
  enterprise: {
    id: 'plan_enterprise',
    name: 'Enterprise',
    price: 249.90,
    users: -1, // Ilimitado
    features: ['Usuários ilimitados', 'Armazenamento ilimitado', 'Suporte 24/7', 'Customizações', 'SLA garantido', 'Gerente de conta']
  }
};

/**
 * Configurações de qualificação e escalada
 */
export const SALES_CONFIG = {
  // Número de usuários para classificar como Enterprise
  enterpriseUserThreshold: 10,
  
  // Número máximo de interações antes de escalar
  maxInteractionsWithoutConversion: 3,
  
  // Valor potencial por perfil (R$)
  potentialValue: {
    basico: 49.90,
    premium: 99.90,
    enterprise: 249.90
  }
};

/**
 * System prompt do SalesAgent
 */
const SALES_AGENT_SYSTEM_PROMPT = `
Você é o **PAA Sales Executive**, o consultor de vendas de elite da Artificiall. 
Sua missão é encantar o cliente, apresentar nossas soluções de IA e fechar negócio de forma fluida.

**DIRETRIZES DE VENDA ELITE:**
1. **Foco no Valor:** Não apenas mande preços. Entenda o que o cliente quer (vídeos, imagens, relatórios) e mostre como a Artificiall resolve isso.
2. **Fluidez Total:** Se o cliente perguntar o preço, mande os links de checkout e explique os benefícios. Use o tom de um consultor, não de um robô de vendas.
3. **Links Diretos:** Use https://artificiallcorporate.org como nosso portal oficial para assinaturas.
4. **Respeito ao Cliente (TRANSBORDO):** Se o cliente pedir para falar com um humano, atendente, especialista ou demonstrar frustração com a IA, você DEVE concordar imediatamente e acionar o transbordo definindo "needsHumanHandoff" como true. Não tente "vencer" o cliente nesse ponto.

**OBJETIVO:** 
O cliente deve terminar a conversa sentindo que a Artificiall é a parceira ideal. Seja solícito e nunca obstrutivo.
`;

/**
 * SalesAgent Class
 */
export class SalesAgent {
  private model: GenerativeModel;
  private interactionCount: Map<string, number> = new Map();

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY não configurada. SalesAgent não pode funcionar sem IA.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ 
      model: process.env.GEMINI_MODEL_SALES || 'gemini-3.1-pro-preview'
    });
  }

  /**
   * Processar mensagem e gerar resposta
   */
  async processMessage(context: SalesAgentContext): Promise<SalesAgentOutput> {
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
      
      // Qualificar lead baseado no contexto
      const leadProfile = await this.qualifyLead(context);
      parsed.leadProfile = leadProfile.profile;
      parsed.potentialValue = leadProfile.potentialValue;
      
      // Verificar gatilhos de escalada
      const escalationCheck = await this.checkSalesEscalation(context, parsed);
      
      if (escalationCheck.shouldEscalate) {
        return {
          response: this.getEscalationMessage(),
          action: 'escalated',
          confidence: 1.0,
          needsHumanHandoff: true,
          escalationReason: escalationCheck.reason,
          leadProfile: parsed.leadProfile,
          potentialValue: parsed.potentialValue
        };
      }

      // Incrementar contador de interações
      this.incrementInteractionCount(context.customerId);

      return parsed;
    } catch (error) {
      console.error('❌ Erro no SalesAgent:', error);
      
      // Fallback: resposta genérica
      return {
        response: 'Entendi seu interesse! Vou te ajudar a encontrar o melhor plano. Um momento.',
        action: 'responded',
        confidence: 0.5,
        needsHumanHandoff: false
      };
    }
  }

  /**
   * Construir prompt para o modelo
   */
  private buildPrompt(context: SalesAgentContext, message: string): string {
    const now = new Date().toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    let prompt = SALES_AGENT_SYSTEM_PROMPT + '\n\n';

    prompt += `<HORA_ATUAL>: ${now}\n`;
    prompt += `CONTEXTO DO LEAD:\n`;

    prompt += `- Ticket: ${context.ticketId}\n`;
    prompt += `- Lead: ${context.customerProfile.name || 'Não informado'}\n`;
    prompt += `- Email: ${context.customerProfile.email || 'Não informado'}\n`;
    prompt += `- Telefone: ${context.customerProfile.phone || 'Não informado'}\n`;
    prompt += `- Empresa: ${context.customerProfile.company || 'Não informado'}\n`;
    prompt += `- Funcionários: ${context.customerProfile.employeeCount || 'Não informado'}\n`;
    prompt += `- Intenção: ${context.intent}\n\n`;

    // Histórico da conversa (últimas 5 mensagens)
    const recentHistory = context.conversationHistory.slice(-5);
    if (recentHistory.length > 0) {
      prompt += `HISTÓRICO DA CONVERSA:\n`;
      recentHistory.forEach(msg => {
        prompt += `[${msg.sender === 'customer' ? 'Lead' : 'Bot'}]: ${msg.body}\n`;
      });
      prompt += '\n';
    }

    prompt += `MENSAGEM ATUAL DO LEAD: "${message}"\n\n`;
    prompt += `Responda EXCLUSIVAMENTE com um bloco JSON válido, sem texto antes ou depois:\n{\n  "response": "<sua resposta como consultor de vendas — empática, persuasiva e com valor agregado>",\n  "action": "responded",\n  "confidence": <0.0 a 1.0>,\n  "needsHumanHandoff": false,\n  "escalationReason": null,\n  "leadProfile": "basico" | "premium" | "enterprise" | "unknown"\n}`;
    
    return prompt;
  }

  /**
   * Parse da resposta do modelo
   */
  private parseResponse(responseText: string): SalesAgentOutput {
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
        leadProfile: parsed.leadProfile,
        potentialValue: parsed.potentialValue
      };
    } catch (error) {
      console.warn('⚠️ Falha ao parsear JSON do SalesAgent');
      return {
        response: responseText,
        action: 'responded',
        confidence: 0.5,
        needsHumanHandoff: false
      };
    }
  }

  /**
   * Qualificar lead baseado no perfil
   */
  private async qualifyLead(context: SalesAgentContext): Promise<{
    profile: LeadProfile;
    potentialValue?: number;
  }> {
    const { customerProfile } = context;
    
    // Verificar se é Enterprise
    if (customerProfile.cnpj || (customerProfile.employeeCount && customerProfile.employeeCount > SALES_CONFIG.enterpriseUserThreshold)) {
      return {
        profile: 'enterprise',
        potentialValue: SALES_CONFIG.potentialValue.enterprise
      };
    }

    // Verificar se é Premium (pessoa jurídica)
    if (customerProfile.company) {
      return {
        profile: 'premium',
        potentialValue: SALES_CONFIG.potentialValue.premium
      };
    }

    // Padrão: Básico
    return {
      profile: 'basico',
      potentialValue: SALES_CONFIG.potentialValue.basico
    };
  }

  /**
   * Verificar gatilhos de escalada
   */
  private async checkSalesEscalation(
    context: SalesAgentContext,
    parsed: SalesAgentOutput
  ): Promise<{
    shouldEscalate: boolean;
    reason?: string;
  }> {
    const { customerProfile } = context;

    // 1. Lead Enterprise (CNPJ ou > 10 funcionários)
    if (customerProfile.cnpj || (customerProfile.employeeCount && customerProfile.employeeCount > SALES_CONFIG.enterpriseUserThreshold)) {
      return {
        shouldEscalate: true,
        reason: 'Lead Enterprise - CNPJ ou > 10 funcionários'
      };
    }

    // 2. 3+ interações sem conversão
    const interactionCount = this.interactionCount.get(context.customerId) || 0;
    if (interactionCount >= SALES_CONFIG.maxInteractionsWithoutConversion) {
      return {
        shouldEscalate: true,
        reason: `Lead retornou ${interactionCount} vezes sem converter - precisa de abordagem personalizada`
      };
    }

    // 3. Gatilhos de Transbordo (Humano)
    const lastMessage = context.conversationHistory[context.conversationHistory.length - 1]?.body.toLowerCase() || '';
    const handoffKeywords = ['humano', 'atendente', 'pessoa', 'especialista', 'falar com alguém', 'transferir', 'atendimento real'];
    const seeksHuman = handoffKeywords.some(keyword => lastMessage.includes(keyword));
    
    if (seeksHuman || (parsed.needsHumanHandoff)) {
      return {
        shouldEscalate: true,
        reason: 'Solicitação explícita de transbordo humano ou detecção de necessidade pelo modelo'
      };
    }

    // 4. Recursos customizados
    const customKeywords = ['personalizado', 'customizado', 'integração específica', 'api customizada', 'desenvolvimento'];
    const hasCustomRequest = customKeywords.some(keyword => lastMessage.includes(keyword));
    
    if (hasCustomRequest) {
      return {
        shouldEscalate: true,
        reason: 'Lead solicitou recurso customizado - fora do escopo padrão'
      };
    }

    return { shouldEscalate: false };
  }

  /**
   * Mensagem de escalada
   */
  private getEscalationMessage(): string {
    const messages = [
      'Entendi perfeitamente! Vou transferir você para um de nossos especialistas em vendas que poderá te atender com mais detalhes.',
      'Compreendo! Para te oferecer a melhor solução, vou acionar nosso time comercial agora mesmo.',
      'Ótimo! Um de nossos consultores especializados irá te atender em instantes para personalizar sua proposta.'
    ];
    return messages[Math.floor(Math.random() * messages.length)];
  }

  /**
   * Incrementar contador de interações
   */
  private incrementInteractionCount(customerId: string): void {
    const current = this.interactionCount.get(customerId) || 0;
    this.interactionCount.set(customerId, current + 1);
  }

  /**
   * Resetar contador de interações (após conversão)
   */
  resetInteractionCount(customerId: string): void {
    this.interactionCount.delete(customerId);
  }

  /**
   * Ferramenta: getLeadProfile
   * 
   * Busca histórico do lead no CRM
   */
  async getLeadProfile(phone: string): Promise<{
    name?: string;
    email?: string;
    company?: string;
    previousInteractions: number;
    lastInteraction?: Date;
    status: 'new' | 'contacted' | 'qualified' | 'converted' | 'lost';
    error?: string;
  }> {
    try {
      // Buscar lead no Supabase (tabela leads ou customers)
      const { data: customer } = await supabase
        .from('customers')
        .select('name, email, phone, guru_subscription_id, asaas_customer_id')
        .eq('phone', phone)
        .single();

      if (!customer) {
        return {
          previousInteractions: 0,
          status: 'new'
        };
      }

      // Contar interações anteriores (tickets)
      const { count } = await supabase
        .from('tickets')
        .select('*', { count: 'exact', head: true })
        .eq('customer_id', customer.id)
        .eq('sector', 'comercial');

      return {
        name: customer.name || undefined,
        email: customer.email || undefined,
        previousInteractions: count || 0,
        status: count === 0 ? 'new' : 'contacted'
      };
    } catch (error) {
      console.error('❌ Erro em getLeadProfile:', error);
      return {
        previousInteractions: 0,
        status: 'new',
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Ferramenta: sendPlanComparison
   * 
   * Envia tabela comparativa de planos
   */
  sendPlanComparison(): string {
    const comparison = `
📊 **Comparativo de Planos Artificiall**

┌─────────────┬──────────┬──────────┬────────────┐
│   Feature   │  Básico  │ Premium  │ Enterprise │
├─────────────┼──────────┼──────────┼────────────┤
│ Usuários    │    5     │    10    │ Ilimitado  │
│ Armazenam.  │  10GB    │  100GB   │ Ilimitado  │
│ Suporte     │  Email   │ Priorit. │    24/7    │
│ Relatórios  │  Básico  │ Avançado │  Customiz. │
│ API Access  │    ❌    │    ✅    │     ✅     │
│ SLA         │    ❌    │    ❌    │     ✅     │
│ Gerente     │    ❌    │    ❌    │     ✅     │
├─────────────┼──────────┼──────────┼────────────┤
│   PREÇO     │ R$ 49/mês│ R$ 99/mês│ R$ 249/mês │
└─────────────┴──────────┴──────────┴────────────┘

💡 **Mais popular:** Premium - Melhor custo-benefício!

Qual plano faz mais sentido para você?
`;
    return comparison;
  }

  /**
   * Ferramenta: generateCheckoutLink
   * 
   * Gera link de checkout via GURU
   */
  async generateCheckoutLink(planId: string, customerId: string): Promise<{
    success: boolean;
    checkoutUrl?: string;
    error?: string;
  }> {
    try {
      // Buscar customerId no GURU
      const { data: customer } = await supabase
        .from('customers')
        .select('guru_subscription_id')
        .eq('id', customerId)
        .single();

      const guruCustomerId = (customer as any)?.guru_subscription_id;

      if (!guruCustomerId) {
        return {
          success: false,
          error: 'Cliente não encontrado no GURU'
        };
      }

      // Gerar link de checkout
      const checkoutUrl = await guruService.generateCheckoutLink(planId, guruCustomerId);

      if (!checkoutUrl) {
        return {
          success: false,
          error: 'Falha ao gerar link de checkout'
        };
      }

      return {
        success: true,
        checkoutUrl
      };
    } catch (error) {
      console.error('❌ Erro em generateCheckoutLink:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Ferramenta: scheduleDemo
   * 
   * Agenda demonstração
   */
  async scheduleDemo(datetime: string, leadId: string): Promise<{
    success: boolean;
    demoId?: string;
    error?: string;
  }> {
    try {
      // Registrar demo no Supabase
      const { data, error } = await (supabase
        .from('demos') as any)
        .insert({
          lead_id: leadId,
          scheduled_at: datetime,
          status: 'scheduled',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (error) {
        return {
          success: false,
          error: error.message
        };
      }

      return {
        success: true,
        demoId: (data as any).id
      };
    } catch (error) {
      console.error('❌ Erro em scheduleDemo:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Ferramenta: sendApprovedTemplate
   * 
   * Envia template pré-aprovado (WhatsApp/Telegram)
   */
  async sendApprovedTemplate(templateId: string, to: string): Promise<{
    success: boolean;
    error?: string;
  }> {
    // Placeholder - implementar integração com WhatsApp/Telegram
    console.log(`📄 Enviando template ${templateId} para ${to}`);
    
    return {
      success: true
    };
  }
}

// Singleton
let salesAgentInstance: SalesAgent | null = null;

export function getSalesAgent(): SalesAgent {
  if (!salesAgentInstance) {
    salesAgentInstance = new SalesAgent();
  }
  return salesAgentInstance;
}

export const salesAgent = getSalesAgent();

export default salesAgent;

