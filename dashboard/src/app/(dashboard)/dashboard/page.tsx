'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { ModernLayout } from '@/components/layout/ModernLayout'
import { useTickets } from '@/hooks/use-tickets'
import { Loader2, MessageSquare, Zap } from 'lucide-react'
import { motion } from 'framer-motion'

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [sector, setSector] = useState<string>('')
  const supabase = createClient()
  const { tickets, loading: ticketsLoading } = useTickets({ sector: sector === 'supervisor' ? undefined : sector, enabled: true })

  useEffect(() => {
    const loadData = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      
      if (!user) {
        router.push('/login')
        return
      }

      setUser(user)

      // Buscar setor do agente
      const { data: agent } = await supabase
        .from('agents')
        .select('sector')
        .eq('email', user.email)
        .single()

      setSector(agent?.sector || 'unknown')
      setLoading(false)
    }

    loadData()
  }, [router, supabase.auth])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-slate-50">
        <div className="text-center">
          <Loader2 className="animate-spin h-12 w-12 text-blue-600 mx-auto" />
          <p className="mt-4 text-slate-500 font-medium">Iniciando PAA Console...</p>
        </div>
      </div>
    )
  }

  return (
    <ModernLayout>
      <div className="space-y-8 h-full flex flex-col">
        {/* Welcome Section */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight flex items-center gap-3">
              Olá, {user?.email?.split('@')[0]} 👋
            </h1>
            <p className="text-slate-500 mt-1">Gerencie a fila de atendimento do setor <span className="text-blue-600 font-bold capitalize">{sector}</span>.</p>
          </div>
          <div className="flex items-center gap-3">
            <div className="bg-emerald-50 text-emerald-600 px-4 py-2 rounded-2xl border border-emerald-100 flex items-center gap-2 text-sm font-bold shadow-sm">
              <div className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse" />
              Sincronizado
            </div>
          </div>
        </div>

        {/* Board */}
        <div className="flex-1 min-h-0">
          <KanbanBoard initialTickets={tickets} sectorFilter={sector} />
        </div>
      </div>
    </ModernLayout>
  )
}
