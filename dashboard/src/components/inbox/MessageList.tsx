import { useEffect, useRef } from 'react'
import { Message } from '@/hooks/use-messages'

interface MessageListProps {
  messages: Message[]
  loading?: boolean
}

const channelIcons = {
  whatsapp: '💬',
  telegram: '✈️',
  web: '🌐'
}

const senderConfig = {
  customer: { bg: 'bg-gray-100', label: 'Cliente', icon: '👤' },
  bot: { bg: 'bg-purple-100', label: 'Bot', icon: '🤖' },
  human: { bg: 'bg-blue-100', label: 'Agente', icon: '👨‍💼' }
}

export function MessageList({ messages, loading }: MessageListProps) {
  const scrollRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollTo({
        top: scrollRef.current.scrollHeight,
        behavior: 'smooth'
      })
    }
  }, [messages])

  if (loading) {
    return (
      <div className="flex items-center justify-center py-12">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="text-center py-12 text-gray-500">
        <p>Nenhuma mensagem ainda</p>
      </div>
    )
  }

  return (
    <div 
      ref={scrollRef}
      className="flex-1 space-y-4 overflow-y-auto p-4 min-h-0 bg-slate-50/50"
    >
      {messages.map((message, index) => {
        const isCustomer = message.sender === 'customer'
        const config = senderConfig[message.sender]
        const channelIcon = channelIcons[message.channel]

        return (
          <div
            key={message.id}
            className={`flex ${isCustomer ? 'justify-start' : 'justify-end'}`}
          >
            <div className={`flex items-start gap-2 max-w-[80%] ${isCustomer ? '' : 'flex-row-reverse'}`}>
              {/* Avatar */}
              <div className={`w-8 h-8 rounded-full ${config.bg} flex items-center justify-center text-sm`}>
                {config.icon}
              </div>

              {/* Message Bubble */}
              <div className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}>
                {/* Header */}
                <div className="flex items-center gap-2 text-xs text-gray-500 mb-1">
                  <span className="font-bold text-slate-700">
                    {message.agent?.name || (message.raw_payload as any)?.agent_name || config.label}
                    {(message.agent?.sector || (message.raw_payload as any)?.agent_sector) && (
                      <span className="text-[10px] font-medium text-slate-400 ml-1">
                        ({message.agent?.sector || (message.raw_payload as any)?.agent_sector})
                      </span>
                    )}
                  </span>
                  <span>{channelIcon}</span>
                  <span>{formatTime(message.timestamp)}</span>
                </div>

                {/* Body */}
                <div
                  className={`px-4 py-2 rounded-2xl ${
                    isCustomer
                      ? `${config.bg} rounded-tl-none`
                      : 'bg-indigo-600 text-white rounded-tr-none'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap break-words">
                    {message.body}
                  </p>
                </div>

                {/* Media */}
                {message.media_url && (
                  <div className="mt-1 text-xs text-gray-500">
                    📎 {message.media_type || 'Mídia'}
                  </div>
                )}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
