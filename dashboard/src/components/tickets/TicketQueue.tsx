'use client'

import { useState } from 'react'
import { useTickets, Ticket } from '@/hooks/use-tickets'
import { TicketCard } from './TicketCard'
import { useRouter } from 'next/navigation'

interface TicketQueueProps {
  sector?: string
}

const statusFilters = [
  { value: 'all', label: 'Todos' },
  { value: 'novo', label: 'Novos' },
  { value: 'bot_ativo', label: 'Bot Ativo' },
  { value: 'aguardando_humano', label: 'Aguardando Humano' },
  { value: 'em_atendimento', label: 'Em Atendimento' }
]

export function TicketQueue({ sector }: TicketQueueProps) {
  const router = useRouter()
  const [statusFilter, setStatusFilter] = useState('all')
  const { tickets, loading, error } = useTickets({ 
    sector, 
    status: statusFilter !== 'all' ? statusFilter : undefined,
    enabled: true 
  })

  // Calcular contadores
  const counters = {
    total: tickets.length,
    novo: tickets.filter(t => t.status === 'novo').length,
    bot_ativo: tickets.filter(t => t.status === 'bot_ativo').length,
    aguardando_humano: tickets.filter(t => t.status === 'aguardando_humano').length,
    em_atendimento: tickets.filter(t => t.status === 'em_atendimento').length,
    critica: tickets.filter(t => t.priority === 'critica').length
  }

  const handleTicketClick = (ticket: Ticket) => {
    router.push(`/tickets/${ticket.id}`)
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="text-center">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600 mx-auto"></div>
          <p className="mt-4 text-gray-600">Carregando tickets...</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800/50 text-red-700 dark:text-red-300 px-4 py-3 rounded-lg">
        <strong>Erro:</strong> {error instanceof Error ? error.message : String(error)}
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {/* Contadores */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
        <CounterCard label="Total" value={counters.total} color="bg-gray-100 text-gray-800" />
        <CounterCard label="Novos" value={counters.novo} color="bg-blue-100 text-blue-800" />
        <CounterCard label="Bot" value={counters.bot_ativo} color="bg-purple-100 text-purple-800" />
        <CounterCard label="Humano" value={counters.aguardando_humano} color="bg-yellow-100 text-yellow-800" />
        <CounterCard label="Críticos" value={counters.critica} color="bg-red-100 text-red-800" />
      </div>

      {/* Filtros */}
      <div className="flex flex-wrap gap-2">
        {statusFilters.map(filter => (
          <button
            key={filter.value}
            onClick={() => setStatusFilter(filter.value)}
            className={`px-4 py-2 rounded-lg text-sm font-medium transition ${
              statusFilter === filter.value
                ? 'bg-indigo-600 text-white'
                : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'
            }`}
          >
            {filter.label}
          </button>
        ))}
      </div>

      {/* Lista de Tickets */}
      {tickets.length === 0 ? (
        <div className="text-center py-12 bg-white rounded-lg border border-dashed border-gray-300">
          <p className="text-gray-500">Nenhum ticket encontrado</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {tickets.map(ticket => (
            <TicketCard
              key={ticket.id}
              ticket={ticket}
              onClick={handleTicketClick}
            />
          ))}
        </div>
      )}
    </div>
  )
}

function CounterCard({ label, value, color }: { label: string; value: number; color: string }) {
  return (
    <div className={`rounded-lg p-3 ${color}`}>
      <p className="text-2xl font-bold">{value}</p>
      <p className="text-xs opacity-80">{label}</p>
    </div>
  )
}
