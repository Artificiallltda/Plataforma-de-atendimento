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
    let channel: any = null;

    const loadData = async () => {
      const ticketId = params.id as string

      // BUSCAR TICKET COM FALLBACK DE IDS (customer_id vs customerId)
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

      // NORMALIZAÇÃO DE ID PARA O FRONTEND
      let customerId = ticketData.customer_id || (ticketData as any).customerId;
      
      // BUSCA DE EMERGÊNCIA: Se o ID vier null, tentar descobrir pelo banco (Messages ou Inbox)
      if (!customerId) {
        console.log('⚠️ [TicketPage] ID do cliente ausente no ticket. Iniciando busca de emergência...');
        const { data: lastMsg } = await supabase
          .from('messages')
          .select('customer_id')
          .eq('ticket_id', ticketId)
          .limit(1)
          .single();
        
        if (lastMsg?.customer_id) {
          console.log('✅ [TicketPage] ID recuperado com sucesso!', lastMsg.customer_id);
          customerId = lastMsg.customer_id;
        }
      }

      console.log('🔍 DEBUG TICKET:', ticketData.id, customerId);

      const normalizedTicket = {
        ...ticketData,
        customer_id: customerId
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
            customer_id: payload.new.customer_id || (payload.new as any).customerId 
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

  return <Inbox ticket={ticket} senderId={userId} onBack={() => router.push('/dashboard')} />
}
