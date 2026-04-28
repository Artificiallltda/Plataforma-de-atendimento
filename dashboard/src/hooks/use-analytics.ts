'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface DailyVolume {
  name: string
  tickets: number
  bot: number
}

export interface CsatBucket {
  name: string
  count: number
}

export interface AnalyticsData {
  dailyVolume: DailyVolume[]
  csatDistribution: CsatBucket[]
}

const DAY_LABELS = ['Dom', 'Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sab']

function emptyVolume(): DailyVolume[] {
  const today = new Date()
  const out: DailyVolume[] = []
  for (let i = 6; i >= 0; i--) {
    const d = new Date(today)
    d.setDate(today.getDate() - i)
    out.push({ name: DAY_LABELS[d.getDay()], tickets: 0, bot: 0 })
  }
  return out
}

function emptyCsat(): CsatBucket[] {
  return [5, 4, 3, 2, 1].map(score => ({ name: `${score} ⭐`, count: 0 }))
}

export function useAnalytics(enabled: boolean = true) {
  const [data, setData] = useState<AnalyticsData>({
    dailyVolume: emptyVolume(),
    csatDistribution: emptyCsat()
  })
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    if (!enabled) return

    const load = async () => {
      try {
        const sevenDaysAgo = new Date()
        sevenDaysAgo.setDate(sevenDaysAgo.getDate() - 6)
        sevenDaysAgo.setHours(0, 0, 0, 0)

        const [volumeResult, csatResult] = await Promise.all([
          supabase
            .from('tickets')
            .select('created_at, assigned_to, status')
            .gte('created_at', sevenDaysAgo.toISOString()),
          supabase
            .from('tickets')
            .select('csat_score')
            .not('csat_score', 'is', null)
        ])

        // Agrupar volume por dia
        const dailyMap: Record<string, { tickets: number; bot: number }> = {}
        const volume = emptyVolume()
        volume.forEach(v => { dailyMap[v.name] = { tickets: 0, bot: 0 } })

        ;(volumeResult.data || []).forEach((t: any) => {
          const d = new Date(t.created_at)
          const label = DAY_LABELS[d.getDay()]
          if (!dailyMap[label]) return
          if (t.assigned_to) {
            dailyMap[label].tickets += 1
          } else {
            dailyMap[label].bot += 1
          }
        })

        const dailyVolume = volume.map(v => ({
          name: v.name,
          tickets: dailyMap[v.name].tickets,
          bot: dailyMap[v.name].bot
        }))

        // Agrupar CSAT por score
        const buckets: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        ;(csatResult.data || []).forEach((t: any) => {
          const score = Math.round(t.csat_score)
          if (score >= 1 && score <= 5) buckets[score] += 1
        })
        const csatDistribution: CsatBucket[] = [5, 4, 3, 2, 1].map(s => ({
          name: `${s} ⭐`,
          count: buckets[s]
        }))

        setData({ dailyVolume, csatDistribution })
      } catch (err) {
        console.error('[useAnalytics] Erro ao carregar:', err)
      } finally {
        setLoading(false)
      }
    }

    load()
  }, [enabled, supabase])

  return { data, loading }
}
