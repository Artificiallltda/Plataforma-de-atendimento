'use client'

import { useState, useEffect } from 'react'
import { sendMessage, updateTicketStatus } from '@/hooks/use-messages'

interface MessageInputProps {
  ticketId: string
  customer_id: string
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
  customer_id,
  channel,
  senderId,
  onMessageSent,
  onStatusChange
}: MessageInputProps) {
  const [message, setMessage] = useState('')
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [agentName, setAgentName] = useState('Agente')

  // BUSCAR NOME DO AGENTE LOGADO
  useEffect(() => {
    const fetchAgent = async () => {
      const { createClient } = await import('@/lib/supabase/client')
      const supabase = createClient()
      
      // 1. Tentar buscar da tabela de agentes
      const { data: agentData } = await supabase.from('agents').select('name').eq('id', senderId).single()
      if (agentData?.name) {
        setAgentName(agentData.name)
        return
      }

      // 2. Tentar buscar do Perfil Logado (Auth)
      const { data: { user } } = await supabase.auth.getUser()
      if (user?.user_metadata?.full_name) {
        setAgentName(user.user_metadata.full_name)
      } else if (user?.email) {
        // Fallback: prefixo do email (ex: gean@artificiall.ai -> Gean)
        const nameFromEmail = user.email.split('@')[0]
        setAgentName(nameFromEmail.charAt(0).toUpperCase() + nameFromEmail.slice(1))
      }
    }
    if (senderId) fetchAgent()
  }, [senderId])

  const handleSend = async () => {
    if (!message.trim()) return

    setSending(true)
    setError(null)

    const result = await sendMessage(ticketId, customer_id, channel, message.trim(), senderId, agentName)

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
          className="flex-1 px-5 py-4 border border-gray-200 rounded-2xl focus:ring-4 focus:ring-indigo-100 focus:border-indigo-500 outline-none resize-none transition-all duration-200 text-slate-700 font-medium"
          rows={4}
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
