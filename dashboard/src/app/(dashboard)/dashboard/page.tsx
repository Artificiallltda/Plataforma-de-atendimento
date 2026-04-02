'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { KanbanBoard } from '@/components/kanban/KanbanBoard'
import { useTickets } from '@/hooks/use-tickets'
import { Loader2 } from 'lucide-react'

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [sector, setSector] = useState<string>('Geral')
  const supabase = createClient()
  
  // CORREÇÃO: Filtro case-insensitive e visibilidade global para supervisores
  const isGlobalSector = ['supervisor', 'geral', 'ceo', 'admin'].includes(sector?.toLowerCase().trim())
  const { tickets, loading: ticketsLoading } = useTickets({ 
    sector: isGlobalSector ? undefined : sector, 
    enabled: true 
  })

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

      if (agent?.sector) {
        setSector(agent.sector)
      } else {
        setSector('Supervisor')
      }
      setLoading(false)
    }

    loadData()
  }, [router, supabase.auth])

  if (loading) {
    return (
      <div className="space-y-10 h-full animate-pulse">
        {/* Skeleton Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-6">
          <div className="space-y-3">
            <div className="h-10 w-72 bg-slate-200 rounded-2xl" />
            <div className="h-4 w-56 bg-slate-100 rounded-xl" />
          </div>
          <div className="h-12 w-40 bg-slate-100 rounded-2xl" />
        </div>
        
        {/* Skeleton Kanban Columns */}
        <div className="flex gap-8 overflow-hidden pt-4">
          {[1, 2, 3].map(i => (
            <div key={i} className="w-[350px] min-w-[350px] h-[700px] bg-slate-100/40 rounded-[32px] border border-slate-200/20" />
          ))}
        </div>
      </div>
    )
  }

  return (
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
  )
}
