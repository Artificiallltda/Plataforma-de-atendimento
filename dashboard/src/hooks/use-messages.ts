'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'

export interface Message {
  id: string
  ticketId: string
  customerId: string
  channel: 'whatsapp' | 'telegram' | 'web'
  body: string
  mediaUrl: string | null
  mediaType: 'audio' | 'image' | 'document' | 'video' | null
  sender: 'customer' | 'bot' | 'human'
  senderId: string | null
  timestamp: string
  rawPayload: any | null
}

interface UseMessagesOptions {
  ticketId: string
  enabled?: boolean
}

export function useMessages(options: UseMessagesOptions) {
  const { ticketId, enabled = true } = options
  const [messages, setMessages] = useState<Message[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    let channel: RealtimeChannel | null = null

    const loadMessages = async () => {
      try {
        setLoading(true)
        
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('ticketId', ticketId)
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

    // Assinar atualizações em tempo real
    if (enabled && ticketId) {
      channel = supabase
        .channel(`messages-${ticketId}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `ticketId=eq.${ticketId}`
          },
          (payload) => {
            console.log('🔔 Nova mensagem:', payload)
            setMessages(prev => [...prev, payload.new as Message])
          }
        )
        .subscribe()

      channelRef.current = channel
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [ticketId, enabled, supabase])

  return { messages, loading, error }
}

export async function sendMessage(
  ticketId: string,
  customerId: string,
  channel: 'whatsapp' | 'telegram' | 'web',
  body: string,
  sender: 'human',
  senderId: string
): Promise<{ success: boolean; error?: string }> {
  const supabase = createClient()

  try {
    const { error } = await supabase
      .from('messages')
      .insert({
        ticketId,
        customerId,
        channel,
        body,
        sender,
        senderId,
        timestamp: new Date().toISOString(),
        rawPayload: null
      })

    if (error) throw error

    // TODO: Enviar mensagem real via WhatsApp/Telegram API
    // await sendViaChannel(channel, customerId, body)

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

    const { error } = await supabase
      .from('tickets')
      .update(updateData)
      .eq('id', ticketId)

    if (error) throw error
    return { success: true }
  } catch (err: any) {
    console.error('Erro ao atualizar ticket:', err)
    return { success: false, error: err.message }
  }
}
