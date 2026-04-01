'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'

export interface Ticket {
  id: string
  customerId: string
  channel: 'whatsapp' | 'telegram' | 'web'
  sector: 'suporte' | 'financeiro' | 'comercial'
  intent: string | null
  status: 'novo' | 'bot_ativo' | 'aguardando_humano' | 'em_atendimento' | 'resolvido'
  priority: 'critica' | 'alta' | 'media' | 'baixa'
  currentAgent: string | null
  assignedTo: string | null
  csatScore: number | null
  routerConfidence: number | null
  createdAt: string
  resolvedAt: string | null
  customer?: {
    name: string | null
    phone: string | null
  }
}

interface UseTicketsOptions {
  sector?: string
  status?: string
  enabled?: boolean
}

export function useTickets(options: UseTicketsOptions = {}) {
  const { sector, status, enabled = true } = options
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    let channel: RealtimeChannel | null = null

    const loadTickets = async () => {
      try {
        setLoading(true)
        
        let query = supabase
          .from('tickets')
          .select(`
            *,
            customer:customers (
              name,
              phone
            )
          `)
          .order('createdAt', { ascending: false })

        // Aplicar filtros
        if (sector && sector !== 'all') {
          query = query.eq('sector', sector)
        }
        if (status && status !== 'all') {
          query = query.eq('status', status)
        }

        const { data, error } = await query

        if (error) throw error
        setTickets(data || [])
        setError(null)
      } catch (err: any) {
        console.error('Erro ao carregar tickets:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    // Carregar tickets iniciais
    loadTickets()

    // Assinar atualizações em tempo real
    if (enabled) {
      channel = supabase
        .channel('tickets-channel')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tickets'
          },
          (payload) => {
            console.log('🔔 Ticket atualizado:', payload)
            
            if (payload.eventType === 'INSERT') {
              setTickets(prev => [payload.new as Ticket, ...prev])
            } else if (payload.eventType === 'UPDATE') {
              setTickets(prev => 
                prev.map(t => t.id === payload.new.id ? { ...t, ...payload.new } as Ticket : t)
              )
            } else if (payload.eventType === 'DELETE') {
              setTickets(prev => prev.filter(t => t.id !== payload.old.id))
            }
          }
        )
        .subscribe()
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [sector, status, enabled, supabase])

  return { tickets, loading, error }
}
