/**
 * RouterAgent
 * 
 * Orquestrador central do sistema multi-agentes (MAS).
 * Classifica intenção do cliente e roteia para agente especializado.
 * 
 * Modelo: Gemini 2.5 Flash (Jan 2026) - Latência < 500ms
 * 
 * @see docs/architecture/architecture.md#3-protocolo-de-handoff-entre-agentes
 */

import { GoogleGenerativeAI, GenerativeModel } from '@google/generative-ai';
import { supabase } from '../config/supabase';

export type Sector = 'suporte' | 'financeiro' | 'comercial';
export type AgentType = 'router' | 'support' | 'finance' | 'sales' | 'escalation' | 'human' | 'feedback';

export interface RouterOutput {
  sector: Sector;
  intent: string;
  confidence: number;      // 0.0 a 1.0
  suggestedAgent: AgentType;
  needsClarification: boolean;
  reasoning?: string;      // Explicação da decisão (para debug)
}

export interface CustomerContext {
  id: string;
  name?: string;
  plan?: 'basico' | 'premium' | 'enterprise';
  activeTicketId?: string;
  recentTickets: Array<{
    id: string;
    sector: string;
    intent: string;
    status: string;
    csatScore?: number;
  }>;
}

/**
 * System prompt do RouterAgent
 * 
 * Define comportamento, setores disponíveis e formato de resposta.
 */
const ROUTER_SYSTEM_PROMPT = `
Você é o **PAA Router**, a inteligência de triagem estratégica da Artificiall. Você é o primeiro contato do cliente e sua missão é garantir uma recepção de elite.

**PERSONALIDADE:**
- Sofisticado, ágil e extremamente educado.
- Você é o anfitrião que abre as portas e direciona o cliente para o especialista correto.

SUA FUNÇÃO:
1. Classificar a intenção do cliente com precisão cirúrgica.
2. Identificar a intenção específica (ex: "erro_de_acesso", "reembolso", "upgrade_plano")
3. Se a confiança for < 0.75, você deve ser gentil e pedir mais detalhes para não errar o encaminhamento.

SETORES DISPONÍVEIS:
- **suporte**: Desafios técnicos, erros, bugs ou dúvidas de uso.
- **financeiro**: Questões de pagamento, faturas, reembolsos ou cancelamentos.
- **comercial**: Interessados em comprar, fazer upgrade ou agendar demonstrações.

**TOM DE VOZ NO ESCLARECIMENTO (Se confiança < 0.75):**
"Olá! Sou o assistente da Artificiall. Para que eu possa te direcionar ao especialista ideal, você poderia me dar um pouco mais de detalhes sobre o que precisa?"

FORMATO DE RESPOSTA (JSON):
{
  "sector": "suporte|financeiro|comercial",
  "intent": "descricao_em_snake_case",
  "confidence": 0.0-1.0,
  "suggestedAgent": "support|finance|sales",
  "needsClarification": true|false,
  "reasoning": "por que tomou essa decisao"
}
`;

/**
 * RouterAgent Class
 * 
 * Responsabilidades:
 * - Classificar mensagens recebidas
 * - Calcular confidence score
 * - Sugerir agente especializado
 * - Recuperar histórico do cliente
 * - Logar decisões em agent_logs
 */
export class RouterAgent {
  private model: GenerativeModel;

  constructor() {
    const apiKey = process.env.GEMINI_API_KEY || process.env.GOOGLE_AI_API_KEY;
    
    if (!apiKey) {
      throw new Error('GEMINI_API_KEY não configurada. RouterAgent não pode funcionar sem IA.');
    }

    const genAI = new GoogleGenerativeAI(apiKey);
    this.model = genAI.getGenerativeModel({ 
      model: process.env.GEMINI_MODEL_ROUTER || 'gemini-2.5-flash'  // Atualizado: Gemini 2.5 Flash (Jan 2026)
    });
  }

  /**
   * Classificar mensagem e retornar decisão de roteamento
   * 
   * @param message - Mensagem do cliente
   * @param customerContext - Contexto do cliente (opcional, melhora classificação)
   * @returns Decisão de roteamento
   */
  async classify(
    message: string,
    customerContext?: CustomerContext
  ): Promise<RouterOutput> {
    const startTime = Date.now();

    // Construir contexto para o modelo
    const context = this.buildContext(message, customerContext);

    try {
      // Chamar Gemini
      const result = await this.model.generateContent(context);
      const responseText = result.response.text();

      // Parse do JSON response
      const parsed = this.parseResponse(responseText);

      // Calcular duração
      const durationMs = Date.now() - startTime;

      // Validar confiança
      if (parsed.confidence < 0.75) {
        parsed.needsClarification = true;
      }

      // Mapear setor para agente
      parsed.suggestedAgent = this.mapSectorToAgent(parsed.sector);

      console.log(`🧠 RouterAgent classificou em ${durationMs}ms:`, {
        sector: parsed.sector,
        intent: parsed.intent,
        confidence: parsed.confidence
      });

      return parsed;
    } catch (error) {
      console.error('❌ Erro ao classificar com RouterAgent:', error);
      
      // Fallback: classificação básica por palavras-chave
      return this.classifyByKeywords(message);
    }
  }

  /**
   * Construir contexto para o modelo
   */
  private buildContext(message: string, customerContext?: CustomerContext): string {
    let context = ROUTER_SYSTEM_PROMPT + '\n\n';
    
    context += `MENSAGEM DO CLIENTE: "${message}"\n\n`;

    if (customerContext) {
      context += `CONTEXTO DO CLIENTE:\n`;
      context += `- Nome: ${customerContext.name || 'Não informado'}\n`;
      context += `- Plano: ${customerContext.plan || 'Não informado'}\n`;
      context += `- Ticket ativo: ${customerContext.activeTicketId ? 'Sim' : 'Não'}\n`;
      
      if (customerContext.recentTickets.length > 0) {
        context += `- Últimos tickets:\n`;
        customerContext.recentTickets.slice(0, 3).forEach(ticket => {
          context += `  * ${ticket.sector}: ${ticket.intent} (${ticket.status})\n`;
        });
      }
    }

    context += `\nResponda com JSON:`;
    
    return context;
  }

  /**
   * Parse da resposta do modelo
   */
  private parseResponse(responseText: string): Omit<RouterOutput, 'suggestedAgent'> {
    try {
      // Tentar extrair JSON do response (pode ter markdown)
      const jsonMatch = responseText.match(/\{[\s\S]*\}/);
      const jsonString = jsonMatch ? jsonMatch[0] : responseText;
      
      const parsed = JSON.parse(jsonString);

      return {
        sector: this.validateSector(parsed.sector),
        intent: parsed.intent || 'desconhecido',
        confidence: this.validateConfidence(parsed.confidence),
        needsClarification: parsed.confidence < 0.75,
        reasoning: parsed.reasoning || ''
      };
    } catch (error) {
      console.warn('⚠️ Falha ao parsear JSON do RouterAgent, usando fallback');
      return {
        sector: 'suporte',
        intent: 'erro_parse_json',
        confidence: 0.5,
        needsClarification: true,
        reasoning: 'Falha ao parsear resposta do modelo'
      };
    }
  }

  /**
   * Validar setor
   */
  private validateSector(sector: string): Sector {
    const validSectors: Sector[] = ['suporte', 'financeiro', 'comercial'];
    return validSectors.includes(sector as Sector) ? (sector as Sector) : 'suporte';
  }

  /**
   * Validar confidence (0.0-1.0)
   */
  private validateConfidence(confidence: number): number {
    if (typeof confidence !== 'number' || isNaN(confidence)) {
      return 0.5;
    }
    return Math.max(0, Math.min(1, confidence));
  }

  /**
   * Mapear setor para agente
   */
  private mapSectorToAgent(sector: Sector): AgentType {
    const mapping: Record<Sector, AgentType> = {
      'suporte': 'support',
      'financeiro': 'finance',
      'comercial': 'sales'
    };
    return mapping[sector] || 'support';
  }

  /**
   * Classificação fallback por palavras-chave
   * 
   * Usado quando a IA falha.
   */
  private classifyByKeywords(message: string): RouterOutput {
    const lowerMessage = message.toLowerCase();

    // Palavras-chave por setor
    const keywords = {
      'suporte': ['erro', 'bug', 'não funciona', 'não consigo', 'acessar', 'login', 'senha', 'ajuda técnica'],
      'financeiro': ['cobrança', 'boleto', 'reembolso', 'estorno', 'pagamento', 'fatura', 'cancelar', 'dinheiro'],
      'comercial': ['plano', 'contratar', 'comprar', 'upgrade', 'demonstração', 'preço', 'venda', 'parceria']
    };

    let scores = { suporte: 0, financeiro: 0, comercial: 0 };

    for (const [sector, words] of Object.entries(keywords)) {
      for (const word of words) {
        if (lowerMessage.includes(word)) {
          scores[sector as Sector] += 0.2;
        }
      }
    }

    // Encontrar setor com maior score
    const maxSector = Object.entries(scores).reduce((a, b) => 
      scores[a[0] as Sector] > scores[b[0] as Sector] ? a : b
    )[0] as Sector;

    const confidence = Math.min(0.8, scores[maxSector]);

    return {
      sector: maxSector,
      intent: 'classificacao_por_palavras_chave',
      confidence,
      suggestedAgent: this.mapSectorToAgent(maxSector),
      needsClarification: confidence < 0.75,
      reasoning: 'Classificação fallback por palavras-chave'
    };
  }

  /**
   * Recuperar histórico do cliente
   * 
   * @param customerId - ID do cliente
   * @returns Contexto do cliente
   */
  async getCustomerContext(customerId: string): Promise<CustomerContext | null> {
    try {
      // Buscar dados do cliente
      const { data: customer } = await supabase
        .from('customers')
        .select('id, name, guru_subscription_id')
        .eq('id', customerId)
        .single();

      if (!customer) {
        return null;
      }

      // Buscar tickets recentes
      const { data: tickets } = await supabase
        .from('tickets')
        .select('id, sector, intent, status, csat_score')
        .eq('customer_id', customerId)
        .order('created_at', { ascending: false })
        .limit(5);

      // Buscar ticket ativo
      const activeTicket = tickets?.find(t => t.status !== 'resolvido');

      // Determinar plano (simplificado)
      let plan: CustomerContext['plan'] = 'basico';
      if (customer.guruSubscriptionId) {
        // Em produção, buscar do GURU
        plan = 'premium'; // Placeholder
      }

      return {
        id: customer.id,
        name: customer.name || undefined,
        plan,
        activeTicketId: activeTicket?.id,
        recentTickets: tickets || []
      };
    } catch (error) {
      console.error('❌ Erro ao buscar contexto do cliente:', error);
      return null;
    }
  }

  /**
   * Logar decisão em agent_logs
   * 
   * @param ticketId - ID do ticket
   * @param output - Resultado da classificação
   * @param durationMs - Duração em ms
   */
  async logDecision(
    ticketId: string,
    output: RouterOutput,
    durationMs: number
  ): Promise<void> {
    try {
      await supabase
        .from('agent_logs')
        .insert({
          ticket_id: ticketId,
          agent_type: 'router',
          action: 'classified',
          input: { message: 'ver ticket.messages' },
          output: {
            sector: output.sector,
            intent: output.intent,
            confidence: output.confidence,
            reasoning: output.reasoning
          },
          tools_used: ['gemini_classification', 'customer_history_lookup'],
          confidence: output.confidence,
          duration_ms: durationMs
        });
    } catch (error) {
      console.error('❌ Erro ao logar decisão do RouterAgent:', error);
    }
  }

  /**
   * Gerar mensagem de esclarecimento
   * 
   * Usado quando confidence < 0.75
   */
  getClarificationMessage(): string {
    const messages = [
      "Para agilizar seu atendimento, me diz: você quer ajuda com (1) Suporte técnico, (2) Financeiro/cobrança ou (3) Planos e upgrades?",
      "Entendi! Para te atender melhor, qual é o assunto? Digite:\n- 1 para Suporte Técnico\n- 2 para Financeiro\n- 3 para Comercial",
      "Vou te ajudar! Primeiro, me conta: é sobre suporte técnico, algo financeiro ou sobre planos?"
    ];

    return messages[Math.floor(Math.random() * messages.length)];
  }
}

// Singleton
let routerAgentInstance: RouterAgent | null = null;

export function getRouterAgent(): RouterAgent {
  if (!routerAgentInstance) {
    routerAgentInstance = new RouterAgent();
  }
  return routerAgentInstance;
}

export const routerAgent = getRouterAgent();

export default routerAgent;
