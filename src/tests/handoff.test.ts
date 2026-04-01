/**
 * Testes unitários do Handoff
 * 
 * Testa criação, persistência e atualização de handoffs.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import {
  createHandoffFromRouter,
  persistHandoff,
  updateTicketCurrentAgent,
  AgentHandoff,
  CustomerProfile
} from '../types/handoff';

// Mock do Supabase
vi.mock('../config/supabase', () => {
  return {
    supabase: {
      from: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis()
    }
  };
});

describe('Handoff Types', () => {
  describe('createHandoffFromRouter', () => {
    const baseParams = {
      ticketId: 'ticket-123',
      customerId: 'customer-456',
      customerProfile: {
        id: 'customer-456',
        name: 'João Silva',
        email: 'joao@example.com',
        channel: 'whatsapp' as const,
        channelUserId: '+5517987654321',
        plan: 'premium' as const
      },
      messages: [
        {
          id: 'msg-1',
          sender: 'customer' as const,
          body: 'não consigo acessar minha conta',
          timestamp: new Date()
        }
      ],
      routerOutput: {
        sector: 'suporte' as const,
        intent: 'erro_de_acesso',
        confidence: 0.92,
        suggestedAgent: 'support' as const
      },
      channel: 'whatsapp' as const
    };

    it('deve criar handoff com todos os campos obrigatórios', () => {
      const handoff = createHandoffFromRouter(
        baseParams.ticketId,
        baseParams.customerId,
        baseParams.customerProfile,
        baseParams.messages,
        baseParams.routerOutput,
        baseParams.channel
      );

      expect(handoff.handoffId).toBeDefined();
      expect(handoff.handoffId).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i);
      expect(handoff.ticketId).toBe('ticket-123');
      expect(handoff.from).toBe('router');
      expect(handoff.to).toBe('support');
      expect(handoff.sector).toBe('suporte');
      expect(handoff.intent).toBe('erro_de_acesso');
      expect(handoff.confidence).toBe(0.92);
      expect(handoff.urgency).toBe('medium');
      expect(handoff.channel).toBe('whatsapp');
      expect(handoff.language).toBe('pt-BR');
    });

    it('deve incluir contexto das mensagens (últimas 10)', () => {
      const manyMessages = Array.from({ length: 15 }, (_, i) => ({
        id: `msg-${i}`,
        sender: 'customer' as const,
        body: `mensagem ${i}`,
        timestamp: new Date()
      }));

      const handoff = createHandoffFromRouter(
        baseParams.ticketId,
        baseParams.customerId,
        baseParams.customerProfile,
        manyMessages,
        baseParams.routerOutput,
        baseParams.channel
      );

      expect(handoff.context.length).toBeLessThanOrEqual(10);
      expect(handoff.context.length).toBe(10);
    });

    it('deve incluir customerProfile completo', () => {
      const handoff = createHandoffFromRouter(
        baseParams.ticketId,
        baseParams.customerId,
        baseParams.customerProfile,
        baseParams.messages,
        baseParams.routerOutput,
        baseParams.channel
      );

      expect(handoff.customerProfile.id).toBe('customer-456');
      expect(handoff.customerProfile.name).toBe('João Silva');
      expect(handoff.customerProfile.channel).toBe('whatsapp');
      expect(handoff.customerProfile.channelUserId).toBe('+5517987654321');
    });

    it('deve mapear setor financeiro para agente finance', () => {
      const handoff = createHandoffFromRouter(
        baseParams.ticketId,
        baseParams.customerId,
        baseParams.customerProfile,
        baseParams.messages,
        { ...baseParams.routerOutput, sector: 'financeiro', suggestedAgent: 'finance' },
        baseParams.channel
      );

      expect(handoff.to).toBe('finance');
      expect(handoff.sector).toBe('financeiro');
    });

    it('deve mapear setor comercial para agente sales', () => {
      const handoff = createHandoffFromRouter(
        baseParams.ticketId,
        baseParams.customerId,
        baseParams.customerProfile,
        baseParams.messages,
        { ...baseParams.routerOutput, sector: 'comercial', suggestedAgent: 'sales' },
        baseParams.channel
      );

      expect(handoff.to).toBe('sales');
      expect(handoff.sector).toBe('comercial');
    });
  });
});

describe('Handoff Persistence', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve persistir handoff no Supabase com sucesso', async () => {
    const { supabase } = await import('../config/supabase');
    
    (supabase.from as any).mockReturnValue({
      insert: vi.fn().mockResolvedValue({ error: null })
    });

    const handoff: AgentHandoff = {
      handoffId: 'handoff-123',
      ticketId: 'ticket-456',
      timestamp: new Date(),
      from: 'router',
      to: 'support',
      context: [],
      customerProfile: {
        id: 'customer-789',
        channel: 'whatsapp',
        channelUserId: '+5517987654321'
      },
      sector: 'suporte',
      intent: 'erro_de_acesso',
      confidence: 0.92,
      urgency: 'medium',
      channel: 'whatsapp',
      language: 'pt-BR'
    };

    const result = await persistHandoff(handoff);

    expect(result.success).toBe(true);
    expect(supabase.from).toHaveBeenCalledWith('handoffs');
  });

  it('deve retornar erro quando persistência falha', async () => {
    const { supabase } = await import('../config/supabase');
    
    (supabase.from as any).mockReturnValue({
      insert: vi.fn().mockResolvedValue({ 
        error: { message: 'Erro de banco de dados' } 
      })
    });

    const handoff: AgentHandoff = {
      handoffId: 'handoff-123',
      ticketId: 'ticket-456',
      timestamp: new Date(),
      from: 'router',
      to: 'support',
      context: [],
      customerProfile: {
        id: 'customer-789',
        channel: 'whatsapp',
        channelUserId: '+5517987654321'
      },
      sector: 'suporte',
      intent: 'erro_de_acesso',
      confidence: 0.92,
      urgency: 'medium',
      channel: 'whatsapp',
      language: 'pt-BR'
    };

    const result = await persistHandoff(handoff);

    expect(result.success).toBe(false);
    expect(result.error).toBe('Erro de banco de dados');
  });
});

describe('Ticket Updates', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('deve atualizar currentAgent e sector do ticket', async () => {
    const { supabase } = await import('../config/supabase');
    
    (supabase.from as any).mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockResolvedValue({ error: null })
    });

    await updateTicketCurrentAgent('ticket-123', 'support', 'suporte');

    expect(supabase.from).toHaveBeenCalledWith('tickets');
    expect((supabase.from as any).mock.results[0].value.update).toHaveBeenCalledWith({
      currentAgent: 'support',
      sector: 'suporte'
    });
  });

  it('deve lidar com erro silenciosamente', async () => {
    const { supabase } = await import('../config/supabase');
    
    (supabase.from as any).mockReturnValue({
      update: vi.fn().mockReturnThis(),
      eq: vi.fn().mockRejectedValue(new Error('Erro de banco'))
    });

    // Não deve lançar erro
    await expect(updateTicketCurrentAgent('ticket-123', 'support', 'suporte'))
      .resolves.not.toThrow();
  });
});
