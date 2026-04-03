import { FastifyInstance } from 'fastify';
import { feedbackAgent } from '../agents/feedback-agent';
import { getSupabaseClient } from '../config/supabase';

const supabase = getSupabaseClient();

export async function registerFeedbackTriggerRoutes(fastify: FastifyInstance) {
  /**
   * POST /api/feedback-trigger
   * Dispara o envio de CSAT para um ticket resolvido
   */
  fastify.post('/api/feedback-trigger', async (request, reply) => {
    const { ticketId } = request.body as any;

    if (!ticketId) {
      return reply.status(400).send({ error: 'ticketId é obrigatório' });
    }

    try {
      fastify.log.info(`Disparando feedback para ticket: ${ticketId}`);

      // 1. Buscar dados do ticket para garantir que existe e obter customer_id/channel
      const { data, error: ticketError } = await supabase
        .from('tickets')
        .select('id, customer_id, channel, status')
        .eq('id', ticketId)
        .single();

      const ticket = data as any;

      if (ticketError || !ticket) {
        return reply.status(404).send({ error: 'Ticket não encontrado' });
      }

      // 2. Acionar o agente de feedback
      const result = await feedbackAgent.sendCsatSurvey(
        ticket.id, 
        ticket.customer_id!, 
        ticket.channel as any
      );

      return reply.send({ 
        message: 'Gatilho de feedback processado',
        result 
      });

    } catch (err: any) {
      fastify.log.error(err, 'Erro ao disparar feedback');
      return reply.status(500).send({ error: 'Erro interno ao disparar feedback' });
    }
  });
}
