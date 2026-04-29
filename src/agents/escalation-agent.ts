/**
 * EscalationAgent
 * 
 * Monitor passivo de crises que detecta situações de risco em tempo real.
 * Analisa sentimento, palavras-chave de crise, timeout e retry count.
 * 
 * Modelo: Análise leve de sentimento (< 100ms)
 * 
 * @see docs/architecture/architecture.md#3-protocolo-de-handoff-entre-agentes
 */

import { supabase } from '../config/supabase';
import { TelegramProvider } from '../integrations/telegram-provider';

export type UrgencyLevel = 'low' | 'medium' | 'high' | 'critical';

export interface EscalationResult {
  shouldEscalate: boolean;
  urgency: UrgencyLevel;
  reason: string;
  sentimentScore?: number;
  detectedKeywords?: string[];
  timeoutMinutes?: number;
  retryCount?: number;
}

export interface EscalationAlert {
  ticket_id: string;
  customer_id: string;
  type: 'sentiment' | 'timeout' | 'retry' | 'crisis_keywords' | 'systemic_bug';
  level: UrgencyLevel;
  message: string;
  metadata: {
    sentimentScore?: number;
    keywords?: string[];
    timeoutMinutes?: number;
    retryCount?: number;
    similarErrors?: number;
    csat_score?: number;
  };
  timestamp: Date;
}

/**
 * Gatilhos de escalada configuráveis
 */
export const ESCALATION_TRIGGERS = {
  // Palavras-chave de crise
  keywords: [
    'absurdo', 'cancelar', 'procon', 'juizado', 'advogado', 
    'vergonha', 'enganado', 'inaceitável', 'processo', 'denuncia',
    'crime', 'ilegal', 'golpe', 'fraude'
  ],
  
  // Score de sentimento negativo
  sentimentScore: -0.6,
  
  // Timeout sem resposta (10 minutos)
  noResponseTime: 10 * 60 * 1000,
  
  // Retry count máximo
  retryCount: 3,
  
  // Bug sistêmico (mesmo erro em X tickets em Y tempo)
  systemicBug: {
    sameErrorCount: 3,
    timeWindow: 60 * 60 * 1000 // 1 hora
  }
};

/**
 * Palavras positivas para balancear análise
 */
const POSITIVE_WORDS = [
  'bom', 'ótimo', 'excelente', 'obrigado', 'resolvido', 
  'funciona', 'perfeito', 'maravilha', 'parabéns', 'agradeço'
];

/**
 * EscalationAgent Class
 */
export class EscalationAgent {
  private activeMonitors: Map<string, NodeJS.Timeout> = new Map();
  private telegramProvider?: TelegramProvider;

  constructor() {
    // Inicializar provedor Telegram se token configurado
    const telegramToken = process.env.TELEGRAM_BOT_TOKEN;
    if (telegramToken) {
      this.telegramProvider = new TelegramProvider(telegramToken, { polling: false });
    }
  }

  /**
   * Analisar mensagem em busca de gatilhos de escalada
   */
  async analyzeMessage(
    ticketId: string,
    message: string,
    customerId: string
  ): Promise<EscalationResult> {
    const sentiment = this.analyzeSentiment(message);
    const keywords = this.detectKeywords(message);
    const timeoutResult = await this.checkTimeout(ticketId);
    const timeout = timeoutResult.isTimeout;
    const retry = await this.checkRetryCount(ticketId);

    // Determinar se deve escalar
    const shouldEscalate = 
      sentiment.score < ESCALATION_TRIGGERS.sentimentScore ||
      keywords.length > 0 ||
      timeout ||
      retry >= ESCALATION_TRIGGERS.retryCount;

    if (!shouldEscalate) {
      return {
        shouldEscalate: false,
        urgency: 'low',
        reason: 'Sem gatilhos de escalada'
      };
    }

    // Determinar urgência
    const urgency = this.calculateUrgency(sentiment.score, keywords.length, timeout, retry);
    const reason = this.getEscalationReason(sentiment, keywords, timeout, retry);

    return {
      shouldEscalate,
      urgency,
      reason,
      sentimentScore: sentiment.score,
      detectedKeywords: keywords,
      timeoutMinutes: timeout ? Math.round(timeoutResult.diff / 60000) : undefined,
      retryCount: retry
    };
  }

  /**
   * Analisar sentimento da mensagem
   * 
   * Usa análise baseada em regras para performance (< 100ms)
   */
  analyzeSentiment(text: string): { score: number; label: string } {
    const lowerText = text.toLowerCase();
    const words = lowerText.split(/\s+/);
    
    let positiveCount = 0;
    let negativeCount = 0;

    // Contar palavras positivas
    for (const word of words) {
      if (POSITIVE_WORDS.some(p => word.includes(p))) {
        positiveCount++;
      }
      if (ESCALATION_TRIGGERS.keywords.some(k => word.includes(k))) {
        negativeCount++;
      }
    }

    // Calcular score (-1.0 a 1.0)
    const total = positiveCount + negativeCount;
    let score = total === 0 ? 0 : (positiveCount - negativeCount) / total;

    // Ajustar para intensidade
    if (negativeCount >= 3) {
      score = Math.min(score, -0.8); // Múltiplas palavras negativas = muito negativo
    }

    const label = score < -0.6 ? 'muito_negativo' :
                  score < 0 ? 'negativo' :
                  score < 0.6 ? 'neutro' : 'positivo';

    return { score, label };
  }

  /**
   * Detectar palavras-chave de crise
   */
  detectKeywords(text: string): string[] {
    const lowerText = text.toLowerCase();
    return ESCALATION_TRIGGERS.keywords.filter(keyword => 
      lowerText.includes(keyword)
    );
  }

  /**
   * Verificar timeout de resposta
   */
  async checkTimeout(ticketId: string): Promise<{ isTimeout: boolean; diff: number }> {
    try {
      const { data } = await (supabase
        .from('messages') as any)
        .select('timestamp, sender')
        .eq('ticket_id', ticketId)
        .order('timestamp', { ascending: false })
        .limit(1)
        .single();

      if (!data) {
        return { isTimeout: false, diff: 0 };
      }

      // Se última mensagem foi do bot, verificar tempo
      if (data.sender === 'bot' || data.sender === 'human') {
        const lastMessageTime = new Date(data.timestamp).getTime();
        const now = Date.now();
        const diff = now - lastMessageTime;

        return { isTimeout: diff > ESCALATION_TRIGGERS.noResponseTime, diff };
      }

      return { isTimeout: false, diff: 0 };
    } catch (error) {
      console.error('❌ Erro ao verificar timeout:', error);
      return { isTimeout: false, diff: 0 };
    }
  }

  /**
   * Verificar retry count
   */
  async checkRetryCount(ticketId: string): Promise<number> {
    try {
      const { data } = await (supabase
        .from('agent_logs') as any)
        .select('action')
        .eq('ticket_id', ticketId)
        .eq('action', 'responded')
        .order('created_at', { ascending: false })
        .limit(10);

      return data?.length || 0;
    } catch (error) {
      console.error('❌ Erro ao verificar retry count:', error);
      return 0;
    }
  }

  /**
   * Calcular nível de urgência
   */
  private calculateUrgency(
    sentimentScore: number,
    keywordCount: number,
    timeout: boolean,
    retryCount: number
  ): UrgencyLevel {
    // Crítico: crise + enterprise, ou palavras legais
    if (keywordCount >= 2 || 
        ['procon', 'advogado', 'juizado', 'processo'].some(k => 
          ESCALATION_TRIGGERS.keywords.slice(0, 5).includes(k)
        )) {
      return 'critical';
    }

    // Alto: sentimento muito negativo ou timeout longo
    if (sentimentScore < -0.8 || timeout || retryCount >= 5) {
      return 'high';
    }

    // Médio: sentimento negativo ou retry count alto
    if (sentimentScore < ESCALATION_TRIGGERS.sentimentScore || retryCount >= 3) {
      return 'medium';
    }

    return 'low';
  }

  /**
   * Obter motivo da escalada
   */
  private getEscalationReason(
    sentiment: { score: number; label: string },
    keywords: string[],
    timeout: boolean,
    retryCount: number
  ): string {
    const reasons: string[] = [];

    if (keywords.length > 0) {
      reasons.push(`Palavras de crise: ${keywords.join(', ')}`);
    }

    if (sentiment.score < ESCALATION_TRIGGERS.sentimentScore) {
      reasons.push(`Sentimento negativo (${sentiment.label}, score: ${sentiment.score.toFixed(2)})`);
    }

    if (timeout) {
      reasons.push('Timeout de resposta (> 10 min)');
    }

    if (retryCount >= ESCALATION_TRIGGERS.retryCount) {
      reasons.push(`Múltiplas tentativas sem sucesso (${retryCount})`);
    }

    return reasons.join('; ');
  }

  /**
   * Acionar alerta de escalada
   */
  async triggerEscalation(alert: EscalationAlert): Promise<{ success: boolean; error?: string }> {
    try {
      // 1. Persistir alerta no Supabase
      await this.persistAlert(alert);

      // 2. Atualizar ticket com prioridade crítica
      await this.updateTicketPriority(alert.ticket_id, alert.level);

      // 3. Notificar supervisores
      await this.notifySupervisors(alert);

      // 4. Log em agent_logs
      await this.logEscalation(alert);

      console.log(`🚨 EscalationAgent: Alerta acionado para ticket ${alert.ticket_id}`);
      
      return { success: true };
    } catch (error) {
      console.error('❌ Erro ao acionar escalada:', error);
      return { 
        success: false, 
        error: error instanceof Error ? error.message : 'Erro desconhecido' 
      };
    }
  }

  /**
   * Persistir alerta no Supabase
   */
  private async persistAlert(alert: EscalationAlert): Promise<void> {
    await (supabase
      .from('alerts') as any)
      .insert({
        ticket_id: alert.ticket_id,
        type: alert.type,
        level: alert.level,
        message: alert.message,
        acknowledged: false,
        created_at: new Date().toISOString()
      });
  }

  /**
   * Atualizar prioridade do ticket
   */
  private async updateTicketPriority(ticketId: string, level: UrgencyLevel): Promise<void> {
    const priorityMap: Record<UrgencyLevel, string> = {
      'low': 'baixa',
      'medium': 'media',
      'high': 'alta',
      'critical': 'critica'
    };

    await (supabase
      .from('tickets') as any)
      .update({
        priority: priorityMap[level],
        status: 'aguardando_humano'
      })
      .eq('id', ticketId);
  }

  /**
   * Notificar supervisores
   */
  private async notifySupervisors(alert: EscalationAlert): Promise<void> {
    try {
      // Buscar supervisores online
      const { data: supervisors } = await (supabase
        .from('agents') as any)
        .select('id, name, email')
        .eq('sector', 'supervisor')
        .eq('is_online', true);

      if (!supervisors || (supervisors as any).length === 0) {
        console.warn('⚠️ Nenhum supervisor online para notificar');
        return;
      }

      // Enviar notificação via Telegram
      const message = this.buildNotificationMessage(alert);
      
      for (const supervisor of (supervisors as any)) {
        // Em produção, enviar via Telegram/Push
        console.log(`📱 Notificando supervisor ${supervisor.name}: ${message}`);
      }
    } catch (error) {
      console.error('❌ Erro ao notificar supervisores:', error);
    }
  }

  /**
   * Construir mensagem de notificação
   */
  private buildNotificationMessage(alert: EscalationAlert): string {
    const emoji = {
      'low': '🟡',
      'medium': '🟠',
      'high': '🔴',
      'critical': '🚨'
    };

    return `${emoji[alert.level]} *ALERTA DE ESCALADA*\n\n` +
      `Ticket: ${alert.ticket_id}\n` +
      `Tipo: ${alert.type}\n` +
      `Nível: ${alert.level.toUpperCase()}\n` +
      `Motivo: ${alert.message}\n\n` +
      `Ação necessária: Verificar ticket imediatamente.`;
  }

  /**
   * Logar escalada em agent_logs
   */
  private async logEscalation(alert: EscalationAlert): Promise<void> {
    await (supabase
      .from('agent_logs') as any)
      .insert({
        ticket_id: alert.ticket_id,
        agent_type: 'escalation',
        action: 'escalated',
        input: {
          type: alert.type,
          level: alert.level
        },
        output: {
          message: alert.message,
          metadata: alert.metadata
        },
        tools_used: ['analyzeSentiment', 'detectKeywords', 'checkTimeout', 'checkRetryCount'],
        confidence: 1.0,
        duration_ms: 0
      });
  }

  /**
   * Detectar bug sistêmico (mesmo erro em múltiplos tickets)
   */
  async detectSystemicBug(errorMessage: string): Promise<{
    isSystemic: boolean;
    similarTickets: number;
    ticketIds: string[];
  }> {
    try {
      // Buscar tickets similares nas últimas horas
      const timeWindow = new Date(Date.now() - ESCALATION_TRIGGERS.systemicBug.timeWindow);

      const { data } = await (supabase
        .from('tickets') as any)
        .select('id, intent')
        .in('status', ['novo', 'bot_ativo', 'em_atendimento'])
        .gte('created_at', timeWindow.toISOString())
        .ilike('intent', `%${errorMessage}%`);

      const similarTickets = (data as any)?.length || 0;
      const isSystemic = similarTickets >= ESCALATION_TRIGGERS.systemicBug.sameErrorCount;

      return {
        isSystemic,
        similarTickets,
        ticketIds: (data as any)?.map((t: any) => t.id) || []
      };
    } catch (error) {
      console.error('❌ Erro ao detectar bug sistêmico:', error);
      return { isSystemic: false, similarTickets: 0, ticketIds: [] };
    }
  }

  /**
   * Iniciar monitoramento de timeout para um ticket
   */
  startTimeoutMonitor(ticketId: string, callback: () => void): void {
    // Limpar monitor existente
    this.stopTimeoutMonitor(ticketId);

    // Criar novo monitor
    const timeoutId = setTimeout(() => {
      callback();
      this.activeMonitors.delete(ticketId);
    }, ESCALATION_TRIGGERS.noResponseTime);

    this.activeMonitors.set(ticketId, timeoutId);
  }

  /**
   * Parar monitoramento de timeout
   */
  stopTimeoutMonitor(ticketId: string): void {
    const existingMonitor = this.activeMonitors.get(ticketId);
    if (existingMonitor) {
      clearTimeout(existingMonitor);
      this.activeMonitors.delete(ticketId);
    }
  }

  /**
   * Limpar todos os monitores
   */
  cleanup(): void {
    for (const [ticketId, timeoutId] of this.activeMonitors.entries()) {
      clearTimeout(timeoutId);
    }
    this.activeMonitors.clear();
  }
}

// Singleton
let escalationAgentInstance: EscalationAgent | null = null;

export function getEscalationAgent(): EscalationAgent {
  if (!escalationAgentInstance) {
    escalationAgentInstance = new EscalationAgent();
  }
  return escalationAgentInstance;
}

export const escalationAgent = getEscalationAgent();

export default escalationAgent;
