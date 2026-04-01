'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { TicketQueue } from '@/components/tickets/TicketQueue'
import { ExportButton } from '@/components/export/ExportButton'
import { useTickets } from '@/hooks/use-tickets'

export default function DashboardPage() {
  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [sector, setSector] = useState<string>('')
  const supabase = createClient()
  const { tickets } = useTickets({ sector: sector === 'supervisor' ? undefined : sector, enabled: true })

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
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando...</p>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white shadow-sm border-b">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex justify-between items-center h-16">
            <div>
              <h1 className="text-2xl font-bold text-gray-900">
                PAA Dashboard
              </h1>
              <p className="text-sm text-gray-600">
                Setor: <span className="font-medium capitalize">{sector}</span>
              </p>
            </div>
            <div className="flex items-center gap-4">
              <ExportButton type="tickets" data={tickets} variant="secondary" />
              <div className="text-right">
                <p className="text-sm font-medium text-gray-900">
                  {user?.email}
                </p>
                <p className="text-xs text-gray-500 capitalize">{sector}</p>
              </div>
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
        {/* Welcome */}
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 mb-2">
            Fila de Tickets
          </h2>
          <p className="text-gray-600">
            Visualize e gerencie tickets em tempo real
          </p>
        </div>

        {/* Ticket Queue */}
        <TicketQueue sector={sector === 'supervisor' ? undefined : sector} />
      </main>
    </div>
  )
}
