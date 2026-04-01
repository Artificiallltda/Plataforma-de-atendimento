'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { RealtimeChannel } from '@supabase/supabase-js'

export interface KpiData {
  ticketsAbertos: number
  ticketsCriticos: number
  tmrMedio: number // em segundos
  csatMedio: number
  botContainmentRate: number
  agentesOnline: number
  filaSuporte: number
  filaFinanceiro: number
  filaComercial: number
}

export function useKpis(enabled: boolean = true) {
  const [kpis, setKpis] = useState<KpiData | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const supabase = createClient()

  useEffect(() => {
    let channel: RealtimeChannel | null = null

    const loadKpis = async () => {
      try {
        setLoading(true)

        // Buscar KPIs principais
        const [
          ticketsAbertos,
          ticketsCriticos,
          tmr,
          csat,
          botContainment,
          agentesOnline,
          filaSuporte,
          filaFinanceiro,
          filaComercial
        ] = await Promise.all([
          // Tickets abertos
          supabase
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .in('status', ['novo', 'bot_ativo', 'em_atendimento']),

          // Tickets críticos
          supabase
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .eq('priority', 'critica')
            .neq('status', 'resolvido'),

          // TMR médio
          supabase
            .from('tickets')
            .select('createdAt, resolvedAt')
            .eq('status', 'resolvido')
            .not('resolvedAt', 'is', null),

          // CSAT médio
          supabase
            .from('tickets')
            .select('csatScore')
            .not('csatScore', 'is', null),

          // Bot containment (tickets resolvidos sem humano)
          supabase
            .from('tickets')
            .select('assignedTo', { count: 'exact', head: true })
            .eq('status', 'resolvido')
            .is('assignedTo', null),

          // Total tickets resolvidos
          supabase
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'resolvido'),

          // Agentes online
          supabase
            .from('agents')
            .select('id', { count: 'exact', head: true })
            .eq('isOnline', true),

          // Fila por setor
          supabase
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .eq('sector', 'suporte')
            .neq('status', 'resolvido'),

          supabase
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .eq('sector', 'financeiro')
            .neq('status', 'resolvido'),

          supabase
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .eq('sector', 'comercial')
            .neq('status', 'resolvido')
        ])

        // Calcular TMR médio (em segundos)
        let tmrMedio = 0
        if (tmr.data && tmr.data.length > 0) {
          const totalSeconds = tmr.data.reduce((acc, t) => {
            const created = new Date(t.createdAt).getTime()
            const resolved = new Date(t.resolvedAt!).getTime()
            return acc + (resolved - created) / 1000
          }, 0)
          tmrMedio = Math.round(totalSeconds / tmr.data.length)
        }

        // Calcular CSAT médio
        let csatMedio = 0
        if (csat.data && csat.data.length > 0) {
          const total = csat.data.reduce((acc, t) => acc + (t.csatScore || 0), 0)
          csatMedio = Math.round((total / csat.data.length) * 10) / 10
        }

        // Calcular Bot Containment Rate
        let botContainmentRate = 0
        const totalResolvidos = botContainment.count || 0
        if (totalResolvidos > 0) {
          botContainmentRate = Math.round((botContainment.count! / totalResolvidos) * 100)
        }

        setKpis({
          ticketsAbertos: ticketsAbertos.count || 0,
          ticketsCriticos: ticketsCriticos.count || 0,
          tmrMedio,
          csatMedio,
          botContainmentRate,
          agentesOnline: agentesOnline.count || 0,
          filaSuporte: filaSuporte.count || 0,
          filaFinanceiro: filaFinanceiro.count || 0,
          filaComercial: filaComercial.count || 0
        })

        setError(null)
      } catch (err: any) {
        console.error('Erro ao carregar KPIs:', err)
        setError(err.message)
      } finally {
        setLoading(false)
      }
    }

    loadKpis()

    // Assinar atualizações em tempo real
    if (enabled) {
      channel = supabase
        .channel('kpis-channel')
        .on(
          'postgres_changes',
          {
            event: '*',
            schema: 'public',
            table: 'tickets'
          },
          () => {
            // Recarregar KPIs quando tickets mudarem
            loadKpis()
          }
        )
        .subscribe()
    }

    return () => {
      if (channel) {
        supabase.removeChannel(channel)
      }
    }
  }, [enabled, supabase])

  return { kpis, loading, error }
}
