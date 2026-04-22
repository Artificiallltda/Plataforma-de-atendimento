'use client'

import { useState } from 'react'
import { useFeedback } from '@/hooks/use-feedback'
import { ExportButton } from '@/components/export/ExportButton'
import { motion } from 'framer-motion'
import { NpsGauge } from '@/components/analytics/NpsGauge'
import { CsatTrendChart } from '@/components/analytics/CsatTrendChart'
import { CsatDistributionChart } from '@/components/analytics/CsatDistributionChart'
import { NpsCompositionChart } from '@/components/analytics/NpsCompositionChart'
import { NpsTrendChart } from '@/components/analytics/NpsTrendChart'
import { CriticalComments } from '@/components/analytics/CriticalComments'
import { TrendingUp, TrendingDown, Star, Users, AlertTriangle, ThumbsUp } from 'lucide-react'

const PERIOD_OPTIONS = [
  { label: '7 dias', value: 7 },
  { label: '30 dias', value: 30 },
  { label: '90 dias', value: 90 },
]

const SECTOR_OPTIONS = [
  { label: 'Todos', value: '' },
  { label: 'Suporte', value: 'suporte' },
  { label: 'Financeiro', value: 'financeiro' },
  { label: 'Comercial', value: 'comercial' },
]

function KpiCard({ icon: Icon, label, value, subtitle, color, delay }: {
  icon: any; label: string; value: string | number; subtitle: string; color: string; delay: number
}) {
  const colorMap: Record<string, string> = {
    yellow: 'from-amber-500/10 to-amber-500/5 border-amber-200/60 text-amber-600',
    green: 'from-emerald-500/10 to-emerald-500/5 border-emerald-200/60 text-emerald-600',
    blue: 'from-blue-500/10 to-blue-500/5 border-blue-200/60 text-blue-600',
    red: 'from-rose-500/10 to-rose-500/5 border-rose-200/60 text-rose-600',
  }
  const iconColorMap: Record<string, string> = {
    yellow: 'bg-amber-100 text-amber-600',
    green: 'bg-emerald-100 text-emerald-600',
    blue: 'bg-blue-100 text-blue-600',
    red: 'bg-rose-100 text-rose-600',
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay, duration: 0.4 }}
      className={`bg-gradient-to-br ${colorMap[color]} backdrop-blur-sm p-6 rounded-2xl border shadow-sm hover:shadow-md transition-shadow`}
    >
      <div className="flex items-start justify-between mb-3">
        <div className={`p-2.5 rounded-xl ${iconColorMap[color]}`}>
          <Icon size={20} />
        </div>
      </div>
      <p className="text-sm text-slate-500 font-medium mb-1">{label}</p>
      <h3 className="text-3xl font-extrabold text-slate-800 tracking-tight">{value}</h3>
      <p className="text-xs text-slate-400 mt-2">{subtitle}</p>
    </motion.div>
  )
}

export default function FeedbackAnalyticsPage() {
  const [days, setDays] = useState(30)
  const [sector, setSector] = useState('')
  const { data, loading } = useFeedback({ days, sector: sector || undefined })

  if (loading) {
    return (
      <div className="space-y-8 animate-pulse">
        <div className="flex justify-between">
          <div className="space-y-3">
            <div className="h-8 w-64 bg-slate-200/60 rounded-xl" />
            <div className="h-4 w-48 bg-slate-100/60 rounded-lg" />
          </div>
          <div className="flex gap-2">
            {[1, 2, 3].map(i => <div key={i} className="h-10 w-24 bg-slate-100/40 rounded-xl" />)}
          </div>
        </div>
        <div className="grid grid-cols-4 gap-6">
          {[1, 2, 3, 4].map(i => <div key={i} className="h-36 bg-slate-100/40 rounded-2xl" />)}
        </div>
        <div className="grid grid-cols-2 gap-6">
          {[1, 2].map(i => <div key={i} className="h-80 bg-slate-100/40 rounded-2xl" />)}
        </div>
      </div>
    )
  }

  const hasData = data && (data.csatByDay.length > 0 || data.npsByDay.length > 0)

  return (
    <div className="space-y-8">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <motion.div initial={{ opacity: 0, x: -20 }} animate={{ opacity: 1, x: 0 }}>
          <h1 className="text-3xl font-extrabold text-slate-800 tracking-tight flex items-center gap-3">
            Analytics de Satisfação
            <span className="text-sm font-bold bg-blue-50 text-blue-600 px-3 py-1 rounded-full border border-blue-100">
              CSAT & NPS
            </span>
          </h1>
          <p className="text-slate-500 mt-1">Monitore a satisfação dos clientes em tempo real</p>
        </motion.div>

        <div className="flex flex-wrap gap-3 items-center">
          {/* Period Filter */}
          <div className="flex bg-white/80 backdrop-blur-sm rounded-xl border border-slate-200/60 p-1 shadow-sm">
            {PERIOD_OPTIONS.map(opt => (
              <button
                key={opt.value}
                onClick={() => setDays(opt.value)}
                className={`px-4 py-2 rounded-lg text-sm font-semibold transition-all duration-200 ${
                  days === opt.value
                    ? 'bg-slate-900 text-white shadow-md'
                    : 'text-slate-500 hover:text-slate-700 hover:bg-slate-50'
                }`}
              >
                {opt.label}
              </button>
            ))}
          </div>

          {/* Sector Filter */}
          <select
            value={sector}
            onChange={e => setSector(e.target.value)}
            className="px-4 py-2.5 rounded-xl text-sm font-semibold bg-white/80 backdrop-blur-sm border border-slate-200/60 text-slate-600 shadow-sm focus:ring-2 focus:ring-blue-200 focus:border-blue-300 outline-none"
          >
            {SECTOR_OPTIONS.map(opt => (
              <option key={opt.value} value={opt.value}>{opt.label}</option>
            ))}
          </select>

          <ExportButton type="feedback" data={data} variant="primary" />
        </div>
      </div>

      {!hasData ? (
        /* Empty State */
        <motion.div
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="flex flex-col items-center justify-center py-24 bg-white/60 backdrop-blur-sm rounded-3xl border border-slate-200/40"
        >
          <div className="h-20 w-20 bg-slate-100 rounded-full flex items-center justify-center mb-6">
            <Star size={36} className="text-slate-300" />
          </div>
          <h3 className="text-xl font-bold text-slate-600 mb-2">Nenhum feedback ainda</h3>
          <p className="text-slate-400 text-sm max-w-md text-center">
            Os dados de CSAT e NPS aparecerão aqui assim que os clientes começarem a avaliar os atendimentos.
          </p>
        </motion.div>
      ) : (
        <>
          {/* KPI Cards */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-5">
            <KpiCard icon={Star} label="CSAT Médio" value={data!.csatAverage.toFixed(1)} subtitle="Meta: > 4.0" color="yellow" delay={0} />
            <KpiCard icon={data!.npsScore >= 0 ? TrendingUp : TrendingDown} label="NPS Score" value={data!.npsScore} subtitle={`Zona: ${data!.npsClassification.replace('_', ' ')}`} color={data!.npsScore >= 30 ? 'green' : data!.npsScore >= 0 ? 'blue' : 'red'} delay={0.1} />
            <KpiCard icon={ThumbsUp} label="Promotores (9-10)" value={data!.npsDistribution.promoters} subtitle="Lealdade positiva" color="green" delay={0.2} />
            <KpiCard icon={AlertTriangle} label="Detratores (0-6)" value={data!.npsDistribution.detractors} subtitle="Risco de churn" color="red" delay={0.3} />
          </div>

          {/* NPS Gauge + CSAT Trend */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2 }}
              className="bg-white/70 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/40 shadow-sm"
            >
              <h2 className="text-base font-bold text-slate-700 mb-4">NPS Gauge</h2>
              <NpsGauge score={data!.npsScore} classification={data!.npsClassification} />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.3 }}
              className="lg:col-span-2 bg-white/70 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/40 shadow-sm"
            >
              <h2 className="text-base font-bold text-slate-700 mb-4">Evolução do CSAT</h2>
              <CsatTrendChart data={data!.csatByDay} />
            </motion.div>
          </div>

          {/* Distribution + NPS Composition */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.35 }}
              className="bg-white/70 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/40 shadow-sm"
            >
              <h2 className="text-base font-bold text-slate-700 mb-4">Distribuição de Notas CSAT</h2>
              <CsatDistributionChart distribution={data!.csatDistribution} />
            </motion.div>

            <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.4 }}
              className="bg-white/70 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/40 shadow-sm"
            >
              <h2 className="text-base font-bold text-slate-700 mb-4">Composição NPS</h2>
              <NpsCompositionChart distribution={data!.npsDistribution} />
            </motion.div>
          </div>

          {/* NPS Trend */}
          <motion.div initial={{ opacity: 0, y: 20 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.45 }}
            className="bg-white/70 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/40 shadow-sm"
          >
            <h2 className="text-base font-bold text-slate-700 mb-4">Tendência NPS ao Longo do Tempo</h2>
            <NpsTrendChart data={data!.npsByDay} />
          </motion.div>

          {/* Critical Comments */}
          <CriticalComments lowCsat={data!.lowCsatComments} detractors={data!.detractorComments} />
        </>
      )}
    </div>
  )
}
