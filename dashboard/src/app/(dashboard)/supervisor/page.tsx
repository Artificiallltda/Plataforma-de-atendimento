'use client'

import React, { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useKpis } from '@/hooks/use-kpis'
import { ModernLayout } from '@/components/layout/ModernLayout'
import { LiveMetrics } from '@/components/analytics/LiveMetrics'
import { PerformanceCharts } from '@/components/analytics/PerformanceCharts'
import { ExportButton } from '@/components/export/ExportButton'
import { 
  Loader2, 
  TrendingUp, 
  ShieldCheck, 
  Users, 
  MessageSquare,
  ChevronRight,
  MoreVertical
} from 'lucide-react'
import { motion } from 'framer-motion'

export default function SupervisorDashboardPage() {
  const router = useRouter()
  const [isSupervisor, setIsSupervisor] = useState(false)
  const [checking, setChecking] = useState(true)
  const supabase = createClient()
  const { kpis, loading: kpisLoading } = useKpis(true)

  useEffect(() => {
    const checkPermission = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/login')
        return
      }

      const { data: agent } = await supabase
        .from('agents')
        .select('sector')
        .eq('email', user.email)
        .single()

      if (agent?.sector !== 'supervisor') {
        router.push('/dashboard')
        return
      }

      setIsSupervisor(true)
      setChecking(false)
    }

    checkPermission()
  }, [router, supabase.auth])

  if (checking || kpisLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="animate-spin h-12 w-12 text-blue-600 mx-auto" />
          <p className="mt-4 text-slate-500 font-medium">Carregando Painel de Controle...</p>
        </div>
      </div>
    )
  }

  if (!isSupervisor) return null

  // Mapear KPIs para o componente LiveMetrics
  const mappedKpis = {
    ticketsAbertos: kpis?.ticketsAbertos || 0,
    ticketsCriticos: kpis?.ticketsCriticos || 0,
    tmrMedio: kpis?.tmrMedio || 0,
    csatMedio: kpis?.csatMedio || 0,
    botContainment: kpis?.botContainmentRate || 0
  }

  return (
    <ModernLayout>
      <div className="space-y-8 pb-12">
        {/* Header Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
              Control Center <ShieldCheck className="text-blue-600" />
            </h1>
            <p className="text-slate-500 mt-1">Visão holística e analítica da operação em tempo real.</p>
          </div>
          <div className="flex items-center gap-3">
            <ExportButton type="report" data={{ kpis }} variant="primary" />
            <button className="p-3 bg-white border border-slate-200 rounded-2xl text-slate-400 hover:text-slate-600 transition-colors shadow-sm">
              <MoreVertical size={20} />
            </button>
          </div>
        </div>

        {/* Live Metrics Grid */}
        <LiveMetrics kpis={mappedKpis} />

        {/* Charts Section */}
        <PerformanceCharts />

        {/* Secondary Info Grid */}
        <div className="grid grid-cols-1 xl:grid-cols-3 gap-8">
          {/* Fila por Setor */}
          <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            className="glass-card p-8 xl:col-span-2"
          >
            <div className="flex items-center justify-between mb-8">
              <h4 className="font-bold text-slate-800 text-lg">Distribuição de Carga</h4>
              <div className="flex items-center gap-1.5 text-xs font-bold text-blue-600 bg-blue-50 px-3 py-1 rounded-full uppercase tracking-tight">
                <Users size={14} /> Ativos Agora
              </div>
            </div>

            <div className="space-y-6">
              <SectorProgress label="Suporte Técnico" count={kpis?.filaSuporte || 0} total={50} color="bg-blue-500" />
              <SectorProgress label="Financeiro" count={kpis?.filaFinanceiro || 0} total={50} color="bg-emerald-500" />
              <SectorProgress label="Comercial" count={kpis?.filaComercial || 0} total={50} color="bg-purple-500" />
            </div>
          </motion.div>

          {/* Quick Actions / Alerts */}
          <motion.div 
             initial={{ opacity: 0, y: 20 }}
             animate={{ opacity: 1, y: 0 }}
             className="glass-card p-8 bg-slate-900 border-none text-white overflow-hidden relative"
          >
            <div className="absolute top-0 right-0 p-8 opacity-10">
              <TrendingUp size={120} />
            </div>
            <h4 className="font-bold text-xl mb-4 relative z-10">IA Insights</h4>
            <div className="space-y-4 relative z-10">
              <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
                <p className="text-sm font-medium text-white/90">A contenção do bot aumentou 12% na última hora após o deploy do novo RouterAgent.</p>
              </div>
              <div className="p-4 bg-white/10 rounded-2xl backdrop-blur-md border border-white/10">
                <p className="text-sm font-medium text-white/90">O setor de suporte pode precisar de reforço humano em breve devido ao pico de demanda.</p>
              </div>
            </div>
            <button className="w-full mt-6 py-3 bg-blue-600 hover:bg-blue-700 rounded-xl font-bold flex items-center justify-center gap-2 transition-all group">
              Ver Relatório Completo
              <ChevronRight size={18} className="group-hover:translate-x-1 transition-transform" />
            </button>
          </motion.div>
        </div>
      </div>
    </ModernLayout>
  )
}

function SectorProgress({ label, count, total, color }: any) {
  const percentage = Math.min((count / total) * 100, 100)
  return (
    <div className="space-y-2">
      <div className="flex justify-between items-end">
        <span className="text-sm font-bold text-slate-700">{label}</span>
        <span className="text-xs font-bold text-slate-400 uppercase tracking-wider">{count} Tickets</span>
      </div>
      <div className="h-3 w-full bg-slate-100 rounded-full overflow-hidden border border-slate-200">
        <motion.div 
          initial={{ width: 0 }}
          animate={{ width: `${percentage}%` }}
          transition={{ duration: 1, ease: 'easeOut' }}
          className={cn("h-full rounded-full shadow-sm", color)}
        />
      </div>
    </div>
  )
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ')
}
