/**
 * Handoff Notifier
 *
 * Avisa atendentes humanos imediatamente quando um ticket é transbordado.
 * Best-effort: nunca lança exceção que possa quebrar o fluxo principal.
 *
 * Canais suportados (configurados via .env):
 * - SLACK_WEBHOOK_URL: incoming webhook do canal de atendimento
 *
 * Sem nenhum canal configurado, apenas registra um warn no log.
 */

import { logger } from '../utils/logger';

interface HandoffPayload {
  ticketId: string;
  channel: 'whatsapp' | 'telegram' | 'web';
  sector: string;
  customerId: string;
  intent?: string;
  lastUserMessage: string;
}

const DASHBOARD_URL = process.env.FRONTEND_URL || process.env.DASHBOARD_URL || '';

function buildDashboardLink(ticketId: string): string {
  if (!DASHBOARD_URL) return '';
  const base = DASHBOARD_URL.replace(/\/$/, '');
  return `${base}/inbox/${ticketId}`;
}

async function notifySlack(payload: HandoffPayload): Promise<boolean> {
  const url = process.env.SLACK_WEBHOOK_URL;
  if (!url) return false;

  const link = buildDashboardLink(payload.ticketId);
  const title = `:rotating_light: Handoff humano — *${payload.sector.toUpperCase()}*`;
  const fields = [
    `*Canal:* ${payload.channel}`,
    `*Ticket:* ${payload.ticketId}`,
    `*Cliente:* ${payload.customerId}`,
    `*Intenção:* ${payload.intent || 'n/d'}`,
    `*Última mensagem:* ${payload.lastUserMessage.slice(0, 280)}`,
  ];
  if (link) fields.push(`*Abrir no Dashboard:* ${link}`);

  const body = JSON.stringify({
    text: [title, '', ...fields].join('\n'),
  });

  try {
    const resp = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body,
    });
    if (!resp.ok) {
      logger.warn('[HandoffNotifier] Slack respondeu não-OK', {
        status: resp.status,
        ticketId: payload.ticketId,
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('[HandoffNotifier] Erro enviando Slack', {
      error: err instanceof Error ? err.message : err,
      ticketId: payload.ticketId,
    });
    return false;
  }
}

export async function notifyHumanHandoff(payload: HandoffPayload): Promise<{ slack: boolean }> {
  const slackOk = await notifySlack(payload);
  if (!slackOk && !process.env.SLACK_WEBHOOK_URL) {
    logger.warn('[HandoffNotifier] Nenhum canal de notificação humana configurado', {
      ticketId: payload.ticketId,
    });
  }
  return { slack: slackOk };
}
