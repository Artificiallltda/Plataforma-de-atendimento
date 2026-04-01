'use client'

import { useMessages, sendMessage, updateTicketStatus } from '@/hooks/use-messages'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { Ticket } from '@/hooks/use-tickets'

interface InboxProps {
  ticket: Ticket
  senderId: string
  onBack?: () => void
}

const statusLabels = {
  novo: 'Novo',
  bot_ativo: 'Bot Ativo',
  aguardando_humano: 'Aguardando Humano',
  em_atendimento: 'Em Atendimento',
  resolvido: 'Resolvido'
}

const priorityLabels = {
  critica: '🚨 Crítica',
  alta: '🟠 Alta',
  media: '🟢 Média',
  baixa: '⚪ Baixa'
}

export function Inbox({ ticket, senderId, onBack }: InboxProps) {
  const { messages, loading } = useMessages({ ticketId: ticket.id })

  const handleStatusChange = (newStatus: string) => {
    console.log('Status alterado para:', newStatus)
    // Opcional: mostrar toast de confirmação
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition"
          >
            ← Voltar
          </button>
          <div>
            <h2 className="font-semibold text-gray-900">
              Ticket #{ticket.id.slice(0, 8)}
            </h2>
            <div className="flex items-center gap-2 text-sm text-gray-500">
              <span>{ticket.customer?.name || 'Cliente'}</span>
              <span>•</span>
              <span>{ticket.channel}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Status Badge */}
          <span className="px-3 py-1 bg-indigo-100 text-indigo-800 rounded-full text-sm font-medium">
            {statusLabels[ticket.status]}
          </span>

          {/* Priority Badge */}
          <span className="px-3 py-1 bg-gray-100 text-gray-800 rounded-full text-sm">
            {priorityLabels[ticket.priority]}
          </span>
        </div>
      </div>

      {/* Ticket Info Bar */}
      <div className="bg-gray-50 border-b px-4 py-2 flex items-center gap-6 text-sm">
        <div>
          <span className="text-gray-500">Intenção:</span>
          <span className="ml-2 text-gray-900 font-medium">{ticket.intent || 'Não classificada'}</span>
        </div>
        <div>
          <span className="text-gray-500">Agente IA:</span>
          <span className="ml-2 text-gray-900 font-medium">{ticket.currentAgent || 'Nenhum'}</span>
        </div>
        <div>
          <span className="text-gray-500">Criado:</span>
          <span className="ml-2 text-gray-900">{new Date(ticket.createdAt).toLocaleString('pt-BR')}</span>
        </div>
        {ticket.csatScore && (
          <div>
            <span className="text-gray-500">CSAT:</span>
            <span className="ml-2 text-yellow-600 font-medium">
              {'⭐'.repeat(ticket.csatScore)}
            </span>
          </div>
        )}
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden">
        <MessageList messages={messages} loading={loading} />
      </div>

      {/* Input */}
      <MessageInput
        ticketId={ticket.id}
        customerId={ticket.customerId}
        channel={ticket.channel}
        senderId={senderId}
        onMessageSent={() => {}}
        onStatusChange={handleStatusChange}
      />
    </div>
  )
}
