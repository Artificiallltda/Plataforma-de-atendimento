'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams, useRouter } from 'next/navigation'
import { createClient } from '@/lib/supabase/client'
import { Inbox } from '@/components/inbox/Inbox'
import { Ticket } from '@/hooks/use-tickets'

export default function TicketDetailPage() {
  const params = useParams()
  const router = useRouter()
  const [ticket, setTicket] = useState<Ticket | null>(null)
  const [loading, setLoading] = useState(true)
  const [user_id, setUserId] = useState('')
  const supabase = useMemo(() => createClient(), [])

  useEffect(() => {
    let channel: any = null;

    const loadData = async () => {
      const ticketId = params.id as string

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

      let customer_id = ticketData.customer_id

      if (!customer_id) {
        console.log('⚠️ [TicketPage] ID do cliente em falta. Iniciando auto-correção...');
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('customer_id')
          .eq('ticket_id', ticketId)
          .limit(1)
          .single();
        
        if (lastMsg?.customer_id) {
          console.log('✅ [TicketPage] ID recuperado! Atualizando banco de dados...');
          customer_id = lastMsg.customer_id;
          
          await supabase.from('tickets').update({ customer_id } as any).eq('id', ticketId);
        }
      }

      console.log('🔍 DEBUG TICKET:', ticketData.id, customer_id);

      const normalizedTicket = {
        ...ticketData,
        customer_id
      }

      setTicket(normalizedTicket)

      // BUSCAR USUÁRIO ATUAL
      const { data: { user } } = await supabase.auth.getUser()
      if (user) setUserId(user.id)

      setLoading(false)

      // ATIVAR REALTIME NA PÁGINA DE DETALHE
      channel = supabase
        .channel(`ticket-detail-${ticketId}`)
        .on('postgres_changes', { 
          event: 'UPDATE', 
          schema: 'public', 
          table: 'tickets',
          filter: `id=eq.${ticketId}`
        }, (payload) => {
          console.log('🔄 Ticket atualizado via Realtime!', payload.new);
          setTicket(prev => ({ 
            ...prev, 
            ...payload.new,
            customer_id: payload.new.customer_id
          }) as any);
        })
        .subscribe()
    }

    loadData()

    return () => {
      if (channel) supabase.removeChannel(channel)
    }
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

  return <Inbox ticket={ticket} sender_id={user_id} onBack={() => router.push('/dashboard')} />
}
