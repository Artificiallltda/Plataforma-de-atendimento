/**
 * Testes unitários do Webhook WhatsApp
 * 
 * Testa handshake, recebimento de mensagens e statuses.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { parseWhatsAppEvent } from '../parsers/whatsapp-parser';

// Mock do config para evitar dependência de variáveis de ambiente
vi.mock('../config/whatsapp', () => ({
  whatsappConfig: {
    verifyToken: 'test_verify_token'
  },
  validateWhatsappConfig: vi.fn()
}));

import { verifyWebhookToken, getChallenge } from '../validators/whatsapp-webhook-validator';

// Mock do Fastify
const mockReply = () => ({
  code: vi.fn().mockReturnThis(),
  send: vi.fn()
});

const mockRequest = (query: any, body?: any, headers?: any) => ({
  query,
  body,
  headers
});

describe('WhatsApp Webhook', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('verifyWebhookToken', () => {
    it('deve validar token correto', () => {
      const result = verifyWebhookToken({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'test_verify_token',
        'hub.challenge': '123456'
      });
      expect(result).toBe(true);
    });

    it('deve rejeitar token incorreto', () => {
      const result = verifyWebhookToken({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': '123456'
      });
      expect(result).toBe(false);
    });
  });

  describe('getChallenge', () => {
    it('deve retornar challenge quando token válido', () => {
      const result = getChallenge({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'test_verify_token',
        'hub.challenge': 'challenge_123'
      });
      expect(result).toBe('challenge_123');
    });

    it('deve retornar null quando mode inválido', () => {
      const result = getChallenge({
        'hub.mode': 'unsubscribe',
        'hub.verify_token': 'test_verify_token',
        'hub.challenge': 'challenge_123'
      });
      expect(result).toBe(null);
    });

    it('deve retornar null quando token inválido', () => {
      const result = getChallenge({
        'hub.mode': 'subscribe',
        'hub.verify_token': 'wrong_token',
        'hub.challenge': 'challenge_123'
      });
      expect(result).toBe(null);
    });
  });

  describe('parseWhatsAppEvent', () => {
    it('deve parsear mensagem de texto', () => {
      const payload = {
        object: 'whatsapp_business_account' as const,
        entry: [{
          id: 'PHONE_NUMBER_ID',
          changes: [{
            value: {
              messaging_product: 'whatsapp' as const,
              metadata: {
                display_phone_number: '+5517999999999',
                phone_number_id: 'PHONE_NUMBER_ID'
              },
              messages: [{
                from: '5517987654321',
                id: 'wamid.test123',
                timestamp: '1234567890',
                type: 'text' as const,
                text: { body: 'Olá, preciso de ajuda' }
              }]
            },
            field: 'messages' as const
          }]
        }]
      };

      const result = parseWhatsAppEvent(payload);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('message');
      expect(result[0].messages).toHaveLength(1);
      const msg = result[0].messages![0];
      expect(msg.externalId).toBe('wamid.test123');
      expect(msg.from).toBe('5517987654321');
      expect(msg.body).toBe('Olá, preciso de ajuda');
    });

    it('deve parsear mensagem com imagem', () => {
      const payload = {
        object: 'whatsapp_business_account' as const,
        entry: [{
          id: 'PHONE_NUMBER_ID',
          changes: [{
            value: {
              messaging_product: 'whatsapp' as const,
              metadata: {
                display_phone_number: '+5517999999999',
                phone_number_id: 'PHONE_NUMBER_ID'
              },
              messages: [{
                from: '5517987654321',
                id: 'wamid.test456',
                timestamp: '1234567890',
                type: 'image' as const,
                image: {
                  mime_type: 'image/jpeg',
                  sha256: 'abc123',
                  id: 'media_id_123',
                  caption: 'Foto do problema'
                }
              }]
            },
            field: 'messages' as const
          }]
        }]
      };

      const result = parseWhatsAppEvent(payload);

      expect(result[0].messages![0]).toMatchObject({
        externalId: 'wamid.test456',
        body: 'Foto do problema',
        mediaType: 'image',
        mediaUrl: 'media_id_123'
      });
    });

    it('deve parsear status de entrega', () => {
      const payload = {
        object: 'whatsapp_business_account' as const,
        entry: [{
          id: 'PHONE_NUMBER_ID',
          changes: [{
            value: {
              messaging_product: 'whatsapp' as const,
              metadata: {
                display_phone_number: '+5517999999999',
                phone_number_id: 'PHONE_NUMBER_ID'
              },
              statuses: [{
                id: 'wamid.test789',
                status: 'delivered' as const,
                timestamp: '1234567890',
                recipient_id: '5517987654321'
              }]
            },
            field: 'messages' as const
          }]
        }]
      };

      const result = parseWhatsAppEvent(payload);

      expect(result).toHaveLength(1);
      expect(result[0].type).toBe('status');
      expect(result[0].statuses).toHaveLength(1);
      expect(result[0].statuses![0]).toMatchObject({
        externalId: 'wamid.test789',
        status: 'delivered',
        recipientId: '5517987654321'
      });
    });
  });
});
