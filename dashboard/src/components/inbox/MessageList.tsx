import { useEffect, useRef, useState } from 'react'
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
  customer: {
    avatarBg: 'bg-slate-200 dark:bg-slate-600',
    bubbleBg: 'bg-white dark:bg-slate-700 border border-slate-200 dark:border-slate-600',
    textColor: 'text-slate-900 dark:text-slate-50',
    label: 'Cliente',
    icon: '👤'
  },
  bot: {
    avatarBg: 'bg-purple-200 dark:bg-purple-800',
    bubbleBg: 'bg-purple-50 dark:bg-purple-900/40 border border-purple-100 dark:border-purple-800/50',
    textColor: 'text-slate-900 dark:text-purple-50',
    label: 'Bot',
    icon: '🤖'
  },
  human: {
    avatarBg: 'bg-indigo-200 dark:bg-indigo-800',
    bubbleBg: 'bg-indigo-600 dark:bg-indigo-500',
    textColor: 'text-white',
    label: 'Agente',
    icon: '👨‍💼'
  }
}

export function MessageList({ messages, loading }: MessageListProps) {
  const bottomRef = useRef<HTMLDivElement | null>(null)

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' })
  }, [messages.length])

  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center bg-slate-50/50 dark:bg-slate-900/50">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600 dark:border-indigo-400"></div>
      </div>
    )
  }

  if (messages.length === 0) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center bg-slate-50/50 dark:bg-slate-900/50 text-slate-500 dark:text-slate-400">
        <p className="text-sm">Nenhuma mensagem ainda.</p>
      </div>
    )
  }

  return (
    <div
      className="flex-1 overflow-y-auto overflow-x-hidden p-4 bg-slate-50/50 dark:bg-slate-900/50 h-full max-h-full"
      style={{ scrollbarWidth: 'auto', scrollBehavior: 'auto' }}
    >
      <div className="flex flex-col space-y-4 min-h-full">
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
                <div className={`w-8 h-8 rounded-full ${config.avatarBg} flex items-center justify-center text-sm flex-shrink-0`}>
                  {config.icon}
                </div>

                {/* Message Bubble */}
                <div className={`flex flex-col ${isCustomer ? 'items-start' : 'items-end'}`}>
                  {/* Header */}
                  <div className="flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400 mb-1">
                    <span className="font-bold text-slate-700 dark:text-slate-200">
                      {message.agent?.name || (message.raw_payload as any)?.agent_name || config.label}
                      {(message.agent?.sector || (message.raw_payload as any)?.agent_sector) && (
                        <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500 ml-1">
                          ({message.agent?.sector || (message.raw_payload as any)?.agent_sector})
                        </span>
                      )}
                    </span>
                    <span>{channelIcon}</span>
                    <span>{formatTime(message.timestamp)}</span>
                  </div>

                  {/* Body */}
                  <div
                    className={`px-4 py-2 rounded-2xl ${config.bubbleBg} ${
                      isCustomer ? 'rounded-tl-none' : 'rounded-tr-none'
                    }`}
                  >
                    <p className={`text-sm whitespace-pre-wrap break-words ${config.textColor}`}>
                      {message.body}
                    </p>
                  </div>

                  {/* Media */}
                  {message.media_url && (
                    <div className="mt-2 max-w-full">
                      {message.media_type === 'image' && (
                        <a href={message.media_url} target="_blank" rel="noopener noreferrer">
                          <img
                            src={message.media_url}
                            alt="Mídia enviada"
                            className="rounded-xl max-h-64 max-w-full object-cover border border-slate-200 dark:border-slate-700"
                          />
                        </a>
                      )}
                      {message.media_type === 'audio' && (
                        <audio
                          src={message.media_url}
                          controls
                          className="max-w-full"
                        />
                      )}
                      {message.media_type === 'video' && (
                        <video
                          src={message.media_url}
                          controls
                          className="rounded-xl max-h-64 max-w-full border border-slate-200 dark:border-slate-700"
                        />
                      )}
                      {(message.media_type === 'document' || !['image', 'audio', 'video'].includes(message.media_type || '')) && (
                        <a
                          href={message.media_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-2 px-3 py-2 bg-slate-100 dark:bg-slate-700 text-slate-700 dark:text-slate-200 rounded-lg text-xs font-medium hover:bg-slate-200 dark:hover:bg-slate-600 transition"
                        >
                          📎 Abrir {message.media_type || 'arquivo'}
                        </a>
                      )}
                    </div>
                  )}
                </div>
              </div>
            </div>
          )
        })}
        <div ref={bottomRef} />
      </div>
    </div>
  )
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  return date.toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })
}
