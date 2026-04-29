/**
 * Hook useMessages - Gerenciamento de mensagens com Realtime
 * 
 * Features:
 * - Carregamento inicial com timeout
 * - Realtime com reconexão automática
 * - Tratamento de erros robusto
 */

'use client';

import { useEffect, useState, useCallback, useMemo } from 'react';
import { createClient } from '@/lib/supabase/client';
import { useSupabaseRealtime } from './use-supabase-realtime';

export interface Message {
  id: string;
  ticket_id: string;
  customer_id: string;
  channel: 'whatsapp' | 'telegram' | 'web';
  body: string;
  media_url: string | null;
  media_type: 'audio' | 'image' | 'document' | 'video' | null;
  sender: 'customer' | 'bot' | 'human';
  sender_id: string | null;
  timestamp: string;
  raw_payload: unknown | null;
  agent?: {
    name: string;
    sector: string;
  };
}

interface UseMessagesOptions {
  ticket_id: string;
  customer_id: string;
  enabled?: boolean;
}

interface UseMessagesReturn {
  messages: Message[];
  loading: boolean;
  error: string | null;
  realtimeStatus: string;
  reconnect: () => void;
}

const QUERY_TIMEOUT = 5000; // 5 segundos

export function useMessages(options: UseMessagesOptions): UseMessagesReturn {
  const { ticket_id, customer_id, enabled = true } = options;
  const [messages, setMessages] = useState<Message[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [isAuthenticated, setIsAuthenticated] = useState(false);

  // useMemo para estabilizar a referência do cliente
  const supabase = useMemo(() => createClient(), []);

  // Verificar autenticação
  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session);
    });

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      setIsAuthenticated(!!session);
    });

    return () => authListener.subscription.unsubscribe();
  }, [supabase]);

  // Carregar mensagens iniciais
  useEffect(() => {
    if (!enabled || !isAuthenticated || !customer_id) {
      if (!isAuthenticated) setLoading(true);
      return;
    }

    const loadMessages = async () => {
      try {
        // Validar ID
        if (!customer_id || customer_id === 'null' || customer_id === 'undefined') {
          console.log('[useMessages] ID inválido, pulando carga');
          setLoading(false);
          return;
        }

        setLoading(true);
        setError(null);

        // Query com timeout
        const timeoutPromise = new Promise((_, reject) => {
          setTimeout(() => reject(new Error('Timeout ao carregar mensagens')), QUERY_TIMEOUT);
        });

        const queryPromise = supabase
          .from('messages')
          .select('*')
          .eq('customer_id', customer_id)
          .order('timestamp', { ascending: true });

        const { data, error: queryError } = await Promise.race([
          queryPromise,
          timeoutPromise
        ]) as { data: unknown[] | null; error: Error | null };

        if (queryError) throw queryError;

        const mappedMessages = (data || []).map(m => {
          const msg = m as Record<string, unknown>;
          return msg as unknown as Message;
        });

        setMessages(mappedMessages);
      } catch (err: unknown) {
        const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
        console.error('[useMessages] Erro:', errorMessage);
        setError(errorMessage);
      } finally {
        setLoading(false);
      }
    };

    loadMessages();
  }, [ticket_id, customer_id, enabled, isAuthenticated, supabase]);

  // Handler para novas mensagens do realtime
  const handleNewMessage = useCallback((payload: unknown) => {
    const newPayload = payload as { new: Record<string, unknown> };
    const newMessage = newPayload.new;
    
    const normalizedMsg = newMessage as unknown as Message;

    setMessages(prev => {
      // Evitar duplicatas
      if (prev.some(m => m.id === normalizedMsg.id)) return prev;
      return [...prev, normalizedMsg];
    });
  }, []);

  // Usar novo hook de realtime com reconexão
  const { status: realtimeStatus, reconnect } = useSupabaseRealtime({
    channelName: `chat-${customer_id}`,
    table: 'messages',
    filter: `customer_id=eq.${customer_id}`,
    event: 'INSERT',
    enabled: enabled && !!customer_id && isAuthenticated,
    onData: handleNewMessage
  });

  return {
    messages,
    loading,
    error,
    realtimeStatus,
    reconnect
  };
}

export async function sendMessage(
  ticket_id: string,
  customer_id: string,
  channel: 'whatsapp' | 'telegram' | 'web',
  body: string,
  sender_id: string,
  sender_name: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  try {
    const { error } = await supabase
      .from('messages')
      .insert({
        ticket_id,
        customer_id: customer_id,
        channel,
        body,
        sender: 'human',
        sender_id,
        external_id: `human-${Date.now()}`,
        timestamp: new Date().toISOString(),
        raw_payload: { agent_name: sender_name }
      });

    if (error) throw error;
    return { success: true };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('Erro ao enviar mensagem:', errorMessage);
    return { success: false, error: errorMessage };
  }
}

export async function updateTicketStatus(
  ticket_id: string,
  status: 'novo' | 'bot_ativo' | 'aguardando_humano' | 'em_atendimento' | 'resolvido',
  priority?: 'critica' | 'alta' | 'media' | 'baixa'
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient();

  try {
    const updateData: Record<string, unknown> = { status };
    if (priority) updateData.priority = priority;
    if (status === 'resolvido') {
      updateData.resolved_at = new Date().toISOString();
    }

    const { error } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', ticket_id);

    if (error) throw error;

    // Disparar pesquisa de satisfação automaticamente ao fechar ticket
    if (status === 'resolvido') {
      const apiUrl = process.env.NEXT_PUBLIC_API_URL || 'https://plataforma-de-atendimento-production.up.railway.app';
      fetch(`${apiUrl}/api/feedback-trigger`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ticket_id })
      }).catch(err => console.error('[Feedback] Erro ao disparar pesquisa:', err));
    }

    return { success: true };
  } catch (err: unknown) {
    const errorMessage = err instanceof Error ? err.message : 'Erro desconhecido';
    console.error('Erro ao atualizar status:', errorMessage);
    return { success: false, error: errorMessage };
  }
}
