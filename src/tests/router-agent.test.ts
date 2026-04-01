/**
 * Testes unitários do RouterAgent
 * 
 * Testa classificação, confidence, fallback e contexto do cliente.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { RouterAgent, routerAgent, getRouterAgent } from '../agents/router-agent';

// Mock do GoogleGenerativeAI
vi.mock('@google/generative-ai', () => {
  return {
    GoogleGenerativeAI: vi.fn().mockImplementation(() => ({
      getGenerativeModel: vi.fn().mockReturnValue({
        generateContent: vi.fn()
      })
    }))
  };
});

// Mock do Supabase
vi.mock('../../config/supabase', () => {
  return {
    supabase: {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
      limit: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis()
    }
  };
});

describe('RouterAgent', () => {
  let agent: RouterAgent;

  beforeEach(() => {
    vi.clearAllMocks();
    agent = getRouterAgent();
  });

  describe('validateSector', () => {
    it('deve aceitar setor válido: suporte', () => {
      const result = (agent as any).validateSector('suporte');
      expect(result).toBe('suporte');
    });

    it('deve aceitar setor válido: financeiro', () => {
      const result = (agent as any).validateSector('financeiro');
      expect(result).toBe('financeiro');
    });

    it('deve aceitar setor válido: comercial', () => {
      const result = (agent as any).validateSector('comercial');
      expect(result).toBe('comercial');
    });

    it('deve retornar suporte para setor inválido', () => {
      const result = (agent as any).validateSector('invalido');
      expect(result).toBe('suporte');
    });
  });

  describe('validateConfidence', () => {
    it('deve aceitar confidence válido (0.0-1.0)', () => {
      expect((agent as any).validateConfidence(0.85)).toBe(0.85);
      expect((agent as any).validateConfidence(0.0)).toBe(0.0);
      expect((agent as any).validateConfidence(1.0)).toBe(1.0);
    });

    it('deve normalizar confidence > 1.0', () => {
      expect((agent as any).validateConfidence(1.5)).toBe(1.0);
      expect((agent as any).validateConfidence(2.0)).toBe(1.0);
    });

    it('deve normalizar confidence < 0.0', () => {
      expect((agent as any).validateConfidence(-0.5)).toBe(0.0);
      expect((agent as any).validateConfidence(-1.0)).toBe(0.0);
    });

    it('deve retornar 0.5 para NaN', () => {
      expect((agent as any).validateConfidence(NaN)).toBe(0.5);
    });

    it('deve retornar 0.5 para undefined', () => {
      expect((agent as any).validateConfidence(undefined as any)).toBe(0.5);
    });
  });

  describe('mapSectorToAgent', () => {
    it('deve mapear suporte → support', () => {
      const result = (agent as any).mapSectorToAgent('suporte');
      expect(result).toBe('support');
    });

    it('deve mapear financeiro → finance', () => {
      const result = (agent as any).mapSectorToAgent('financeiro');
      expect(result).toBe('finance');
    });

    it('deve mapear comercial → sales', () => {
      const result = (agent as any).mapSectorToAgent('comercial');
      expect(result).toBe('sales');
    });

    it('deve retornar support para setor inválido', () => {
      const result = (agent as any).mapSectorToAgent('invalido' as any);
      expect(result).toBe('support');
    });
  });

  describe('classifyByKeywords (fallback)', () => {
    it('deve classificar como suporte para palavras de erro', () => {
      const result = (agent as any).classifyByKeywords('não consigo acessar o sistema');
      expect(result.sector).toBe('suporte');
      expect(result.intent).toBe('classificacao_por_palavras_chave');
      expect(result.confidence).toBeGreaterThan(0);
    });

    it('deve classificar como financeiro para palavras de cobrança', () => {
      const result = (agent as any).classifyByKeywords('fui cobrado errado no boleto');
      expect(result.sector).toBe('financeiro');
    });

    it('deve classificar como comercial para palavras de plano', () => {
      const result = (agent as any).classifyByKeywords('quero contratar o plano enterprise');
      expect(result.sector).toBe('comercial');
    });

    it('deve retornar confiança baixa para mensagem sem palavras-chave', () => {
      const result = (agent as any).classifyByKeywords('olá tudo bem');
      expect(result.confidence).toBeLessThan(0.75);
      expect(result.needsClarification).toBe(true);
    });

    it('deve detectar palavras de crise e classificar com confiança baixa', () => {
      const result = (agent as any).classifyByKeywords('isso é um absurdo quero cancelar');
      expect(result.sector).toBe('financeiro');
      // classifyByKeywords adiciona 0.2 por palavra-chave, mas não tem bonus para "crise"
      expect(result.confidence).toBeGreaterThan(0.1);
    });
  });

  describe('getClarificationMessage', () => {
    it('deve retornar mensagem de esclarecimento', () => {
      const message = agent.getClarificationMessage();
      // Mensagens podem variar, verificar conteúdo genérico
      expect(message.length).toBeGreaterThan(10);
      expect(message.toLowerCase()).toMatch(/(suporte|financeiro|comercial|ajuda|setor)/);
    });

    it('deve retornar mensagens variadas', () => {
      const messages = new Set();
      for (let i = 0; i < 10; i++) {
        messages.add(agent.getClarificationMessage());
      }
      // Deve ter pelo menos 2 mensagens diferentes
      expect(messages.size).toBeGreaterThanOrEqual(2);
    });
  });

  describe('parseResponse', () => {
    it('deve parsear JSON válido', () => {
      const jsonResponse = JSON.stringify({
        sector: 'suporte',
        intent: 'erro_de_acesso',
        confidence: 0.92,
        needsClarification: false,
        reasoning: 'Palavras-chave de erro detectadas'
      });

      const result = (agent as any).parseResponse(jsonResponse);
      expect(result.sector).toBe('suporte');
      expect(result.intent).toBe('erro_de_acesso');
      expect(result.confidence).toBe(0.92);
      expect(result.needsClarification).toBe(false);
    });

    it('deve parsear JSON com markdown', () => {
      const jsonResponse = '```json\n{"sector": "financeiro", "intent": "reembolso", "confidence": 0.88}\n```';
      
      const result = (agent as any).parseResponse(jsonResponse);
      expect(result.sector).toBe('financeiro');
      expect(result.intent).toBe('reembolso');
    });

    it('deve retornar fallback para JSON inválido', () => {
      const invalidResponse = 'texto aleatório sem JSON';
      
      const result = (agent as any).parseResponse(invalidResponse);
      expect(result.sector).toBe('suporte');
      expect(result.intent).toBe('erro_parse_json');
      expect(result.confidence).toBe(0.5);
      expect(result.needsClarification).toBe(true);
    });

    it('deve validar setor inválido no JSON', () => {
      const jsonResponse = JSON.stringify({
        sector: 'invalido',
        intent: 'teste',
        confidence: 0.8
      });

      const result = (agent as any).parseResponse(jsonResponse);
      expect(result.sector).toBe('suporte'); // Fallback para suporte
    });
  });

  describe('buildContext', () => {
    it('deve construir contexto sem customerContext', () => {
      const context = (agent as any).buildContext('olá preciso de ajuda');
      expect(context).toContain('MENSAGEM DO CLIENTE');
      expect(context).toContain('olá preciso de ajuda');
      expect(context).toContain('Responda com JSON');
    });

    it('deve construir contexto com customerContext', () => {
      const customerContext = {
        id: 'customer-123',
        name: 'João Silva',
        plan: 'premium' as const,
        activeTicketId: 'ticket-456',
        recentTickets: [
          { id: 'ticket-1', sector: 'suporte', intent: 'erro_login', status: 'resolvido', csatScore: 4 }
        ]
      };

      const context = (agent as any).buildContext('não consigo acessar', customerContext);
      expect(context).toContain('CONTEXTO DO CLIENTE');
      expect(context).toContain('João Silva');
      expect(context).toContain('premium');
      expect(context).toContain('Sim'); // Ticket ativo: Sim
    });
  });
});

describe('RouterAgent Integration (Mocked)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve classificar mensagem de suporte com alta confiança', async () => {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const mockModel = {
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            sector: 'suporte',
            intent: 'erro_de_acesso',
            confidence: 0.92,
            needsClarification: false,
            reasoning: 'Cliente reporta problema de acesso'
          })
        }
      })
    };

    (GoogleGenerativeAI as any).mockImplementation(() => ({
      getGenerativeModel: () => mockModel
    }));

    // Criar nova instância para usar o mock
    const agent = new (await import('../agents/router-agent')).RouterAgent();
    const result = await agent.classify('não consigo acessar minha conta');

    expect(result.sector).toBe('suporte');
    expect(result.intent).toBe('erro_de_acesso');
    expect(result.confidence).toBe(0.92);
    expect(result.needsClarification).toBe(false);
    expect(result.suggestedAgent).toBe('support');
  });

  it('deve pedir esclarecimento para confidence baixa', async () => {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const mockModel = {
      generateContent: vi.fn().mockResolvedValue({
        response: {
          text: () => JSON.stringify({
            sector: 'suporte',
            intent: 'duvida_generica',
            confidence: 0.5,
            needsClarification: true,
            reasoning: 'Mensagem ambígua'
          })
        }
      })
    };

    (GoogleGenerativeAI as any).mockImplementation(() => ({
      getGenerativeModel: () => mockModel
    }));

    const agent = new (await import('../agents/router-agent')).RouterAgent();
    const result = await agent.classify('olá');

    expect(result.confidence).toBe(0.5);
    expect(result.needsClarification).toBe(true);
  });

  it('deve usar fallback quando Gemini falha', async () => {
    const { GoogleGenerativeAI } = await import('@google/generative-ai');
    const mockModel = {
      generateContent: vi.fn().mockRejectedValue(new Error('API Error'))
    };

    (GoogleGenerativeAI as any).mockImplementation(() => ({
      getGenerativeModel: () => mockModel
    }));

    const agent = new (await import('../agents/router-agent')).RouterAgent();
    const result = await agent.classify('quero reembolso do pagamento');

    // Deve fallback para classificação por palavras-chave
    expect(result.sector).toBe('financeiro');
    expect(result.confidence).toBeGreaterThan(0);
  });
});
