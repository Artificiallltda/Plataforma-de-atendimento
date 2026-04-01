'use client'

import { useEffect, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Inbox } from '@/components/inbox/Inbox'
import { Ticket } from '@/hooks/use-tickets'

export default function TicketDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)
  const [userId, setUserId] = useState('')
  const supabase = createClient()

  useEffect(() => {
    const loadData = async () => {
      const ticketId = params.id as string

      // Buscar dados do ticket
      const { data: ticketData, error: ticketError } = await supabase
        .from('tickets')
        .select(`
          *,
          customer:customers (
            name,
            phone
          )
        `)
        .eq('id', ticketId)
        .single()

      if (ticketError || !ticketData) {
        console.error('Erro ao carregar ticket:', ticketError)
        router.push('/dashboard')
        return
      }

      setTicket(ticketData)

      // Buscar usuário atual
      const { data: { user } } = await supabase.auth.getUser()
      if (user) {
        setUserId(user.id)
      }

      setLoading(false)
    }

    loadData()
  }, [params.id, router, supabase])

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando inbox...</p>
        </div>
      </div>
    )
  }

  if (!ticket) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="text-center text-gray-500">
          <p>Ticket não encontrado</p>
          <button
            onClick={() => router.push('/dashboard')}
            className="mt-4 px-4 py-2 bg-indigo-600 text-white rounded-lg hover:bg-indigo-700"
          >
            Voltar ao Dashboard
          </button>
        </div>
      </div>
    )
  }

  return <Inbox ticket={ticket} senderId={userId} onBack={() => router.push('/dashboard')} />
}
