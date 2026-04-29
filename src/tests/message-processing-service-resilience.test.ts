/**
 * Testes de RESILIÊNCIA do Message Processing Service.
 *
 * Cobertura: comportamento quando o LLM (Vertex AI) está caído.
 *
 * Cenários cobertos:
 *   1. Router falhou (intent='erro_classificacao') → MPS NÃO chama agente especialista,
 *      escala direto pra humano com mensagem honesta, ticket vira 'aguardando_humano'.
 *   2. Router OK + agente especialista lança exceção → MPS captura, escala pra humano
 *      com mensagem honesta (NÃO devolve resposta clichê tipo "Entendi, vou verificar").
 *   3. Agente retorna resposta vazia → trata como falha e escala.
 *
 * Origem: incidente em produção (2026-04-29) onde billing GCP foi desabilitado, o LLM
 * caiu, Router devolveu erro_classificacao, MPS chamou agente especialista, agente caiu
 * no catch genérico devolvendo "Entendi seu problema, vou verificar..." e cliente ficou
 * mudo. Estes testes garantem que isso não pode acontecer de novo.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';

// ===== MOCKS =====

// Supabase: shape mínimo que o MPS toca. update().eq() precisa resolver.
const supabaseTicketUpdates: Array<{ status: string; priority?: string }> = [];

vi.mock('../config/supabase', () => {
  // Cadeia "thenable": qualquer chamada chained termina retornando o próprio chain,
  // que é await-able (resolve com { data, error }). Cobre TODOS os padrões usados
  // pelo MPS sem ter que enumerar cada combinação:
  //   .select(...).eq(...).in(...).order(...).limit(...).single()
  //   .update(...).eq(...)
  //   .update(...).eq(...).is(...)
  //   .insert(...).select().single()
  // O sniff de updates é feito interceptando `update(payload)` antes de devolver o chain.
  const chain: any = {};
  const passthrough = (name: string) => {
    chain[name] = vi.fn(() => chain);
  };
  ['select', 'eq', 'in', 'order', 'limit', 'is', 'neq', 'gt', 'lt', 'gte', 'lte'].forEach(passthrough);

  // Resolução padrão: ticket existente, status 'bot_ativo'
  chain.single = vi.fn().mockResolvedValue({
    data: { id: 'ticket-test-1', status: 'bot_ativo', sector: 'suporte' },
    error: null,
  });

  // insert pode terminar com .select().single() OU ser awaited diretamente
  chain.insert = vi.fn(() => {
    const insertChain: any = {};
    insertChain.select = vi.fn(() => insertChain);
    insertChain.single = vi.fn().mockResolvedValue({ data: { id: 'ticket-test-1' }, error: null });
    insertChain.then = (resolve: any) => resolve({ data: null, error: null });
    return insertChain;
  });

  chain.update = vi.fn((payload: any) => {
    supabaseTicketUpdates.push(payload);
    return chain;
  });

  // Torna o chain "await-able" para padrões tipo `await supabase.from(x).update(y).eq(z)`
  chain.then = (resolve: any) => resolve({ data: null, error: null });

  const supabaseMock = {
    from: vi.fn(() => chain),
  };

  return {
    getSupabaseClient: vi.fn(() => supabaseMock),
    supabase: supabaseMock,
  };
});

// Logger
vi.mock('../utils/logger', () => ({
  logger: {
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
  },
}));

// Handoff notifier (best-effort, não deve quebrar o fluxo)
vi.mock('../services/handoff-notifier', () => ({
  notifyHumanHandoff: vi.fn().mockResolvedValue({ slack: false }),
}));

// updateTicketCurrentAgent — utilitário, não interessa pro teste
vi.mock('../types/handoff', () => ({
  updateTicketCurrentAgent: vi.fn().mockResolvedValue(undefined),
}));

// === MOCKS DOS AGENTES ===
// Router: controlamos por mock por teste. Default = sucesso.
const routerClassifyMock = vi.fn();
const routerGetCustomerContextMock = vi.fn().mockResolvedValue(null);
vi.mock('../agents/router-agent', () => ({
  getRouterAgent: vi.fn(() => ({
    classify: routerClassifyMock,
    getCustomerContext: routerGetCustomerContextMock,
  })),
}));

const supportProcessMessageMock = vi.fn();
vi.mock('../agents/support-agent', () => ({
  getSupportAgent: vi.fn(() => ({
    processMessage: supportProcessMessageMock,
  })),
}));

const salesProcessMessageMock = vi.fn();
vi.mock('../agents/sales-agent', () => ({
  getSalesAgent: vi.fn(() => ({
    processMessage: salesProcessMessageMock,
  })),
}));

const financeProcessMessageMock = vi.fn();
vi.mock('../agents/finance-agent', () => ({
  getFinanceAgent: vi.fn(() => ({
    processMessage: financeProcessMessageMock,
  })),
}));

// ===== TESTES =====

describe('MessageProcessingService — Resiliência (LLM caído)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    supabaseTicketUpdates.length = 0;
    // Reset default: router OK
    routerClassifyMock.mockResolvedValue({
      sector: 'suporte',
      intent: 'duvida_tecnica',
      confidence: 0.9,
      priority: 'media',
      suggestedAgent: 'support',
      needsClarification: false,
      humanResponse: 'Beleza, manda ver.',
    });
  });

  describe('Cenário 1: Router em fallback (intent=erro_classificacao)', () => {
    it('deve escalar DIRETO para humano sem chamar agente especialista', async () => {
      // ARRANGE: Router devolve fallback (LLM caído)
      routerClassifyMock.mockResolvedValueOnce({
        sector: 'suporte',
        intent: 'erro_classificacao',
        confidence: 0.3,
        priority: 'media',
        suggestedAgent: 'support',
        needsClarification: true,
        humanResponse: 'Estou com instabilidade no momento. Pode repetir sua mensagem?',
      });

      const { processIncomingMessage } = await import('../services/message-processing-service');

      // ACT
      const result = await processIncomingMessage({
        id: 'msg-1',
        channel: 'telegram',
        customer_id: 'cust-1',
        ticket_id: 'ticket-test-1',
        body: 'preciso de ajuda',
      });

      // ASSERT: nenhum agente especialista foi chamado
      expect(supportProcessMessageMock).not.toHaveBeenCalled();
      expect(salesProcessMessageMock).not.toHaveBeenCalled();
      expect(financeProcessMessageMock).not.toHaveBeenCalled();

      // ASSERT: cliente recebe mensagem honesta (NÃO clichê)
      expect(result.clarificationMessage).toBeTruthy();
      expect(result.clarificationMessage).toMatch(/instabilidade|humano|colega/i);
      expect(result.clarificationMessage).not.toMatch(/rede neural|vou verificar.*já te retorno/i);

      // ASSERT: ticket foi marcado como aguardando_humano
      const aguardandoHumano = supabaseTicketUpdates.find(u => u.status === 'aguardando_humano');
      expect(aguardandoHumano).toBeDefined();
      expect(aguardandoHumano?.priority).toBe('alta');
    });

    it('deve disparar notifyHumanHandoff quando Router falha', async () => {
      routerClassifyMock.mockResolvedValueOnce({
        sector: 'suporte',
        intent: 'erro_classificacao',
        confidence: 0.3,
        priority: 'media',
        suggestedAgent: 'support',
        needsClarification: true,
      });

      const { processIncomingMessage } = await import('../services/message-processing-service');
      const { notifyHumanHandoff } = await import('../services/handoff-notifier');

      await processIncomingMessage({
        id: 'msg-2',
        channel: 'telegram',
        customer_id: 'cust-2',
        ticket_id: 'ticket-test-1',
        body: 'preciso de ajuda',
      });

      expect(notifyHumanHandoff).toHaveBeenCalledTimes(1);
      const call = (notifyHumanHandoff as any).mock.calls[0][0];
      expect(call.sector).toBe('suporte');
      expect(call.intent).toBe('erro_classificacao');
      expect(call.lastUserMessage).toBe('preciso de ajuda');
    });
  });

  describe('Cenário 2: Router OK + Agente especialista lança exceção', () => {
    it('deve capturar exceção do support-agent e escalar com mensagem honesta', async () => {
      // Router OK, mas agente especialista quebra (LLM falhou pra ele tb)
      supportProcessMessageMock.mockRejectedValueOnce(
        new Error('GoogleApiError: This API method requires billing to be enabled')
      );

      const { processIncomingMessage } = await import('../services/message-processing-service');

      const result = await processIncomingMessage({
        id: 'msg-3',
        channel: 'telegram',
        customer_id: 'cust-3',
        ticket_id: 'ticket-test-1',
        body: 'tô com erro pra logar',
      });

      // ASSERT: cliente NÃO recebe a frase clichê do bug original
      expect(result.clarificationMessage).not.toContain('Entendi seu problema');
      expect(result.clarificationMessage).not.toContain('rede neural');

      // ASSERT: cliente recebe mensagem honesta de instabilidade
      expect(result.clarificationMessage).toMatch(/instabilidade|humano|colega/i);

      // ASSERT: ticket foi escalado
      const aguardandoHumano = supabaseTicketUpdates.find(u => u.status === 'aguardando_humano');
      expect(aguardandoHumano).toBeDefined();
    });

    it('deve escalar quando finance-agent lança', async () => {
      routerClassifyMock.mockResolvedValueOnce({
        sector: 'financeiro',
        intent: 'duvida_fatura',
        confidence: 0.85,
        priority: 'media',
        suggestedAgent: 'finance',
        needsClarification: false,
      });
      financeProcessMessageMock.mockRejectedValueOnce(new Error('Vertex 503'));

      const { processIncomingMessage } = await import('../services/message-processing-service');

      const result = await processIncomingMessage({
        id: 'msg-4',
        channel: 'telegram',
        customer_id: 'cust-4',
        ticket_id: 'ticket-test-1',
        body: 'minha fatura tá errada',
      });

      expect(result.clarificationMessage).toMatch(/instabilidade|humano|colega/i);
      const aguardandoHumano = supabaseTicketUpdates.find(u => u.status === 'aguardando_humano');
      expect(aguardandoHumano).toBeDefined();
    });

    it('deve escalar quando sales-agent lança', async () => {
      routerClassifyMock.mockResolvedValueOnce({
        sector: 'comercial',
        intent: 'consulta_preco',
        confidence: 0.9,
        priority: 'media',
        suggestedAgent: 'sales',
        needsClarification: false,
      });
      salesProcessMessageMock.mockRejectedValueOnce(new Error('LLM timeout'));

      const { processIncomingMessage } = await import('../services/message-processing-service');

      const result = await processIncomingMessage({
        id: 'msg-5',
        channel: 'telegram',
        customer_id: 'cust-5',
        ticket_id: 'ticket-test-1',
        body: 'quanto custa o premium?',
      });

      expect(result.clarificationMessage).toMatch(/instabilidade|humano|colega/i);
    });
  });

  describe('Cenário 3: Agente devolve resposta vazia (defesa em profundidade)', () => {
    it('deve escalar quando agente devolve string vazia sem flag de handoff', async () => {
      // Caso patológico: agente devolveu '' mas needsHumanHandoff=false. Sem o guard,
      // o cliente ficaria mudo. O guard transforma isso em escalada honesta.
      supportProcessMessageMock.mockResolvedValueOnce({
        response: '',
        action: 'responded',
        confidence: 0.5,
        needsHumanHandoff: false,
      });

      const { processIncomingMessage } = await import('../services/message-processing-service');

      const result = await processIncomingMessage({
        id: 'msg-6',
        channel: 'telegram',
        customer_id: 'cust-6',
        ticket_id: 'ticket-test-1',
        body: 'oi',
      });

      expect(result.clarificationMessage).toBeTruthy();
      expect(result.clarificationMessage).toMatch(/instabilidade|humano|colega/i);

      const aguardandoHumano = supabaseTicketUpdates.find(u => u.status === 'aguardando_humano');
      expect(aguardandoHumano).toBeDefined();
    });
  });

  describe('Caminho feliz (sanity check — não regredir)', () => {
    it('deve devolver resposta do agente quando tudo funciona', async () => {
      supportProcessMessageMock.mockResolvedValueOnce({
        response: 'Vou te ajudar com seu login. Você consegue acessar agora?',
        action: 'responded',
        confidence: 0.92,
        needsHumanHandoff: false,
      });

      const { processIncomingMessage } = await import('../services/message-processing-service');

      const result = await processIncomingMessage({
        id: 'msg-happy',
        channel: 'telegram',
        customer_id: 'cust-happy',
        ticket_id: 'ticket-test-1',
        body: 'tô com erro pra logar',
      });

      expect(supportProcessMessageMock).toHaveBeenCalledTimes(1);
      expect(result.clarificationMessage).toContain('Vou te ajudar com seu login');
      // Não escalou
      const aguardandoHumano = supabaseTicketUpdates.find(u => u.status === 'aguardando_humano');
      expect(aguardandoHumano).toBeUndefined();
    });
  });
});
