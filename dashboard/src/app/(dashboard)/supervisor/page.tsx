'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { useKpis } from '@/hooks/use-kpis'
import { KpiCards } from '@/components/kpis/KpiCards'
import { QueueBySector } from '@/components/kpis/QueueBySector'
import { AgentsList, useAgents } from '@/components/kpis/AgentsList'
import { ExportButton } from '@/components/export/ExportButton'

export default function SupervisorDashboardPage() {
  const router = useRouter()
  const [isSupervisor, setIsSupervisor] = useState(false)
  const [checking, setChecking] = useState(true)
  const supabase = createClient()
  const { kpis, loading: kpisLoading } = useKpis(true)
  const { agents, loading: agentsLoading } = useAgents(true)

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando dashboard...</p>
        </div>
      </div>
    )
  }

  if (!isSupervisor) {
    return null
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                👑 Painel do Supervisor
              </h1>
              <p className="text-sm text-gray-600">
                Visão geral em tempo real
              </p>
            </div>
            <div className="flex items-center gap-4">
              <ExportButton type="kpis" data={kpis} variant="secondary" />
              <ExportButton type="report" data={{ kpis }} variant="primary" />
              <button
                onClick={async () => {
                  await supabase.auth.signOut()
                  router.push('/login')
                }}
                className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-lg hover:bg-gray-50 transition"
              >
                Sair
              </button>
            </div>
          </div>
        </div>
      </header>

      {/* Main Content */}
      <main className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        {/* KPIs */}
        {kpis && <KpiCards kpis={kpis} />}

        {/* Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Fila por Setor */}
          {kpis && (
            <QueueBySector
              suporte={kpis.filaSuporte}
              financeiro={kpis.filaFinanceiro}
              comercial={kpis.filaComercial}
            />
          )}

          {/* Agentes Online */}
          <AgentsList agents={agents} loading={agentsLoading} />
        </div>

        {/* Alertas */}
        {kpis && kpis.ticketsCriticos > 0 && (
          <div className="mt-6 bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg flex items-center justify-between">
            <div>
              <strong>⚠️ Atenção:</strong> {kpis.ticketsCriticos} ticket(s) crítico(s) aguardando atendimento
            </div>
            <button className="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm">
              Ver Tickets
            </button>
          </div>
        )}

        {/* Fila sobrecarregada */}
        {kpis && kpis.filaSuporte > 15 && (
          <div className="mt-6 bg-yellow-50 border border-yellow-200 text-yellow-700 px-4 py-3 rounded-lg">
            <strong>🔔 Alerta:</strong> Fila de Suporte sobrecarregada ({kpis.filaSuporte} tickets)
          </div>
        )}
      </main>
    </div>
  )
}
