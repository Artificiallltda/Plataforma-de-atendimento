'use client'

import { useEffect, useState, useMemo } from 'react'
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
  const [isAuthenticated, setIsAuthenticated] = useState(false)
  
  // Estabilizar a instância do Supabase para evitar loops de re-inscrição
  const supabase = useMemo(() => createClient(), [])

  // Detectar quando a sessão está pronta para evitar Race Condition
  useEffect(() => {
    // Verificar estado inicial
    supabase.auth.getSession().then(({ data: { session } }) => {
      setIsAuthenticated(!!session)
    })

    const { data: authListener } = supabase.auth.onAuthStateChange((event, session) => {
      const authed = !!session
      setIsAuthenticated(authed)
      console.log('🔐 [Auth] Estado de autenticação (Tickets):', event, authed)
    })
    
    return () => authListener.subscription.unsubscribe()
  }, [supabase])

  useEffect(() => {
    // Aguarda a autenticação antes de tentar carregar ou subscrever
    if (!enabled || !isAuthenticated) {
      if (!isAuthenticated && !loading) setLoading(true)
      return
    }

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

        const { data, error: fetchError } = await query

        if (fetchError) throw fetchError
        
        // Ordenação manual no JavaScript (Imune a erros de nome de coluna no banco)
        const sortedData = (data || []).sort((a, b) => {
          const dateA = new Date(a.created_at || a.createdAt || a.createdat || 0).getTime()
          const dateB = new Date(b.created_at || b.createdAt || b.createdat || 0).getTime()
          return dateB - dateA // Decrescente
        })

        setTickets(sortedData)
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
        .channel('tickets-realtime')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, (payload) => {
          console.log('🔔 [Realtime] Mudança detectada em tickets:', payload.eventType)
          loadTickets()
        })
        .subscribe((status) => {
          console.log('📡 [Realtime] Status da subscrição de tickets:', status)
        })
    }

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [sector, status, enabled, isAuthenticated]) // isAuthenticated adicionado às dependências

  return { tickets, loading, error }
}
