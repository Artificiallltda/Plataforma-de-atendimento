'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface FeedbackData {
  csatByDay: Array<{ date: string; score: number; count: number }>
  csatDistribution: Record<number, number>
  csatAverage: number
  npsByDay: Array<{ date: string; score: number; promoters: number; passives: number; detractors: number }>
  npsScore: number
  npsClassification: 'ruim' | 'bom' | 'muito_bom' | 'excelente'
  npsDistribution: { promoters: number; passives: number; detractors: number }
  lowCsatComments: Array<{ id: string; score: number; comment: string; createdAt: string }>
  detractorComments: Array<{ id: string; score: number; comment: string; createdAt: string }>
}

interface UseFeedbackOptions {
  days?: number
  sector?: string
  enabled?: boolean
}

export function useFeedback(options: UseFeedbackOptions = {}) {
  const { days = 30, sector, enabled = true } = options
  const [data, setData] = useState<FeedbackData | null>(null)
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      if (!enabled) return

      try {
        setLoading(true)

        // Calcular data inicial
        const startDate = new Date()
        startDate.setDate(startDate.getDate() - days)

        // Buscar feedback CSAT
        let csatQuery = supabase
          .from('feedback')
          .select('*')
          .eq('type', 'csat')
          .gte('createdAt', startDate.toISOString())
          .order('createdAt', { ascending: true })

        if (sector && sector !== 'all') {
          // CSAT não tem setor direto, precisaríamos juntar com tickets
          // Simplificação: buscar todos e filtrar depois
        }

        const { data: csatData } = await csatQuery

        // Buscar feedback NPS
        let npsQuery = supabase
          .from('feedback')
          .select('*')
          .eq('type', 'nps')
          .gte('createdAt', startDate.toISOString())
          .order('createdAt', { ascending: true })

        const { data: npsData } = await npsQuery

        // Processar CSAT por dia
        const csatByDayMap = new Map<string, { sum: number; count: number }>()
        const csatDistribution: Record<number, number> = { 1: 0, 2: 0, 3: 0, 4: 0, 5: 0 }
        let csatSum = 0
        const lowCsatComments: FeedbackData['lowCsatComments'] = []

        csatData?.forEach(f => {
          const date = new Date(f.createdAt).toISOString().split('T')[0]
          const existing = csatByDayMap.get(date) || { sum: 0, count: 0 }
          existing.sum += f.score
          existing.count++
          csatByDayMap.set(date, existing)

          csatDistribution[f.score] = (csatDistribution[f.score] || 0) + 1
          csatSum += f.score

          if (f.score < 3 && f.comment) {
            lowCsatComments.push({
              id: f.id,
              score: f.score,
              comment: f.comment,
              createdAt: f.createdAt
            })
          }
        })

        const csatByDay = Array.from(csatByDayMap.entries()).map(([date, { sum, count }]) => ({
          date,
          score: Math.round((sum / count) * 10) / 10,
          count
        }))

        const csatAverage = csatData && csatData.length > 0
          ? Math.round((csatSum / csatData.length) * 10) / 10
          : 0

        // Processar NPS por dia
        const npsByDayMap = new Map<string, { promoters: number; passives: number; detractors: number }>()
        let totalPromoters = 0
        let totalPassives = 0
        let totalDetractors = 0
        const detractorComments: FeedbackData['detractorComments'] = []

        npsData?.forEach(f => {
          const date = new Date(f.createdAt).toISOString().split('T')[0]
          const existing = npsByDayMap.get(date) || { promoters: 0, passives: 0, detractors: 0 }

          if (f.score >= 9) {
            existing.promoters++
            totalPromoters++
          } else if (f.score >= 7) {
            existing.passives++
            totalPassives++
          } else {
            existing.detractors++
            totalDetractors++
            if (f.comment) {
              detractorComments.push({
                id: f.id,
                score: f.score,
                comment: f.comment,
                createdAt: f.createdAt
              })
            }
          }

          npsByDayMap.set(date, existing)
        })

        const npsByDay = Array.from(npsByDayMap.entries()).map(([date, { promoters, passives, detractors }]) => {
          const total = promoters + passives + detractors
          const score = total > 0 ? Math.round(((promoters - detractors) / total) * 100) : 0
          return { date, score, promoters, passives, detractors }
        })

        const npsTotal = totalPromoters + totalPassives + totalDetractors
        const npsScore = npsTotal > 0 ? Math.round(((totalPromoters - totalDetractors) / npsTotal) * 100) : 0

        let npsClassification: FeedbackData['npsClassification'] = 'ruim'
        if (npsScore >= 70) npsClassification = 'excelente'
        else if (npsScore >= 30) npsClassification = 'muito_bom'
        else if (npsScore >= 0) npsClassification = 'bom'

        setData({
          csatByDay,
          csatDistribution,
          csatAverage,
          npsByDay,
          npsScore,
          npsClassification,
          npsDistribution: {
            promoters: totalPromoters,
            passives: totalPassives,
            detractors: totalDetractors
          },
          lowCsatComments: lowCsatComments.slice(0, 10),
          detractorComments: detractorComments.slice(0, 10)
        })
      } catch (error) {
        console.error('Erro ao carregar feedback:', error)
      } finally {
        setLoading(false)
      }
    }

    loadData()
  }, [days, sector, enabled, supabase])

  return { data, loading }
}
