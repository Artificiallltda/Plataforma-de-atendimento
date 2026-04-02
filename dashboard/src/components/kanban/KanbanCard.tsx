'use client'

import React from 'react'
import { Ticket } from '@/hooks/use-tickets'
import { 
  Clock, 
  MessageCircle, 
  Bot, 
  User, 
  AlertCircle, 
  ArrowRight,
  TrendingDown,
  TrendingUp,
  Minus
} from 'lucide-react'
import { motion } from 'framer-motion'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface KanbanCardProps {
  ticket: Ticket
  onClick?: (ticket: Ticket) => void
  isDragging?: boolean
}

const priorityConfig = {
  critica: { color: 'border-rose-500', bg: 'bg-rose-50', text: 'text-rose-700', icon: AlertCircle },
  alta: { color: 'border-orange-500', bg: 'bg-orange-50', text: 'text-orange-700', icon: AlertCircle },
  media: { color: 'border-emerald-500', bg: 'bg-emerald-50', text: 'text-emerald-700', icon: Minus },
  baixa: { color: 'border-slate-300', bg: 'bg-slate-50', text: 'text-slate-600', icon: Minus }
}

const channelIcons = {
  whatsapp: { icon: MessageCircle, color: 'text-green-500' },
  telegram: { icon: MessageCircle, color: 'text-blue-500' },
  web: { icon: MessageCircle, color: 'text-slate-500' }
}

export function KanbanCard({ ticket, onClick, isDragging }: KanbanCardProps) {
  const priority = priorityConfig[ticket.priority]
  const ChannelIcon = channelIcons[ticket.channel].icon
  const channelColor = channelIcons[ticket.channel].color
  const PriorityIcon = priority.icon

  // Mock de sentimento para demonstração (depois pegaremos do DB se disponível)
  const sentiment = Math.random() > 0.5 ? 'positivo' : Math.random() > 0.3 ? 'neutro' : 'negativo'
  
  const sentimentConfig = {
    positivo: { icon: TrendingUp, color: 'text-emerald-500' },
    neutro: { icon: Minus, color: 'text-slate-400' },
    negativo: { icon: TrendingDown, color: 'text-rose-500' }
  }
  
  const SentimentIcon = sentimentConfig[sentiment].icon

  return (
    <motion.div
      layoutId={ticket.id}
      whileHover={{ y: -4, transition: { duration: 0.2 } }}
      onClick={() => onClick?.(ticket)}
      className={cn(
        "glass-card p-4 cursor-grab active:cursor-grabbing select-none group border-l-4",
        priority.color,
        isDragging && "shadow-2xl ring-2 ring-blue-400 opacity-90 scale-105 z-50",
        !isDragging && "mb-3"
      )}
    >
      <div className="flex justify-between items-start mb-3">
        <div className="flex items-center gap-2">
          <div className={cn("p-1.5 rounded-lg bg-white shadow-sm border border-slate-100", channelColor)}>
            <ChannelIcon size={14} />
          </div>
          <span className="text-[10px] font-bold text-slate-400 tracking-wider uppercase">
            #{ticket.id.slice(0, 6)}
          </span>
        </div>
        <div className={cn("flex items-center gap-1.5 px-2 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-tight", priority.bg, priority.text)}>
          <PriorityIcon size={10} />
          {ticket.priority}
        </div>
      </div>

      <h4 className="font-bold text-slate-800 text-sm mb-1 line-clamp-1 group-hover:text-blue-600 transition-colors">
        {ticket.customer?.name || 'Cliente'}
      </h4>
      <p className="text-xs text-slate-500 mb-4 line-clamp-2 leading-relaxed">
        {ticket.intent || 'Solicitação inicial iniciada...'}
      </p>

      {/* AI Insights & Sentiment */}
      <div className="flex items-center justify-between py-2 border-t border-slate-100 mt-2">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1" title="Sentimento do Cliente">
            <SentimentIcon size={14} className={sentimentConfig[sentiment].color} />
          </div>
          {ticket.current_agent && (
            <div className="flex items-center gap-1 text-slate-400" title={`Agente IA: ${ticket.current_agent}`}>
              <Bot size={14} className="text-blue-500" />
            </div>
          )}
        </div>
        <div className="flex items-center gap-1 text-[10px] font-medium text-slate-400 bg-slate-100 px-2 py-0.5 rounded">
          <Clock size={10} />
          {calculateWaitTime(ticket.created_at)}
        </div>
      </div>
      
      {/* Footer Info */}
      <div className="mt-3 flex items-center justify-between">
        <div className="flex -space-x-2">
          {ticket.assigned_to ? (
            <div className="h-6 w-6 rounded-full bg-blue-100 border-2 border-white flex items-center justify-center text-blue-600" title="Atendente Humano">
              <User size={12} />
            </div>
          ) : (
             <div className="h-6 w-6 rounded-full bg-slate-100 border-2 border-white flex items-center justify-center text-slate-400" title="Aguardando Atendente">
               <Bot size={12} />
             </div>
          )}
        </div>
        
        <button className="text-slate-400 hover:text-blue-600 transition-colors">
          <ArrowRight size={14} />
        </button>
      </div>
    </motion.div>
  )
}

function calculateWaitTime(createdAt: string): string {
  const now = new Date()
  const created = new Date(createdAt)
  const diffMs = now.getTime() - created.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  if (diffHours < 24) return `${diffHours}h`
  return `${Math.floor(diffHours / 24)}d`
}
