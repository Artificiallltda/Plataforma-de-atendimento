'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'

export interface Ticket {
  id: string
  customer_id: string
  channel: 'whatsapp' | 'telegram' | 'web'
  sector: string | null
  intent: string | null
  status: 'novo' | 'bot_ativo' | 'aguardando_humano' | 'em_atendimento' | 'resolvido'
  priority: 'critica' | 'alta' | 'media' | 'baixa'
  current_agent: string | null
  assigned_to: string | null
  csat_score: number | null
  router_confidence: number | null
  created_at: string
  resolved_at: string | null
  customer?: {
    name: string | null
    phone: string | null
  }
}

interface UseTicketsProps {
  sector?: string
  status?: string
  enabled?: boolean
}

export function useTickets({ sector, status, enabled = true }: UseTicketsProps = {}) {
  const [tickets, setTickets] = useState<Ticket[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<any>(null)
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

        // NORMALIZAÇÃO DE FILTRO (VISIBILIDADE TOTAL PARA SUPERVISORES)
        const normalizedSector = sector?.toLowerCase() || ''
        const isAdmin = ['supervisor', 'geral', 'ceo', 'admin'].includes(normalizedSector)

        if (sector && !isAdmin) {
          query = query.eq('sector', normalizedSector)
        }
        
        if (status && status !== 'all') {
          query = query.eq('status', status)
        }

        const { data, error: fetchError } = await query.order('created_at', { ascending: false })

        if (fetchError) throw fetchError
        setTickets(data || [])
      } catch (err: any) {
        console.error('Erro ao carregar tickets:', err)
        setError(err)
      } finally {
        setLoading(false)
      }
    }

    if (enabled) {
      loadTickets()

      channel = supabase
        .channel('tickets-changes-all')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => {
          loadTickets()
        })
        .subscribe()
    }

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [sector, status, enabled, supabase])

  return { tickets, loading, error }
}
