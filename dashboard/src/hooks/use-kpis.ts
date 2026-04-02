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

        // Buscar KPIs principais (SNAKE_CASE)
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
            .select('created_at, resolved_at')
            .eq('status', 'resolvido')
            .not('resolved_at', 'is', null),

          // CSAT médio
          supabase
            .from('tickets')
            .select('csat_score')
            .not('csat_score', 'is', null),

          // Bot containment (tickets resolvidos sem humano)
          supabase
            .from('tickets')
            .select('assigned_to', { count: 'exact', head: true })
            .eq('status', 'resolvido')
            .is('assigned_to', null),

          // Total tickets resolvidos
          supabase
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .eq('status', 'resolvido'),

          // Agentes online
          supabase
            .from('agents')
            .select('id', { count: 'exact', head: true })
            .eq('is_online', true),

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

        // Calcular TMR médio
        let tmrMedio = 0
        if (tmr.data && tmr.data.length > 0) {
          const totalSeconds = tmr.data.reduce((acc, t) => {
            const created = new Date(t.created_at).getTime()
            const resolved = new Date(t.resolved_at!).getTime()
            return acc + (resolved - created) / 1000
          }, 0)
          tmrMedio = Math.round(totalSeconds / tmr.data.length)
        }

        // Calcular CSAT médio
        let csatMedio = 0
        if (csat.data && csat.data.length > 0) {
          const total = csat.data.reduce((acc, t) => acc + (t.csat_score || 0), 0)
          csatMedio = Math.round((total / csat.data.length) * 10) / 10
        }

        // Calcular Bot Containment Rate
        let botContainmentRate = 0
        if (botContainment.count && ticketsAbertos.count) {
          const total = (ticketsAbertos.count || 0) + (botContainment.count || 0)
          botContainmentRate = Math.round((botContainment.count / total) * 100)
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

    if (enabled) {
      loadKpis()
      channel = supabase
        .channel('kpis-channel')
        .on('postgres_changes', { event: '*', schema: 'public', table: 'tickets' }, () => loadKpis())
        .subscribe()
    }

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
  }, [enabled, supabase])

  return { kpis, loading, error }
}
