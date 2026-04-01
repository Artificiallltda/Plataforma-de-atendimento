/**
 * Validator do Webhook WhatsApp
 * 
 * Valida o token de verificação durante o handshake inicial com a Meta.
 * 
 * @see https://developers.facebook.com/docs/graph-api/webhooks/getting-started
 */

import { whatsappConfig } from '../config/whatsapp';

export interface WebhookVerificationRequest {
  'hub.mode': string;
  'hub.verify_token': string;
  'hub.challenge': string;
}

/**
 * Valida o token de verificação do webhook
 * 
 * @param request - Request do handshake da Meta
 * @returns true se o token for válido
 */
export function verifyWebhookToken(request: WebhookVerificationRequest): boolean {
  return request['hub.verify_token'] === whatsappConfig.verifyToken;
}

/**
 * Extrai o challenge para resposta do handshake
 * 
 * @param request - Request do handshake da Meta
 * @returns Challenge string se válido, null se inválido
 */
export function getChallenge(request: WebhookVerificationRequest): string | null {
  if (request['hub.mode'] !== 'subscribe') {
    return null;
  }
  
  if (!verifyWebhookToken(request)) {
    return null;
  }
  
  return request['hub.challenge'];
}

/**
 * Valida assinatura do payload (opcional, para segurança adicional)
 * 
 * @param signature - X-Hub-Signature-256 header
 * @param payload - Raw body do webhook
 * @returns true se a assinatura for válida
 */
export async function verifyPayloadSignature(
  signature: string,
  payload: Buffer
): Promise<boolean> {
  // Implementação opcional para validação de assinatura HMAC
  // Meta envia X-Hub-Signature-256: sha256=<hash>
  
  if (!signature || !signature.startsWith('sha256=')) {
    return false;
  }
  
  const crypto = await import('crypto');
  const expectedSignature = signature.replace('sha256=', '');
  const appSecret = process.env.WHATSAPP_APP_SECRET;
  
  if (!appSecret) {
    console.warn('WHATSAPP_APP_SECRET não configurado - pulando validação de assinatura');
    return true; // Permite passar se secret não estiver configurada
  }
  
  const hmac = crypto.createHmac('sha256', appSecret);
  hmac.update(payload);
  const computedSignature = hmac.digest('hex');
  
  return computedSignature === expectedSignature;
}

export default {
  verifyWebhookToken,
  getChallenge,
  verifyPayloadSignature
};
