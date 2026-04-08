/**
 * Hook de Realtime com Reconexão Automática
 * 
 * Protege contra desconexões do Supabase Realtime com:
 * - Reconexão automática com exponential backoff
 * - Reconexão ao retornar à aba (visibility change)
 * - Estado de conexão exposto
 */

'use client';

import { useEffect, useRef, useState, useCallback, useMemo } from 'react';
import { RealtimeChannel } from '@supabase/supabase-js';
import { createClient } from '@/lib/supabase/client';

export type RealtimeStatus = 'connecting' | 'connected' | 'disconnected' | 'error';

interface UseRealtimeOptions {
  channelName: string;
  table: string;
  filter?: string;
  event?: '*' | 'INSERT' | 'UPDATE' | 'DELETE';
  onData: (payload: unknown) => void;
  enabled?: boolean;
}

interface UseRealtimeReturn {
  status: RealtimeStatus;
  error: Error | null;
  reconnect: () => void;
  reconnectAttempts: number;
}

export function useSupabaseRealtime(options: UseRealtimeOptions): UseRealtimeReturn {
  const { channelName, table, filter, event = '*', onData, enabled = true } = options;
  const [status, setStatus] = useState<RealtimeStatus>('disconnected');
  const [error, setError] = useState<Error | null>(null);
  const [reconnectAttempts, setReconnectAttempts] = useState(0);
  
  // useMemo para estabilizar a referência do cliente Supabase
  const supabase = useMemo(() => createClient(), []);
  
  // useRef para contagem interna (não causa re-render)
  const channelRef = useRef<RealtimeChannel | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const reconnectAttemptsRef = useRef(0); // Contagem interna
  const isManualDisconnect = useRef(false);
  
  const MAX_RECONNECT_ATTEMPTS = 10;
  const BASE_RECONNECT_DELAY = 3000; // 3s
  const MAX_RECONNECT_DELAY = 30000; // 30s

  const cleanup = useCallback(() => {
    isManualDisconnect.current = true;
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
      channelRef.current = null;
    }
  }, [supabase]);

  const connect = useCallback(() => {
    if (!enabled) {
      setStatus('disconnected');
      return;
    }

    // Limpa conexão anterior
    if (channelRef.current) {
      supabase.removeChannel(channelRef.current);
    }
    
    isManualDisconnect.current = false;
    setStatus('connecting');
    setError(null);
    
    let channel = supabase.channel(channelName);
    
    const subscriptionConfig = {
      event,
      schema: 'public' as const,
      table
    };
    
    if (filter) {
      channel = channel.on('postgres_changes', { ...subscriptionConfig, filter }, (payload) => {
        onData(payload);
      });
    } else {
      channel = channel.on('postgres_changes', subscriptionConfig, (payload) => {
        onData(payload);
      });
    }
    
    channel.subscribe((subscriptionStatus) => {
      // Ignora se desconectamos manualmente
      if (isManualDisconnect.current) return;
      
      if (subscriptionStatus === 'SUBSCRIBED') {
        setStatus('connected');
        setError(null);
        reconnectAttemptsRef.current = 0;
        setReconnectAttempts(0); // Sincroniza com UI
      } else if (subscriptionStatus === 'CLOSED' || subscriptionStatus === 'CHANNEL_ERROR') {
        setStatus('error');
        setError(new Error(`Channel ${subscriptionStatus}`));
        
        // Tentar reconectar automaticamente
        // Usa a ref interna para evitar recriar o callback
        if (reconnectAttemptsRef.current < MAX_RECONNECT_ATTEMPTS && !isManualDisconnect.current) {
          reconnectAttemptsRef.current++;
          // Sincroniza com estado para UI
          setReconnectAttempts(reconnectAttemptsRef.current);
          
          // Exponential backoff: 3s, 6s, 12s, até 30s
          const delay = Math.min(
            BASE_RECONNECT_DELAY * Math.pow(2, reconnectAttemptsRef.current - 1),
            MAX_RECONNECT_DELAY
          );
          
          console.log(`[Realtime] Reconectando em ${delay}ms (tentativa ${reconnectAttemptsRef.current}/${MAX_RECONNECT_ATTEMPTS})`);
          
          reconnectTimeoutRef.current = setTimeout(() => {
            if (!isManualDisconnect.current) {
              connect();
            }
          }, delay);
        } else if (reconnectAttemptsRef.current >= MAX_RECONNECT_ATTEMPTS) {
          console.error('[Realtime] Máximo de tentativas atingido');
          setError(new Error('Máximo de tentativas de reconexão atingido'));
        }
      }
    });
    
    channelRef.current = channel;
  // reconnectAttempts REMOVIDO das dependências - usamos a ref interna
  }, [channelName, table, filter, event, onData, enabled, supabase]);

  // Efeito principal de conexão
  useEffect(() => {
    connect();
    
    return () => {
      cleanup();
    };
  }, [connect, cleanup]);

  // Reconectar quando a aba voltar a ficar visível
  // Inclui 'error' na condição para reconectar após falha
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && 
          (status === 'disconnected' || status === 'error') && 
          enabled) {
        console.log('[Realtime] Aba visível, tentando reconectar...');
        reconnectAttemptsRef.current = 0;
        setReconnectAttempts(0);
        connect();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [connect, status, enabled]);

  // Reconexão manual
  const reconnect = useCallback(() => {
    console.log('[Realtime] Reconexão manual solicitada');
    reconnectAttemptsRef.current = 0;
    setReconnectAttempts(0);
    connect();
  }, [connect]);

  return { status, error, reconnect, reconnectAttempts };
}

export default useSupabaseRealtime;
