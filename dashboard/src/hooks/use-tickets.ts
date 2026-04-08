/**
 * Hook useTickets - Gerenciamento de tickets com Realtime
 * 
 * Features:
 * - Carregamento com filtros
 * - Realtime com reconexão automática
 * - Suporte a diferentes visões (setor/admin)
 */

'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSupabaseRealtime } from './use-supabase-realtime';

export interface Ticket {
  id: string;
  customer_id: string;
  channel: 'whatsapp' | 'telegram' | 'web';
  sector: string | null;
  intent: string | null;
  status: 'novo' | 'bot_ativo' | 'aguardando_humano' | 'em_atendimento' | 'resolvido';
  priority: 'critica' | 'alta' | 'media' | 'baixa';
  current_agent: string | null;
  assigned_to: string | null;
  csat_score: number | null;
  router_confidence: number | null;
  created_at: string;
  resolved_at: string | null;
  customer?: {
    name: string | null;
    phone: string | null;
  };
}

interface UseTicketsProps {
  sector?: string;
  status?: string;
  enabled?: boolean;
}

interface UseTicketsReturn {
  tickets: Ticket[];
  loading: boolean;
  error: Error | null;
  realtimeStatus: string;
  reconnect: () => void;
  refresh: () => Promise<void>;
}

const QUERY_TIMEOUT = 8000; // 8 segundos
const MIN_LOADING_TIME = 500; // 500ms para evitar flash

export function useTickets({ sector, status, enabled = true }: UseTicketsProps = {}): UseTicketsReturn {
  const [tickets, setTickets] = useState<Ticket[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<Error | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // useMemo para estabilizar a referência do cliente
  const supabase = useMemo(() => createClient(), []);

  // Verificar autenticação
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((_, session) => {
      setIsAuthenticated(!!session);
    });

    return () => authListener.subscription.unsubscribe();
  }, [supabase]);

  // Função de carregamento
  const loadTickets = useCallback(async () => {
    if (!isAuthenticated) return;

    try {
      setLoading(true);
      setError(null);

      const startTime = Date.now();

      let query = supabase
        .from('tickets')
        .select(`
          *,
          customer:customers (
            name,
            phone
          )
        `);

      // Filtro por setor (visibilidade total para supervisores)
      const normalizedSector = sector?.toLowerCase() || '';
      const isAdmin = ['supervisor', 'geral', 'ceo', 'admin'].includes(normalizedSector);

      if (sector && !isAdmin) {
        query = query.eq('sector', normalizedSector);
      }

      if (status && status !== 'all') {
        query = query.eq('status', status);
      }

      // Timeout para query
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('Timeout ao carregar tickets')), QUERY_TIMEOUT);
      });

      const queryPromise = query;
      const { data, error: fetchError } = await Promise.race([
        queryPromise,
        timeoutPromise
      ]) as { data: unknown[] | null; error: Error | null };

      if (fetchError) throw fetchError;

      // Ordenação por data
      const sortedData = (data || []).sort((a: unknown, b: unknown) => {
        const ticketA = a as Record<string, string>;
        const ticketB = b as Record<string, string>;
        const dateA = new Date(ticketA.created_at || 0).getTime();
        const dateB = new Date(ticketB.created_at || 0).getTime();
        return dateB - dateA;
      });

      setTickets(sortedData as Ticket[]);

      // Garantir tempo mínimo de loading
      const elapsed = Date.now() - startTime;
      if (elapsed < MIN_LOADING_TIME) {
        await new Promise(resolve => setTimeout(resolve, MIN_LOADING_TIME - elapsed));
      }
    } catch (err: unknown) {
      const errorObj = err instanceof Error ? err : new Error('Erro desconhecido');
      console.error('[useTickets] Erro:', errorObj.message);
      setError(errorObj);
    } finally {
      setLoading(false);
    }
  }, [sector, status, isAuthenticated, supabase]);

  // Carregar na montagem
  useEffect(() => {
    if (enabled && isAuthenticated) {
      loadTickets();
    }
  }, [enabled, isAuthenticated, loadTickets]);

  // Handler para mudanças no realtime
  const handleTicketChange = useCallback(() => {
    // Recarregar tickets quando houver mudança
    loadTickets();
  }, [loadTickets]);

  // Usar hook de realtime
  const { status: realtimeStatus, reconnect } = useSupabaseRealtime({
    channelName: 'tickets-realtime',
    table: 'tickets',
    event: '*',
    enabled: enabled && isAuthenticated,
    onData: handleTicketChange
  });

  return {
    tickets,
    loading,
    error,
    realtimeStatus,
    reconnect,
    refresh: loadTickets
  };
}

export default useTickets;
