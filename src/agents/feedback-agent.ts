/**
 * FeedbackAgent
 * 
 * Agente de pós-atendimento para coleta de CSAT e NPS.
 * Dispara pesquisas após resolução de tickets e periodicamente para NPS.
 * 
 * Modelo: Leve (respostas estruturadas não requerem IA pesada)
 * 
 * @see docs/architecture/architecture.md#3-protocolo-de-handoff-entre-agentes
 */

import { supabase, Database } from '../config/supabase';
import { SupabaseClient } from '@supabase/supabase-js';
import { escalationAgent } from './escalation-agent';

const typedClient = supabase as unknown as SupabaseClient<Database>;

export type FeedbackType = 'csat' | 'nps';
export type NpsClassification = 'detractor' | 'passive' | 'promoter';

export interface FeedbackAgentOutput {
  action: 'sent' | 'collected' | 'escalated' | 'ignored';
  type?: FeedbackType;
  score?: number;
  comment?: string;
  message?: string; // Mensagem para o cliente
}

/**
 * Configurações do FeedbackAgent
 */
export const FEEDBACK_CONFIG = {
  // Delay para envio de CSAT após ticket resolvido (em minutos)
  csatDelayMinutes: 5,
  
  // Intervalo mínimo entre pesquisas NPS (em dias)
  npsIntervalDays: 30,
  
  // CSAT limite para escalada (abaixo disso aciona recuperação)
  csatEscalationThreshold: 3,
  
  // Mensagens de CSAT
  csatMessages: [
    'Como foi seu atendimento hoje? Avalie de 1 a 5 estrelas: ⭐⭐⭐⭐⭐',
    'Podemos melhorar? Deixe sua avaliação: ⭐⭐⭐⭐⭐',
    'Sua opinião é importante! Como foi seu atendimento? ⭐⭐⭐⭐⭐'
  ],
  
  // Mensagens de NPS
  npsMessage: 'De 0 a 10, quanto você recomendaria a Artificiall para um amigo ou colega?',
  
  // Mensagens de agradecimento por score
  thankYouMessages: {
    high: 'Obrigado pelo feedback! Ficamos felizes em ajudar! 😊',
    medium: 'Obrigado pela avaliação! Vamos continuar melhorando.',
    low: 'Sentimos muito que não tenha sido como esperado. Vamos entrar em contato para resolver!'
  }
};

/**
 * FeedbackAgent Class
 */
export class FeedbackAgent {
  /**
   * Verificar tickets resolvidos para envio de CSAT
   * 
   * Deve ser executado periodicamente (ex: a cada 5 minutos)
   */
  async checkResolvedTicketsForCsat(): Promise<{
    checked: number;
    sent: number;
    error?: string;
  }> {
    try {
      // Calcular janela de tempo (tickets resolvidos há 5 minutos)
      const now = new Date();
      const targetTime = new Date(now.getTime() - FEEDBACK_CONFIG.csatDelayMinutes * 60 * 1000);
      const targetTimeEnd = new Date(targetTime.getTime() + 60 * 1000); // Janela de 1 minuto

      // Buscar tickets resolvidos na janela
      const { data: tickets, error } = await supabase
        .from('tickets')
        .select('id, customer_id, channel')
        .eq('status', 'resolvido')
        .gte('resolved_at', targetTime.toISOString())
        .lte('resolved_at', targetTimeEnd.toISOString())
        .not('csat_score', 'is', null); // Apenas tickets sem CSAT

      if (error) {
        return {
          checked: 0,
          sent: 0,
          error: error.message
        };
      }

      let sentCount = 0;

      // Enviar CSAT para cada ticket
      for (const ticket of tickets || []) {
        const result = await this.sendCsatSurvey((ticket as any).id, (ticket as any).customer_id, (ticket as any).channel);
        if (result.action === 'sent') {
          sentCount++;
        }
      }

      return {
        checked: tickets?.length || 0,
        sent: sentCount
      };
    } catch (error) {
      console.error('❌ Erro em checkResolvedTicketsForCsat:', error);
      return {
        checked: 0,
        sent: 0,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Enviar pesquisa de CSAT
   */
  async sendCsatSurvey(
    ticketId: string,
    customerId: string,
    channel: 'whatsapp' | 'telegram' | 'web'
  ): Promise<FeedbackAgentOutput> {
    try {
      // Verificar se já foi enviado CSAT para este ticket
      const { data: existingFeedback } = await supabase
        .from('feedback')
        .select('id')
        .eq('ticket_id', ticketId)
        .eq('type', 'csat')
        .single();

      if (existingFeedback) {
        return { action: 'ignored' };
      }

      // Selecionar mensagem aleatória
      const message = FEEDBACK_CONFIG.csatMessages[
        Math.floor(Math.random() * FEEDBACK_CONFIG.csatMessages.length)
      ];

      // Enviar mensagem via canal
      await this.sendFeedbackMessage(customerId, channel, message);

      // Registrar envio (opcional, para controle)
      console.log(`📊 CSAT enviado para ticket ${ticketId}`);

      return {
        action: 'sent',
        type: 'csat',
        message
      };
    } catch (error) {
      console.error('❌ Erro ao enviar CSAT:', error);
      return {
        action: 'ignored',
        type: 'csat'
      };
    }
  }

  /**
   * Processar resposta de CSAT
   */
  async processCsatResponse(
    ticketId: string,
    customerId: string,
    score: number,
    comment?: string
  ): Promise<FeedbackAgentOutput> {
    try {
      // Validar score (1-5)
      if (score < 1 || score > 5) {
        return {
          action: 'ignored',
          type: 'csat'
        };
      }

      // Registrar feedback no Supabase
      const { error: feedbackError } = await typedClient
        .from('feedback')
        .insert({
          ticket_id: ticketId,
          customer_id: customerId,
          type: 'csat',
          score,
          comment: comment || null,
          created_at: new Date().toISOString()
        } as any);

      if (feedbackError) {
        console.error('❌ Erro ao registrar CSAT:', feedbackError);
        return {
          action: 'ignored',
          type: 'csat'
        };
      }

      // Atualizar ticket com CSAT
      await typedClient
        .from('tickets')
        .update({ csat_score: score } as any)
        .eq('id', ticketId);

      // Verificar se precisa de escalada (CSAT baixo)
      if (score < FEEDBACK_CONFIG.csatEscalationThreshold) {
        await this.triggerCsatEscalation(ticketId, customerId, score);
        return {
          action: 'escalated',
          type: 'csat',
          score,
          comment
        };
      }

      // Enviar agradecimento
      const thankYouMessage = score >= 4 
        ? FEEDBACK_CONFIG.thankYouMessages.high
        : score === 3
        ? FEEDBACK_CONFIG.thankYouMessages.medium
        : FEEDBACK_CONFIG.thankYouMessages.low;

      return {
        action: 'collected',
        type: 'csat',
        score,
        comment,
        message: thankYouMessage
      };
    } catch (error) {
      console.error('❌ Erro em processCsatResponse:', error);
      return {
        action: 'ignored',
        type: 'csat'
      };
    }
  }

  /**
   * Verificar clientes elegíveis para NPS
   * 
   * Deve ser executado periodicamente (ex: diariamente)
   */
  async checkCustomersForNps(): Promise<{
    checked: number;
    sent: number;
    error?: string;
  }> {
    try {
      // Calcular data limite (30 dias atrás)
      const npsLimitDate = new Date();
      npsLimitDate.setDate(npsLimitDate.getDate() - FEEDBACK_CONFIG.npsIntervalDays);

      // Buscar clientes que não receberam NPS há 30 dias
      // Nota: Supabase JS não suporta .group() diretamente na query fluida.
      // Vamos buscar o histórico recente e filtrar no código para maior estabilidade.
      const { data: npsHistory } = await (supabase
        .from('nps_history') as any)
        .select('customer_id, created_at')
        .order('created_at', { ascending: false });

      // Mapa para armazenar o último NPS de cada cliente
      const lastNpsPerCustomer = new Map<string, Date>();
      if (npsHistory) {
        for (const record of (npsHistory as any[])) {
          if (!lastNpsPerCustomer.has(record.customer_id)) {
            lastNpsPerCustomer.set(record.customer_id, new Date(record.created_at));
          }
        }
      }

      // Filtrar clientes elegíveis (aqueles cujo último NPS foi há mais de npsIntervalDays)
      const eligibleFromHistory = Array.from(lastNpsPerCustomer.entries())
        .filter(([_, lastDate]) => lastDate < npsLimitDate)
        .map(([customer_id]) => ({ customerId: customer_id }));

      let eligibleCustomers = eligibleFromHistory;
      
      if (eligibleCustomers.length === 0) {
        // Buscar todos os clientes com tickets resolvidos
        const { data: allCustomers } = await supabase
          .from('customers')
          .select('id');
        
        eligibleCustomers = allCustomers?.map(c => ({ customerId: c.id })) || [];
      }

      let sentCount = 0;

      // Enviar NPS para cada cliente elegível
      for (const { customerId } of eligibleCustomers) {
        const result = await this.sendNpsSurvey(customerId);
        if (result.action === 'sent') {
          sentCount++;
        }
      }

      return {
        checked: eligibleCustomers.length,
        sent: sentCount
      };
    } catch (error) {
      console.error('❌ Erro em checkCustomersForNps:', error);
      return {
        checked: 0,
        sent: 0,
        error: error instanceof Error ? error.message : 'Erro desconhecido'
      };
    }
  }

  /**
   * Enviar pesquisa de NPS
   */
  async sendNpsSurvey(customerId: string): Promise<FeedbackAgentOutput> {
    try {
      // Buscar dados do cliente para envio
      const { data: customer } = await supabase
        .from('customers')
        .select('id, channel, channel_user_id')
        .eq('id', customerId)
        .single();

      if (!customer) {
        return { action: 'ignored' };
      }

      // Enviar mensagem NPS
      await this.sendFeedbackMessage(
        customerId,
        customer.channel as 'whatsapp' | 'telegram' | 'web',
        FEEDBACK_CONFIG.npsMessage
      );

      console.log(`📊 NPS enviado para cliente ${customerId}`);

      return {
        action: 'sent',
        type: 'nps',
        message: FEEDBACK_CONFIG.npsMessage
      };
    } catch (error) {
      console.error('❌ Erro ao enviar NPS:', error);
      return {
        action: 'ignored',
        type: 'nps'
      };
    }
  }

  /**
   * Processar resposta de NPS
   */
  async processNpsResponse(
    customerId: string,
    score: number,
    comment?: string
  ): Promise<FeedbackAgentOutput> {
    try {
      // Validar score (0-10)
      if (score < 0 || score > 10) {
        return {
          action: 'ignored',
          type: 'nps'
        };
      }

      // Classificar respondente
      const classification = this.classifyNps(score);

      // Registrar feedback no Supabase
      const { error: feedbackError } = await supabase
        .from('feedback')
        .insert({
          customer_id: customerId,
          type: 'nps',
          score,
          comment: comment || null,
          created_at: new Date().toISOString()
        });

      if (feedbackError) {
        console.error('❌ Erro ao registrar NPS:', feedbackError);
        return {
          action: 'ignored',
          type: 'nps'
        };
      }

      // Registrar histórico NPS
      await supabase
        .from('nps_history')
        .insert({
          customer_id: customerId,
          score,
          classification,
          created_at: new Date().toISOString()
        });

      // Enviar agradecimento
      const thankYouMessage = score >= 9
        ? FEEDBACK_CONFIG.thankYouMessages.high
        : score >= 7
        ? FEEDBACK_CONFIG.thankYouMessages.medium
        : FEEDBACK_CONFIG.thankYouMessages.low;

      return {
        action: 'collected',
        type: 'nps',
        score,
        comment,
        message: thankYouMessage
      };
    } catch (error) {
      console.error('❌ Erro em processNpsResponse:', error);
      return {
        action: 'ignored',
        type: 'nps'
      };
    }
  }

  /**
   * Classificar respondente NPS
   */
  classifyNps(score: number): NpsClassification {
    if (score <= 6) {
      return 'detractor';
    } else if (score <= 8) {
      return 'passive';
    } else {
      return 'promoter';
    }
  }

  /**
   * Acionar escalada para CSAT baixo
   */
  private async triggerCsatEscalation(
    ticketId: string,
    customerId: string,
    score: number
  ): Promise<void> {
    try {
      // Criar alerta de recuperação
      await supabase
        .from('alerts')
        .insert({
          ticket_id: ticketId,
          type: 'low_csat',
          level: 'high',
          message: `CSAT baixo (${score}/5) - Necessária recuperação`,
          acknowledged: false,
          created_at: new Date().toISOString()
        });

      // Notificar via EscalationAgent
      await escalationAgent.triggerEscalation({
        ticketId,
        customerId,
        type: 'sentiment',
        level: 'high',
        message: `Cliente avaliou atendimento com ${score}/5 estrelas`,
        metadata: { csat_score: score },
        timestamp: new Date()
      });

      console.log(`🚨 Escalada de CSAT baixo acionada para ticket ${ticketId}`);
    } catch (error) {
      console.error('❌ Erro ao acionar escalada de CSAT:', error);
    }
  }

  /**
   * Enviar mensagem de feedback via canal
   */
  private async sendFeedbackMessage(
    customerId: string,
    channel: 'whatsapp' | 'telegram' | 'web',
    message: string
  ): Promise<void> {
    // Placeholder para envio de mensagem
    // Em produção, integrar com WhatsApp/Telegram API
    console.log(`📨 Enviando para ${channel} (cliente ${customerId}): ${message}`);
  }

  /**
   * Gerar relatório semanal de CSAT/NPS
   */
  async generateWeeklyReport(): Promise<{
    csat: {
      average: number;
      count: number;
      distribution: Record<number, number>;
    };
    nps: {
      score: number;
      promoters: number;
      passives: number;
      detractors: number;
      total: number;
    };
    period: {
      start: Date;
      end: Date;
    };
  }> {
    try {
      // Calcular período (últimos 7 dias)
      const end = new Date();
      const start = new Date(end.getTime() - 7 * 24 * 60 * 60 * 1000);

      // Buscar CSAT do período
      const { data: csatFeedback } = await supabase
        .from('feedback')
        .select('score')
        .eq('type', 'csat')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      // Calcular média e distribuição de CSAT
      const csatDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 };
      let csatSum = 0;

      for (const feedback of csatFeedback || []) {
        csatDistribution[feedback.score] = (csatDistribution[feedback.score] || 0) + 1;
        csatSum += feedback.score;
      }

      const csatAverage = csatFeedback && csatFeedback.length > 0
        ? csatSum / csatFeedback.length
        : 0;

      // Buscar NPS do período
      const { data: npsHistory } = await supabase
        .from('nps_history')
        .select('score, classification')
        .gte('created_at', start.toISOString())
        .lte('created_at', end.toISOString());

      // Calcular NPS
      let promoters = 0;
      let passives = 0;
      let detractors = 0;

      for (const record of npsHistory || []) {
        if (record.classification === 'promoter') promoters++;
        else if (record.classification === 'passive') passives++;
        else if (record.classification === 'detractor') detractors++;
      }

      const total = promoters + passives + detractors;
      const npsScore = total > 0
        ? Math.round(((promoters - detractors) / total) * 100)
        : 0;

      return {
        csat: {
          average: csatAverage,
          count: csatFeedback?.length || 0,
          distribution: csatDistribution
        },
        nps: {
          score: npsScore,
          promoters,
          passives,
          detractors,
          total
        },
        period: { start, end }
      };
    } catch (error) {
      console.error('❌ Erro ao gerar relatório semanal:', error);
      throw error;
    }
  }
}

// Singleton
let feedbackAgentInstance: FeedbackAgent | null = null;

export function getFeedbackAgent(): FeedbackAgent {
  if (!feedbackAgentInstance) {
    feedbackAgentInstance = new FeedbackAgent();
  }
  return feedbackAgentInstance;
}

export const feedbackAgent = getFeedbackAgent();

export default feedbackAgent;
