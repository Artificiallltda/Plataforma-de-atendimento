import { Ticket } from '@/hooks/use-tickets'
import { getCustomerLabel } from '@/lib/customer-display'

interface TicketCardProps {
  ticket: Ticket
  onClick?: (ticket: Ticket) => void
}

const priorityConfig = {
  critica: { color: 'border-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/20', icon: '🚨' },
  alta: { color: 'border-orange-500', bg: 'bg-orange-50 dark:bg-orange-900/20', icon: '🟠' },
  media: { color: 'border-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20', icon: '🟢' },
  baixa: { color: 'border-slate-300', bg: 'bg-slate-50 dark:bg-slate-700/40', icon: '⚪' }
}

const statusConfig = {
  novo: { label: 'Novo', class: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-300' },
  bot_ativo: { label: 'Bot Ativo', class: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-300' },
  aguardando_humano: { label: 'Aguardando Humano', class: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-300' },
  em_atendimento: { label: 'Em Atendimento', class: 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-300' },
  resolvido: { label: 'Resolvido', class: 'bg-emerald-100 dark:bg-emerald-900/30 text-emerald-800 dark:text-emerald-300' }
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
      className={`bg-white dark:bg-slate-800 rounded-lg shadow-sm border-l-4 ${priority.color} p-4 cursor-pointer hover:shadow-md dark:hover:bg-slate-800/80 transition`}
    >
      {/* Header */}
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <span className="text-xl">{priority.icon}</span>
          <div>
            <h3 className="font-semibold text-slate-900 dark:text-slate-100">
              {getCustomerLabel(ticket)}
            </h3>
            <p className="text-sm text-slate-500 dark:text-slate-400">
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
        <p className="text-sm text-slate-700 dark:text-slate-300 mb-3 line-clamp-2">
          {ticket.intent}
        </p>
      )}

      {/* Footer */}
      <div className="flex justify-between items-center text-xs text-slate-500 dark:text-slate-400">
        <span>⏱️ {waitTime}</span>
        {ticket.current_agent && (
          <span className="flex items-center gap-1">
            🤖 {ticket.current_agent}
          </span>
        )}
        {ticket.priority === 'critica' && (
          <span className="text-rose-600 dark:text-rose-400 font-medium animate-pulse">
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
