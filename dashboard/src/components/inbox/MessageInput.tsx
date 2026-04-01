'use client'

import { useState } from 'react'
import { sendMessage, updateTicketStatus } from '@/hooks/use-messages'

interface MessageInputProps {
  ticketId: string
  customerId: string
  channel: 'whatsapp' | 'telegram' | 'web'
  senderId: string
  onMessageSent?: () => void
  onStatusChange?: (status: string) => void
}

const quickActions = [
  { label: '✅ Resolver', value: 'resolvido', color: 'bg-green-600 hover:bg-green-700' },
  { label: '⏳ Aguardando', value: 'aguardando_humano', color: 'bg-yellow-600 hover:bg-yellow-700' },
  { label: '🔴 Urgente', value: 'critica', color: 'bg-red-600 hover:bg-red-700', action: 'priority' }
]

export function MessageInput({
  ticketId,
  customerId,
  channel,
  senderId,
  onMessageSent,
  onStatusChange
}: MessageInputProps) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const handleSend = async () => {
    if (!message.trim()) return

    setSending(true)
    setError(null)

    const result = await sendMessage(ticketId, customerId, channel, message.trim(), 'human', senderId)

    if (result.success) {
      setMessage('')
      onMessageSent?.()
    } else {
      setError(result.error || 'Erro ao enviar')
    }

    setSending(false)
  }

  const handleQuickAction = async (action: string, value: string) => {
    if (action === 'priority') {
      await updateTicketStatus(ticketId, 'em_atendimento', value as any)
    } else {
      await updateTicketStatus(ticketId, value as any)
    }
    onStatusChange?.(value)
  }

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSend()
    }
  }

  return (
    <div className="border-t bg-white p-4 space-y-3">
      {/* Quick Actions */}
      <div className="flex flex-wrap gap-2">
        {quickActions.map(action => (
          <button
            key={action.value}
            onClick={() => handleQuickAction(action.action || 'status', action.value)}
            className={`px-3 py-1.5 text-sm text-white rounded-lg transition ${action.color}`}
          >
            {action.label}
          </button>
        ))}
      </div>

      {/* Input */}
      <div className="flex gap-2">
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={handleKeyDown}
          placeholder="Digite sua resposta... (Enter para enviar, Shift+Enter para nova linha)"
          className="flex-1 px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-indigo-500 focus:border-transparent resize-none"
          rows={2}
          disabled={sending}
        />
        <button
          onClick={handleSend}
          disabled={sending || !message.trim()}
          className="px-6 py-2 bg-indigo-600 text-white rounded-lg font-medium hover:bg-indigo-700 focus:ring-4 focus:ring-indigo-200 transition disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {sending ? 'Enviando...' : 'Enviar'}
        </button>
      </div>

      {/* Error */}
      {error && (
        <p className="text-sm text-red-600">{error}</p>
      )}

      {/* Help Text */}
      <p className="text-xs text-gray-500">
        💡 Dica: Use Shift+Enter para pular linha
      </p>
    </div>
  )
}
