'use client'

import { useEffect, useState, useRef, useMemo } from 'react'
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
  
  // Estabilizar a referência do cliente Supabase para evitar loops
  const supabase = useMemo(() => createClient(), [])
  const channelRef = useRef<RealtimeChannel | null>(null)

  useEffect(() => {
    let channel: RealtimeChannel | null = null

    const loadMessages = async () => {
      try {
        // Trava de segurança: ignorar IDs inválidos ou texto 'null'
        if (!customer_id || customer_id === 'null' || customer_id === 'undefined') {
          console.log('⏭️ [useMessages] ID inválido ou nulo. Pulando carga.');
          setLoading(false);
          return;
        }

        console.log(`🔍 [useMessages] Carregando histórico para: ${customer_id}`);
        setLoading(true)
        
        // Query simplificada ao máximo para matar o Erro 400
        const { data, error } = await supabase
          .from('messages')
          .select('*')
          .eq('customer_id', customer_id)

        if (error) throw error

        // Ordenação manual no JS para garantir estabilidade
        const sortedMessages = (data || []).sort((a, b) => 
          new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime()
        )

        console.log(`✅ [useMessages] ${sortedMessages.length} mensagens carregadas.`);

        const mappedMessages = sortedMessages.map(m => ({
          ...m,
          customer_id: m.customer_id || (m as any).customerId,
          ticket_id: m.ticket_id || (m as any).ticketId
        }))

        setMessages(mappedMessages as Message[])
        setError(null)
      } catch (err: any) {
        console.error('❌ [useMessages] Erro fatal na carga:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadMessages()

    if (enabled && customer_id) {
      console.log(`🔌 [Realtime] Conectando canal: chat-${customer_id}`);

      channel = supabase
        .channel(`chat-global-${customer_id}`)
        .on(
          'postgres_changes',
          {
            event: 'INSERT',
            schema: 'public',
            table: 'messages'
            // Filtro removido para maior robustez
          },
          (payload) => {
            console.log('🔔 [Realtime] Nova mensagem detectada no banco!', payload.eventType);
            
            const newMessage = payload.new as any;
            
            // FILTRAGEM MANUAL NO JS: Muito mais resiliente a IDs e tipos
            const msgCustomerId = newMessage.customer_id || newMessage.customerId;
            if (msgCustomerId !== customer_id) {
              console.log(`⏭️ [Realtime] Mensagem ignorada (Cliente ${msgCustomerId} != ${customer_id})`);
              return;
            }

            const normalizedMsg: Message = {
              ...newMessage,
              customer_id: msgCustomerId,
              ticket_id: newMessage.ticket_id || newMessage.ticketId
            };

            setMessages(prev => {
              if (prev.some(m => m.id === normalizedMsg.id)) return prev;
              const newList = [...prev, normalizedMsg];
              console.log(`📈 [Realtime] UI Atualizada com sucesso!`);
              return newList;
            });
          }
        )
        .subscribe((status) => {
          console.log(`📡 [Realtime] Status da conexão de mensagens: ${status}`);
        })

      channelRef.current = channel
    }

    return () => {
      if (channel) {
        console.log('🔌 [Realtime] Desconectando canal');
        supabase.removeChannel(channel)
      }
    }
  }, [ticketId, customer_id, enabled]) // supabase removido das dependências

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
