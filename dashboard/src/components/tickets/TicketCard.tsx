import { Ticket } from '@/hooks/use-tickets'

interface TicketCardProps {
  ticket: Ticket
  onClick?: (ticket: Ticket) => void
}

const priorityConfig = {
  critica: { color: 'border-red-500', bg: 'bg-red-50', icon: '🚨' },
  alta: { color: 'border-orange-500', bg: 'bg-orange-50', icon: '🟠' },
  media: { color: 'border-green-500', bg: 'bg-green-50', icon: '🟢' },
  baixa: { color: 'border-gray-500', bg: 'bg-gray-50', icon: '⚪' }
}

const statusConfig = {
  novo: { label: 'Novo', class: 'bg-blue-100 text-blue-800' },
  bot_ativo: { label: 'Bot Ativo', class: 'bg-purple-100 text-purple-800' },
  aguardando_humano: { label: 'Aguardando Humano', class: 'bg-yellow-100 text-yellow-800' },
  em_atendimento: { label: 'Em Atendimento', class: 'bg-orange-100 text-orange-800' },
  resolvido: { label: 'Resolvido', class: 'bg-green-100 text-green-800' }
}

const channelIcons = {
  whatsapp: '💬',
  telegram: '✈️',
  web: '🌐'
}

export function TicketCard({ ticket, onClick }: TicketCardProps) {
  const priority = priorityConfig[ticket.priority]
  const status = statusConfig[ticket.status]
  const channelIcon = channelIcons[ticket.channel]
  
  // Calcular tempo de espera
  const waitTime = calculateWaitTime(ticket.created_at)

  return (
    <div
      onClick={() => onClick?.(ticket)}
      className={`bg-white rounded-lg shadow-sm border-l-4 ${priority.color} p-4 cursor-pointer hover:shadow-md transition cursor-pointer`}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{priority.icon}</span>
          <div>
            <h3 className="font-semibold text-gray-900">
              {ticket.customer?.name || 'Cliente não identificado'}
            </h3>
            <p className="text-sm text-gray-500">
              {channelIcon} {ticket.channel} • #{ticket.id.slice(0, 8)}
            </p>
          </div>
        </div>
        <span className={`px-2 py-1 rounded-full text-xs font-medium ${status.class}`}>
          {status.label}
        </span>
      </div>

      {/* Intent */}
      {ticket.intent && (
        <p className="text-sm text-gray-700 mb-3 line-clamp-2">
          {ticket.intent}
        </p>
      )}

      {/* Footer */}
      <div className="flex justify-between items-center text-xs text-gray-500">
        <span>⏱️ {waitTime}</span>
        {ticket.current_agent && (
          <span className="flex items-center gap-1">
            🤖 {ticket.current_agent}
          </span>
        )}
        {ticket.priority === 'critica' && (
          <span className="text-red-600 font-medium animate-pulse">
            CRÍTICO
          </span>
        )}
      </div>
    </div>
  )
}

function calculateWaitTime(createdAt: string): string {
  const now = new Date()
  const created = new Date(createdAt)
  const diffMs = now.getTime() - created.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  const diffHours = Math.floor(diffMins / 60)

  if (diffHours > 24) {
    const days = Math.floor(diffHours / 24)
    return `${days}d ${diffHours % 24}h`
  } else if (diffHours > 0) {
    return `${diffHours}h ${diffMins % 60}m`
  } else {
    return `${diffMins}m`
  }
}
