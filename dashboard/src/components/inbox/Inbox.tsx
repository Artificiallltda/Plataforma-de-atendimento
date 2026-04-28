'use client'

import { useMessages, sendMessage, updateTicketStatus } from '@/hooks/use-messages'
import { MessageList } from './MessageList'
import { MessageInput } from './MessageInput'
import { Ticket } from '@/hooks/use-tickets'
import { useRouter } from 'next/navigation'
import { useState } from 'react'
import { User, CheckCircle2, Bot, ShieldOff } from 'lucide-react'
import { getCustomerLabel, getCustomerSubLabel } from '@/lib/customer-display'
import { ConfirmDialog } from '@/components/ui/ConfirmDialog'

interface InboxProps {
  ticket: Ticket
  sender_id: string
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

export function Inbox({ ticket, sender_id, onBack }: InboxProps) {
  const router = useRouter()
  const { messages, loading } = useMessages({ 
    ticket_id: ticket.id,
    customer_id: ticket.customer_id 
  })
  const [currentStatus, setCurrentStatus] = useState(ticket.status)
  const [confirmResolve, setConfirmResolve] = useState(false)

  const handleStatusChange = async (newStatus: any) => {
    const result = await updateTicketStatus(ticket.id, newStatus)
    if (result.success) {
      setCurrentStatus(newStatus)
      if (newStatus === 'resolvido') {
        router.push('/dashboard')
      }
    }
  }

  const requestResolve = () => setConfirmResolve(true)
  const confirmResolveAction = async () => {
    setConfirmResolve(false)
    await handleStatusChange('resolvido')
  }

  const handleTakeOwnership = async () => {
    // Ao assumir, mudamos o status para 'em_atendimento' e a IA para de responder automaticamente
    await handleStatusChange('em_atendimento')
  }

  const customerLabel = getCustomerLabel(ticket)
  const customerSubLabel = getCustomerSubLabel(ticket)

  return (
    <div className="h-[calc(100vh-4rem)] flex flex-col">
      {/* Header */}
      <div className="bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-700 px-4 py-3 flex items-center justify-between shadow-sm z-10">
        <div className="flex items-center gap-3">
          <button
            onClick={onBack}
            className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition text-slate-500 dark:text-slate-400"
          >
            ← Voltar
          </button>
          <div>
            <h2 className="font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
              Ticket #{ticket.id.slice(0, 8)}
              <span className="text-xs font-medium text-slate-400 dark:text-slate-500">| {ticket.channel}</span>
            </h2>
            <div className="flex items-center gap-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="font-medium text-blue-600 dark:text-blue-400">{customerLabel}</span>
              {customerSubLabel && (
                <>
                  <span>•</span>
                  <span className="text-slate-400 dark:text-slate-500">{customerSubLabel}</span>
                </>
              )}
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
              onClick={requestResolve}
              className="flex items-center gap-2 px-4 py-2 bg-emerald-600 text-white rounded-xl text-sm font-bold hover:bg-emerald-700 transition shadow-sm"
            >
              <CheckCircle2 size={16} />
              Finalizar Ticket
            </button>
          )}

          {/* Status Badge */}
          <div className={`px-3 py-1.5 rounded-full text-xs font-bold border ${
            currentStatus === 'bot_ativo' ? 'bg-purple-50 dark:bg-purple-900/30 text-purple-700 dark:text-purple-300 border-purple-100 dark:border-purple-800/50' :
            currentStatus === 'em_atendimento' ? 'bg-orange-50 dark:bg-orange-900/30 text-orange-700 dark:text-orange-300 border-orange-100 dark:border-orange-800/50' :
            currentStatus === 'resolvido' ? 'bg-emerald-50 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-300 border-emerald-100 dark:border-emerald-800/50' :
            'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border-slate-200 dark:border-slate-700'
          }`}>
            {statusLabels[currentStatus] || currentStatus}
          </div>
        </div>
      </div>

      {/* Ticket Info Bar */}
      <div className="bg-slate-50 dark:bg-slate-800/50 border-b border-slate-200 dark:border-slate-700 px-6 py-2 flex items-center justify-between text-xs">
        <div className="flex items-center gap-6">
          <div className="flex items-center gap-2">
            <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Setor:</span>
            <span className="px-2 py-0.5 bg-white dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded text-slate-700 dark:text-slate-200 font-bold capitalize">
              {ticket.sector || 'Geral'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Intenção:</span>
            <span className="px-2 py-0.5 bg-blue-50 dark:bg-blue-900/30 border border-blue-100 dark:border-blue-800/50 rounded text-blue-700 dark:text-blue-300 font-bold">
              {ticket.intent || 'Classificando...'}
            </span>
          </div>
          <div className="flex items-center gap-2">
            <span className="text-slate-400 dark:text-slate-500 font-bold uppercase tracking-wider">Status IA:</span>
            <span className={`font-bold flex items-center gap-1 ${currentStatus === 'bot_ativo' ? 'text-purple-600 dark:text-purple-400' : 'text-slate-400 dark:text-slate-500'}`}>
              {currentStatus === 'bot_ativo' ? <Bot size={12} /> : <ShieldOff size={12} />}
              {currentStatus === 'bot_ativo' ? 'Monitorando' : 'Desativada'}
            </span>
          </div>
        </div>

        <div className="flex items-center gap-2 text-slate-400 dark:text-slate-500">
           <span className="font-bold">Prioridade:</span>
           <span className="font-bold">{priorityLabels[ticket.priority]}</span>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 flex flex-col overflow-hidden bg-white dark:bg-slate-950 border-y border-slate-100 dark:border-slate-800">
        <MessageList messages={messages} loading={loading} />
      </div>

      {/* Input */}
      <MessageInput
        ticket_id={ticket.id}
        customer_id={ticket.customer_id}
        channel={ticket.channel}
        sender_id={sender_id}
        onMessageSent={() => {}}
        onStatusChange={handleStatusChange}
      />

      <ConfirmDialog
        open={confirmResolve}
        title="Finalizar este atendimento?"
        description={`O ticket será marcado como resolvido e o cliente ${customerLabel} receberá a pesquisa de satisfação.`}
        confirmLabel="Sim, finalizar"
        cancelLabel="Voltar"
        variant="default"
        onConfirm={confirmResolveAction}
        onCancel={() => setConfirmResolve(false)}
      />
    </div>
  )
}
