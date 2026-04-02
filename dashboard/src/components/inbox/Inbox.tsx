'use client'

import { useMessages, sendMessage, updateTicketStatus } from '@/hooks/use-messages'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { Ticket } from '@/hooks/use-tickets'
import { useRouter } from 'next/navigation'
import { User, CheckCircle2, Bot, ShieldOff } from 'lucide-react'

interface InboxProps {
  ticket: Ticket
  senderId: string
  onBack?: () => void
}

const statusLabels = {
  novo: 'Novo',
  bot_ativo: '🤖 IA Ativa',
  aguardando_humano: '⏳ Aguardando Humano',
  em_atendimento: '👤 Em Atendimento',
  resolvido: '✅ Resolvido'
}

const priorityLabels = {
  critica: '🚨 Crítica',
  alta: '🟠 Alta',
  media: '🟢 Média',
  baixa: '⚪ Baixa'
}

export function Inbox({ ticket, senderId, onBack }: InboxProps) {
  const router = useRouter()
  const { messages, loading } = useMessages({ ticketId: ticket.id })
  const [currentStatus, setCurrentStatus] = (require('react').useState)(ticket.status)

  const handleStatusChange = async (newStatus: any) => {
    const result = await updateTicketStatus(ticket.id, newStatus)
    if (result.success) {
      setCurrentStatus(newStatus)
      if (newStatus === 'resolvido') {
        router.push('/dashboard')
      }
    }
  }

  const handleTakeOwnership = async () => {
    // Ao assumir, mudamos o status para 'em_atendimento' e a IA para de responder automaticamente
    await handleStatusChange('em_atendimento')
  }

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="bg-white border-b px-4 py-3 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-gray-100 rounded-lg transition text-slate-500"
          >
            ← Voltar
          </button>
          <div>
            <h2 className="font-bold text-slate-900 flex items-center gap-2">
              Ticket #{ticket.id.slice(0, 8)}
              <span className="text-xs font-medium text-slate-400">| {ticket.channel}</span>
            </h2>
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <span className="font-medium text-blue-600">{ticket.customer?.name || 'Cliente'}</span>
              <span>•</span>
              <span className="text-slate-400">{ticket.customer?.phone || ''}</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          {/* Botões de Ação Rápida */}
          {currentStatus !== 'em_atendimento' && currentStatus !== 'resolvido' && (
            <button
              onClick={handleTakeOwnership}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-xl text-sm font-bold hover:bg-blue-700 transition shadow-sm active:scale-95"
            >
              <User size={16} />
              Assumir Atendimento
            </button>
          )}

          {currentStatus === 'em_atendimento' && (
            <button
              onClick={() => handleStatusChange('resolvido')}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition shadow-sm"
            >
              <CheckCircle2 size={16} />
              Finalizar Ticket
            </button>
          )}

          {/* Status Badge */}
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
            currentStatus === 'bot_ativo' ? 'bg-purple-50 text-purple-700 border-purple-100' :
            currentStatus === 'em_atendimento' ? 'bg-orange-50 text-orange-700 border-orange-100' :
            currentStatus === 'resolvido' ? 'bg-emerald-50 text-emerald-700 border-emerald-100' :
            'bg-slate-100 text-slate-700 border-slate-200'
          }`}>
            {statusLabels[currentStatus] || currentStatus}
          </div>
        </div>
      </div>

      {/* Ticket Info Bar */}
      <div className="bg-slate-50 border-b px-6 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold uppercase tracking-wider">Setor:</span>
            <span className="px-2 py-0.5 bg-white border border-slate-200 rounded text-slate-700 font-bold capitalize">
              {ticket.sector || 'Geral'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold uppercase tracking-wider">Intenção:</span>
            <span className="px-2 py-0.5 bg-blue-50 border border-blue-100 rounded text-blue-700 font-bold">
              {ticket.intent || 'Classificando...'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 font-bold uppercase tracking-wider">Status IA:</span>
            <span className={`font-bold flex items-center gap-1 ${currentStatus === 'bot_ativo' ? 'text-purple-600' : 'text-slate-400'}`}>
              {currentStatus === 'bot_ativo' ? <Bot size={12} /> : <ShieldOff size={12} />}
              {currentStatus === 'bot_ativo' ? 'Monitorando' : 'Desativada'}
            </span>
          </div>
        </div>
        
        <div className="flex items-center gap-2 text-slate-400">
           <span className="font-bold">Prioridade:</span>
           <span className="font-bold">{priorityLabels[ticket.priority]}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-hidden bg-white">
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
