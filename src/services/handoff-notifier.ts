/**
 * Handoff Notifier
 *
 * Avisa atendentes humanos imediatamente quando um ticket é transbordado.
 * Best-effort: nunca lança exceção que possa quebrar o fluxo principal.
 *
 * Estado atual (3 atendentes acompanhando tela): notificação Slack desligada.
 *   Sem variáveis configuradas, esta função apenas registra um log e retorna.
 *   O Realtime do Dashboard cobre os atendentes que estão com a aba aberta.
 *
 * Quando a equipe crescer (5+ atendentes ou expediente fora do horário),
 * basta criar 1 app Slack ("PAA Handoff Bot") e gerar 3 incoming webhooks,
 * um por canal/setor. Setar as envs abaixo e o roteamento por setor já
 * funciona sem mexer em código.
 *
 * Variáveis (todas opcionais):
 *   SLACK_WEBHOOK_SUPORTE     → canal #paa-suporte
 *   SLACK_WEBHOOK_FINANCEIRO  → canal #paa-financeiro
 *   SLACK_WEBHOOK_COMERCIAL   → canal #paa-comercial
 *   SLACK_WEBHOOK_DEFAULT     → fallback se setor não tiver webhook próprio
 *   SLACK_WEBHOOK_URL         → DEPRECATED, mantido por back-compat (= DEFAULT)
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

/**
 * Resolve o webhook do Slack para o setor do ticket.
 * Ordem: setor específico → DEFAULT → SLACK_WEBHOOK_URL (legado).
 */
function resolveSlackWebhook(sector: string): string | undefined {
  const normalized = (sector || '').toLowerCase();
  const map: Record<string, string | undefined> = {
    suporte: process.env.SLACK_WEBHOOK_SUPORTE,
    financeiro: process.env.SLACK_WEBHOOK_FINANCEIRO,
    comercial: process.env.SLACK_WEBHOOK_COMERCIAL,
  };
  return (
    map[normalized] ||
    process.env.SLACK_WEBHOOK_DEFAULT ||
    process.env.SLACK_WEBHOOK_URL
  );
}

async function notifySlack(payload: HandoffPayload): Promise<boolean> {
  const url = resolveSlackWebhook(payload.sector);
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
        sector: payload.sector,
        ticketId: payload.ticketId,
      });
      return false;
    }
    return true;
  } catch (err) {
    logger.warn('[HandoffNotifier] Erro enviando Slack', {
      error: err instanceof Error ? err.message : err,
      sector: payload.sector,
      ticketId: payload.ticketId,
    });
    return false;
  }
}

export async function notifyHumanHandoff(
  payload: HandoffPayload
): Promise<{ slack: boolean }> {
  const slackOk = await notifySlack(payload);
  if (!slackOk && !resolveSlackWebhook(payload.sector)) {
    // Caminho atual: 3 atendentes acompanhando Dashboard. Apenas log.
    logger.info('[HandoffNotifier] Slack desligado para este setor — Dashboard cobre via Realtime', {
      sector: payload.sector,
      ticketId: payload.ticketId,
    });
  }
  return { slack: slackOk };
}
