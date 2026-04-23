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
  critica: {
    color: 'border-rose-500',
    bg: 'bg-rose-50 dark:bg-rose-900/20',
    text: 'text-rose-700 dark:text-rose-300',
    bar: 'bg-rose-500',
    icon: AlertCircle
  },
  alta: {
    color: 'border-orange-500',
    bg: 'bg-orange-50 dark:bg-orange-900/20',
    text: 'text-orange-700 dark:text-orange-300',
    bar: 'bg-orange-500',
    icon: AlertCircle
  },
  media: {
    color: 'border-emerald-500',
    bg: 'bg-emerald-50 dark:bg-emerald-900/20',
    text: 'text-emerald-700 dark:text-emerald-300',
    bar: 'bg-emerald-500',
    icon: Minus
  },
  baixa: {
    color: 'border-slate-300',
    bg: 'bg-slate-50 dark:bg-slate-700/40',
    text: 'text-slate-600 dark:text-slate-300',
    bar: 'bg-slate-400',
    icon: Minus
  }
}

const channelIcons = {
  whatsapp: { icon: MessageCircle, color: 'text-green-500' },
  telegram: { icon: MessageCircle, color: 'text-blue-500' },
  web: { icon: MessageCircle, color: 'text-slate-500' }
}

export function KanbanCard({ ticket, onClick, isDragging }: KanbanCardProps) {
  const priority = priorityConfig[ticket.priority] || priorityConfig.media
  const ChannelIcon = channelIcons[ticket.channel]?.icon || MessageCircle
  const channelColor = channelIcons[ticket.channel]?.color || 'text-slate-500'
  const PriorityIcon = priority.icon

  const sentiment = ticket.router_confidence && ticket.router_confidence > 0.8
    ? 'positivo'
    : ticket.router_confidence && ticket.router_confidence < 0.4
      ? 'negativo'
      : 'neutro'

  const sentimentConfig = {
    positivo: { icon: TrendingUp, color: 'text-emerald-500', bg: 'bg-emerald-50 dark:bg-emerald-900/20' },
    neutro: { icon: Minus, color: 'text-slate-400 dark:text-slate-500', bg: 'bg-slate-50 dark:bg-slate-700/40' },
    negativo: { icon: TrendingDown, color: 'text-rose-500', bg: 'bg-rose-50 dark:bg-rose-900/20' }
  }

  const SentimentIcon = sentimentConfig[sentiment].icon
  const customerData = (ticket as any).customer
  const customerName = (Array.isArray(customerData) ? customerData[0]?.name : customerData?.name) || 'Identificando...'

  const intentMap: Record<string, string> = {
    'saudacao': '👋 Saudação / Início',
    'suporte_tecnico': '🛠️ Suporte Técnico',
    'duvida_pagamento': '💳 Dúvida de Pagamento',
    'comercial_planos': '🚀 Interesse em Planos',
    'reclamacao': '⚠️ Reclamação',
    'vendas': '💰 Vendas / Checkout'
  }

  const displayIntent = intentMap[ticket.intent || ''] || ticket.intent || 'Classificando...'

  return (
    <motion.div
      initial={{ opacity: 0, y: 20 }}
      animate={{ opacity: 1, y: 0 }}
      whileHover={{ y: -4, scale: 1.01 }}
      onClick={() => onClick?.(ticket)}
      className={cn(
        'group relative rounded-[28px] p-5 cursor-pointer transition-all duration-300 flex flex-col gap-5 select-none',
        'bg-white/80 dark:bg-slate-800/80 backdrop-blur-md',
        'border border-white/70 dark:border-slate-700/50',
        'shadow-sm hover:shadow-xl hover:shadow-slate-200/30 dark:hover:shadow-slate-900/50',
        'hover:bg-white dark:hover:bg-slate-800',
        isDragging && 'shadow-2xl ring-2 ring-indigo-500/20 scale-[1.02] opacity-90'
      )}
    >
      {/* Priority bar */}
      <div className={cn('absolute left-0 top-6 bottom-6 w-1.5 rounded-r-full group-hover:w-2 transition-all duration-300', priority.bar)} />

      <div className="pl-3">
        {/* Header row */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2.5">
            <div className={cn('p-2 rounded-xl bg-slate-50 dark:bg-slate-700 border border-slate-100 dark:border-slate-600 shadow-sm', channelColor)}>
              <ChannelIcon size={16} strokeWidth={2.5} />
            </div>
            <span className="text-[10px] font-black text-slate-400 dark:text-slate-500 tracking-widest uppercase">
              TICKET #{ticket.id.slice(0, 8).toUpperCase()}
            </span>
          </div>

          <div className={cn(
            'flex items-center gap-1.5 px-3 py-1 rounded-lg text-[10px] font-black uppercase tracking-widest border',
            priority.bg, priority.text, priority.color
          )}>
            <PriorityIcon size={12} strokeWidth={3} />
            {ticket.priority}
          </div>
        </div>

        <h4 className="font-extrabold text-slate-900 dark:text-slate-100 text-base mb-1 tracking-tight group-hover:text-blue-600 dark:group-hover:text-blue-400 transition-colors">
          {customerName}
        </h4>

        <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-6 line-clamp-2 leading-relaxed">
          {displayIntent}
        </p>

        {/* Status row */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100/80 dark:border-slate-700/60">
          <div className="flex items-center gap-4">
            <div className={cn('p-1 rounded-md', sentimentConfig[sentiment].bg)}>
              <SentimentIcon size={14} className={sentimentConfig[sentiment].color} strokeWidth={2.5} />
            </div>

            {ticket.current_agent && (
              <div className="flex items-center gap-1.5 px-2 py-1 bg-blue-50 dark:bg-blue-900/30 rounded-lg border border-blue-100 dark:border-blue-700/50">
                <Bot size={14} className="text-blue-600 dark:text-blue-400" strokeWidth={2.5} />
                <span className="text-[9px] font-black text-blue-700 dark:text-blue-300 uppercase">
                  {ticket.current_agent.split('-')[0]}
                </span>
              </div>
            )}
          </div>

          <div className="flex items-center gap-1.5 text-[10px] font-black text-slate-400 dark:text-slate-500 bg-slate-100/50 dark:bg-slate-700/50 px-2.5 py-1 rounded-lg border border-slate-200/50 dark:border-slate-600/50">
            <Clock size={12} strokeWidth={2.5} />
            {calculateWaitTime(ticket.created_at)}
          </div>
        </div>

        {/* Footer */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex -space-x-3">
            <div className="h-8 w-8 rounded-full bg-slate-900 dark:bg-slate-600 border-2 border-white dark:border-slate-800 flex items-center justify-center text-white shadow-sm z-10">
              <Bot size={16} strokeWidth={2.5} />
            </div>
            {ticket.assigned_to && (
              <div className="h-8 w-8 rounded-full bg-indigo-500 border-2 border-white dark:border-slate-800 flex items-center justify-center text-white shadow-sm z-20">
                <User size={16} strokeWidth={2.5} />
              </div>
            )}
          </div>

          <div className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-black text-[10px] uppercase tracking-tighter opacity-0 group-hover:opacity-100 transition-all duration-300 transform translate-x-2 group-hover:translate-x-0">
            Abrir Detalhes
            <ArrowRight size={14} strokeWidth={3} />
          </div>
        </div>
      </div>
    </motion.div>
  )
}

function calculateWaitTime(createdAt: string): string {
  if (!createdAt) return '--'
  const now = new Date()
  const created = new Date(createdAt)
  const diffMs = now.getTime() - created.getTime()
  const diffMins = Math.floor(diffMs / 60000)
  if (diffMins < 60) return `${diffMins}m`
  const diffHours = Math.floor(diffMins / 60)
  return `${Math.floor(diffHours / 24)}D`
}
