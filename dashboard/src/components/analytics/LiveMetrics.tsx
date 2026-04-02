'use client'

import React from 'react'
import { 
  Clock, 
  Smile, 
  Bot, 
  Target, 
  TrendingUp, 
  AlertTriangle 
} from 'lucide-react'
import { motion } from 'framer-motion'

interface LiveMetricsProps {
  kpis: {
    ticketsAbertos: number
    ticketsCriticos: number
    tmrMedio: number
    csatMedio: number
    botContainment: number
  }
}

export function LiveMetrics({ kpis }: LiveMetricsProps) {
  const formatTMR = (seconds: number) => {
    const mins = Math.floor(seconds / 60)
    if (mins < 60) return `${mins}m`
    return `${Math.floor(mins/60)}h ${mins%60}m`
  }

  const metrics = [
    { 
      label: 'Tempo Médio Resposta (TMR)', 
      value: formatTMR(kpis.tmrMedio), 
      icon: Clock, 
      color: 'text-blue-600', 
      bg: 'bg-blue-50',
      trend: '-12%',
      trendColor: 'text-emerald-500'
    },
    { 
      label: 'Satisfação (CSAT)', 
      value: kpis.csatMedio?.toFixed(1) || '0.0', 
      icon: Smile, 
      color: 'text-emerald-600', 
      bg: 'bg-emerald-50',
      trend: '+5%',
      trendColor: 'text-emerald-500'
    },
    { 
      label: 'Contenção de Bot', 
      value: `${Math.round(kpis.botContainment)}%`, 
      icon: Bot, 
      color: 'text-purple-600', 
      bg: 'bg-purple-50',
      trend: '+2%',
      trendColor: 'text-emerald-500'
    },
    { 
      label: 'Tickets Críticos', 
      value: kpis.ticketsCriticos, 
      icon: AlertTriangle, 
      color: kpis.ticketsCriticos > 0 ? 'text-rose-600' : 'text-slate-400', 
      bg: kpis.ticketsCriticos > 0 ? 'bg-rose-50' : 'bg-slate-50',
      trend: 'Alerta',
      trendColor: kpis.ticketsCriticos > 0 ? 'text-rose-500' : 'text-slate-400'
    }
  ]

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
      {metrics.map((metric, i) => (
        <motion.div
          key={metric.label}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ delay: i * 0.1 }}
          className="glass-card p-6 flex flex-col justify-between"
        >
          <div className="flex items-start justify-between mb-4">
            <div className={cn("p-3 rounded-2xl shadow-sm", metric.bg, metric.color)}>
              <metric.icon size={24} />
            </div>
            <div className={cn("text-xs font-bold px-2 py-1 rounded-full", metric.bg, metric.trendColor)}>
              {metric.trend}
            </div>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-400 uppercase tracking-wider mb-1">{metric.label}</p>
            <h3 className="text-3xl font-black text-slate-800 tracking-tight">{metric.value}</h3>
          </div>
        </motion.div>
      ))}
    </div>
  )
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ')
}
