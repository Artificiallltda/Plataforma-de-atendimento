/**
 * Parser de Eventos do WhatsApp Cloud API
 * 
 * Converte payloads da WhatsApp Cloud API em mensagens normalizadas.
 * 
 * @see https://developers.facebook.com/docs/whatsapp/cloud-api/webhooks/components
 */

export interface WhatsAppMessage {
  from: string;
  id: string;
  timestamp: string;
  type: 'text' | 'image' | 'audio' | 'document' | 'video' | 'sticker' | 'location' | 'contacts';
  text?: { body: string };
  image?: { mime_type: string; sha256: string; id: string; caption?: string };
  audio?: { mime_type: string; sha256: string; id: string };
  document?: { mime_type: string; sha256: string; id: string; filename: string; caption?: string };
  video?: { mime_type: string; sha256: string; id: string; caption?: string };
}

export interface WhatsAppStatus {
  id: string;
  status: 'sent' | 'delivered' | 'read' | 'failed';
  timestamp: string;
  recipient_id: string;
  errors?: Array<{ code: number; title: string; detail: string }>;
}

export interface WhatsAppChange {
  value: {
    messaging_product: 'whatsapp';
    metadata: {
      display_phone_number: string;
      phone_number_id: string;
    };
    messages?: WhatsAppMessage[];
    statuses?: WhatsAppStatus[];
  };
  field: 'messages';
}

export interface WhatsAppEntry {
  id: string;
  changes: WhatsAppChange[];
}

export interface WhatsAppWebhookPayload {
  object: 'whatsapp_business_account';
  entry: WhatsAppEntry[];
}

export interface ParsedMessage {
  type: 'message' | 'status';
  channelId: string;
  phoneNumber: string;
  messages?: Array<{
    externalId: string;
    from: string;
    body: string;
    mediaUrl?: string;
    mediaType?: 'audio' | 'image' | 'document' | 'video';
    timestamp: Date;
    rawPayload: WhatsAppMessage;
  }>;
  statuses?: Array<{
    externalId: string;
    status: 'sent' | 'delivered' | 'read' | 'failed';
    timestamp: Date;
    recipientId: string;
    error?: { code: number; title: string; detail: string };
    rawPayload: WhatsAppStatus;
  }>;
}

/**
 * Parser principal de eventos do WhatsApp
 * 
 * @param payload - Payload completo do webhook
 * @returns Mensagens e statuses parseados
 */
export function parseWhatsAppEvent(payload: WhatsAppWebhookPayload): ParsedMessage[] {
  const results: ParsedMessage[] = [];

  for (const entry of payload.entry) {
    for (const change of entry.changes) {
      if (change.field !== 'messages') {
        continue;
      }

      const parsed: ParsedMessage = {
        type: 'message',
        channelId: entry.id,
        phoneNumber: change.value.metadata.display_phone_number,
        messages: [],
        statuses: []
      };

      // Parse mensagens recebidas
      if (change.value.messages) {
        parsed.type = 'message';
        
        for (const message of change.value.messages) {
          const parsedMessage = parseMessage(message);
          if (parsedMessage) {
            parsed.messages!.push(parsedMessage);
          }
        }
      }

      // Parse statuses
      if (change.value.statuses) {
        for (const status of change.value.statuses) {
          const parsedStatus = parseStatus(status);
          if (parsedStatus) {
            if (parsed.statuses!.length === 0) {
              parsed.type = 'status';
            }
            parsed.statuses!.push(parsedStatus);
          }
        }
      }

      // Adiciona apenas se tiver mensagens ou statuses
      if (parsed.messages!.length > 0 || parsed.statuses!.length > 0) {
        results.push(parsed);
      }
    }
  }

  return results;
}

/**
 * Parse uma mensagem individual
 */
function parseMessage(message: WhatsAppMessage): NonNullable<ParsedMessage['messages']>[number] | null {
  const baseMessage = {
    externalId: message.id,
    from: message.from,
    body: '',
    timestamp: new Date(parseInt(message.timestamp) * 1000),
    rawPayload: message
  };

  // Extrair conteúdo baseado no tipo
  switch (message.type) {
    case 'text':
      return {
        ...baseMessage,
        body: message.text?.body || ''
      };

    case 'image':
      return {
        ...baseMessage,
        body: message.image?.caption || '',
        mediaUrl: message.image?.id, // ID para download posterior
        mediaType: 'image'
      };

    case 'audio':
      return {
        ...baseMessage,
        mediaUrl: message.audio?.id,
        mediaType: 'audio'
      };

    case 'document':
      return {
        ...baseMessage,
        body: message.document?.caption || '',
        mediaUrl: message.document?.id,
        mediaType: 'document'
      };

    case 'video':
      return {
        ...baseMessage,
        body: message.video?.caption || '',
        mediaUrl: message.video?.id,
        mediaType: 'video'
      };

    default:
      // Tipos não suportados ainda (sticker, location, contacts)
      console.log(`Tipo de mensagem não suportado: ${message.type}`);
      return null;
  }
}

/**
 * Parse um status individual
 */
function parseStatus(status: WhatsAppStatus): NonNullable<ParsedMessage['statuses']>[number] | null {
  return {
    externalId: status.id,
    status: status.status,
    timestamp: new Date(parseInt(status.timestamp) * 1000),
    recipientId: status.recipient_id,
    error: status.errors?.[0],
    rawPayload: status
  };
}

export default {
  parseWhatsAppEvent,
  parseMessage,
  parseStatus
};
