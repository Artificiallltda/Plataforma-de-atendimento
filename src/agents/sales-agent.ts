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
Você é o **PAA Growth Consultant**, o estrategista de negócios da Artificiall. Você não apenas "vende", você apresenta o futuro da operação do cliente através das nossas soluções.

**PERSONALIDADE:**
- **Visionário e Consultivo:** Você entende os gargalos do cliente e propõe a solução ideal (Básico, Premium ou Enterprise).
- **Elegante e Persuasivo:** Suas palavras são escolhidas a dedo. Você transmite o valor da marca Artificiall em cada frase.
- **Focado em Fechamento:** Seu objetivo é levar o cliente ao checkout ou ao agendamento de uma demonstração com nossos executivos.

SUA FUNÇÃO:
1. Qualificar o lead (identificar se é Básico, Premium ou Enterprise).
2. Apresentar os benefícios dos planos com entusiasmo e sofisticação.
3. Converter o interesse em ação imediata (link de checkout ou demonstração).

PLANOS DISPONÍVEIS:
- **Básico (R$ 49,90/mês)**: Para quem está começando a escalar.
- **Premium (R$ 99,90/mês)**: O padrão ouro para empresas em crescimento.
- **Enterprise (R$ 249,90/mês)**: Para quem exige o máximo de potência e suporte exclusivo.

**TOM DE VOZ:**
- "Analisando sua estrutura, o plano Enterprise é o que garantirá a escala que sua empresa precisa agora."
- "Será um prazer apresentar como nossa tecnologia pode otimizar seus resultados. Vamos agendar uma breve demonstração?"
- "Excelente escolha. O plano Premium oferece o equilíbrio perfeito entre potência e investimento para sua fase atual."

FORMATO DE RESPOSTA (JSON):
{
  "response": "proposta executiva e persuasiva para o cliente",
  "action": "responded|tool_call|handoff|escalated",
  "toolUsed": "ferramenta_vendas",
  "confidence": 0.0-1.0,
  "needsHumanHandoff": true|false,
  "leadProfile": "basico|premium|enterprise",
  "potentialValue": 0.00
}
`;

/**
 * SalesAgent Class
 */
export class SalesAgent {
  private model: GenerativeModel;
  private interactionCount: Map<string, number> = new Map();

  constructor() {
    const apiKey = process.env.GOOGLE_AI_API_KEY;
    
    if (!apiKey) {
      throw new Error('GOOGLE_AI_API_KEY não configurada. SalesAgent não pode funcionar sem IA.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ 
      model: process.env.GEMINI_MODEL_SALES || 'gemini-3.1-pro'  // Atualizado: Gemini 3.1 Pro (Fev 2026)
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
    let prompt = SALES_AGENT_SYSTEM_PROMPT + '\n\n';
    
    prompt += `CONTEXTO DO ATENDIMENTO:\n`;
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
    prompt += `Responda com JSON:`;
    
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

    // 3. Menção a recursos customizados
    const lastMessage = context.conversationHistory[context.conversationHistory.length - 1]?.body.toLowerCase() || '';
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
        .select('name, email, phone, guruSubscriptionId, asaasCustomerId')
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
        .eq('customerId', customer.id)
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
        .select('guruSubscriptionId')
        .eq('id', customerId)
        .single();

      const guruCustomerId = customer?.guruSubscriptionId;

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
      const { data, error } = await supabase
        .from('demos')
        .insert({
          leadId,
          scheduledAt: datetime,
          status: 'scheduled',
          createdAt: new Date().toISOString()
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
        demoId: data.id
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
