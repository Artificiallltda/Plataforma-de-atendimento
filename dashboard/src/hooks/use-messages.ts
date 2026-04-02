'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'

export interface Message {
  id: string
  ticket_id: string
  customer_id: string
  channel: 'whatsapp' | 'telegram' | 'web'
  body: string
  media_url: string | null
  media_type: 'audio' | 'image' | 'document' | 'video' | null
  sender: 'customer' | 'bot' | 'human'
  sender_id: string | null
  timestamp: string
  raw_payload: any | null
  agent?: {
    name: string
    sector: string
  }
}

interface UseMessagesOptions {
  ticketId: string
  customer_id: string
  enabled?: boolean
}

export function useMessages(options: UseMessagesOptions) {
  const { ticketId, customer_id, enabled = true } = options
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    let channel: RealtimeChannel | null = null

    const loadMessages = async () => {
      try {
        if (!customer_id) return
        setLoading(true)
        
        // BUSCA POR CUSTOMER_ID: Garante que o histórico do robô (em outros tickets) 
        // apareça no chat atual do humano.
        const { data, error } = await supabase
          .from('messages')
          .select('*, agent:agents(name, sector)')
          .eq('customer_id', customer_id)
          .order('timestamp', { ascending: true })

        if (error) throw error
        setMessages(data || [])
        setError(null)
      } catch (err: any) {
        console.error('Erro ao carregar mensagens:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    // Carregar mensagens iniciais
    loadMessages()

    // Assinar atualizações em tempo real baseadas no customer_id
    if (enabled && customer_id) {
      // Registrar evento no console para debug de Realtime
      console.log(`🔌 Conectando Realtime para Cliente: ${customer_id}`);

      channel = supabase
        .channel(`chat-${customer_id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `customer_id=eq.${customer_id}`
          },
          (payload) => {
            console.log('🔔 Nova mensagem via Realtime!', payload.new);
            setMessages(prev => {
              // Evitar duplicidade
              if (prev.some(m => m.id === payload.new.id)) return prev;
              return [...prev, payload.new as Message];
            });
          }
        )
        .subscribe((status) => {
          console.log(`📡 Status da conexão Realtime: ${status}`);
        })

      channelRef.current = channel
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [ticketId, customer_id, enabled, supabase])

  return { messages, loading, error }
}

export async function sendMessage(
  ticketId: string,
  customer_id: string,
  channel: 'whatsapp' | 'telegram' | 'web',
  body: string,
  senderId: string,
  senderName: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

  try {
    const { error } = await supabase
      .from('messages')
      .insert({
        ticket_id: ticketId,
        customer_id: customer_id,
        channel,
        body,
        sender: 'human',
        sender_id: senderId,
        external_id: `human-${Date.now()}`,
        timestamp: new Date().toISOString(),
        raw_payload: { agent_name: senderName } 
      })

    if (error) throw error
    return { success: true }
  } catch (err: any) {
    console.error('Erro ao enviar mensagem:', err)
    return { success: false, error: err.message }
  }
}

export async function updateTicketStatus(
  ticketId: string,
  status: 'novo' | 'bot_ativo' | 'aguardando_humano' | 'em_atendimento' | 'resolvido',
  priority?: 'critica' | 'alta' | 'media' | 'baixa'
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

  try {
    const updateData: any = { status }
    if (priority) updateData.priority = priority
    if (status === 'resolvido') {
      updateData.resolved_at = new Date().toISOString()
    }

    const { error } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', ticketId)

    if (error) throw error
    return { success: true }
  } catch (err: any) {
    console.error('Erro ao atualizar status do ticket:', err)
    return { success: false, error: err.message }
  }
}
