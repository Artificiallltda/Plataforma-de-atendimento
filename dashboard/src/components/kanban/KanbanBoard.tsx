'use client'

import React, { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { DragDropContext, Droppable, Draggable, DropResult } from '@hello-pangea/dnd'
import { Ticket } from '@/hooks/use-tickets'
import { KanbanCard } from './KanbanCard'
import { 
  Plus, 
  MoreHorizontal, 
  Columns,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Bot,
  User,
  Zap,
  Loader2
} from 'lucide-react'
import { motion } from 'framer-motion'
import { createClient } from '@/lib/supabase/client'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface KanbanBoardProps {
  initialTickets: Ticket[]
  sectorFilter?: string
}

const columns = [
  { id: 'novo', title: 'Novos', icon: Zap, color: 'text-blue-500', bg: 'bg-blue-50' },
  { id: 'bot_ativo', title: 'IA Ativa', icon: Bot, color: 'text-purple-500', bg: 'bg-purple-50' },
  { id: 'aguardando_humano', title: 'Aguardando Humano', icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  { id: 'em_atendimento', title: 'Em Atendimento', icon: User, color: 'text-orange-500', bg: 'bg-orange-50' },
  { id: 'resolvido', title: 'Resolvidos', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50' }
]

export function KanbanBoard({ initialTickets, sectorFilter }: KanbanBoardProps) {
  const router = useRouter()
  const [boardData, setBoardData] = useState<Record<string, Ticket[]>>({})
  const [loading, setLoading] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    const organized: Record<string, Ticket[]> = {
      novo: [],
      bot_ativo: [],
      aguardando_humano: [],
      em_atendimento: [],
      resolvido: []
    }

    initialTickets.forEach(ticket => {
      if (organized[ticket.status]) {
        organized[ticket.status].push(ticket)
      }
    })

    setBoardData(organized)
  }, [initialTickets])

  const onDragEnd = async (result: DropResult) => {
    const { destination, source, draggableId } = result

    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const startColId = source.droppableId
    const finishColId = destination.droppableId
    
    // Copy the current state
    const newBoardData = { ...boardData }
    const startCol = Array.from(newBoardData[startColId])
    const finishCol = startColId === finishColId ? startCol : Array.from(newBoardData[finishColId])

    const [movedTicket] = startCol.splice(source.index, 1)
    
    // Update the ticket status optimistically
    movedTicket.status = finishColId as any
    if (finishColId === 'resolvido') {
      movedTicket.resolved_at = new Date().toISOString()
    } else if (startColId === 'resolvido') {
      movedTicket.resolved_at = null
    }

    finishCol.splice(destination.index, 0, movedTicket)

    newBoardData[startColId] = startCol
    newBoardData[finishColId] = finishCol
    setBoardData(newBoardData)

    // Update in Supabase
    try {
      const updateData: any = { status: finishColId }
      if (finishColId === 'resolvido') {
        updateData.resolved_at = new Date().toISOString()
      } else if (startColId === 'resolvido') {
        updateData.resolved_at = null
      }

      const { error } = await supabase
        .from('tickets')
        .update(updateData)
        .eq('id', draggableId)

      if (error) throw error

      // Trigger Feedback Agent if moved to 'resolvido'
      if (finishColId === 'resolvido') {
        console.log('Disparando Agente de Feedback para o ticket:', draggableId)
        // Aqui chamaremos a API interna que dispara o feedback
        await fetch('/api/feedback-trigger', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ticketId: draggableId })
        })
      }

    } catch (err) {
      console.error('Erro ao atualizar ticket:', err)
      // Revert state if needed (ignored for now for better UX, relying on realtime update to fix it)
    }
  }

  return (
    <div className="flex flex-col h-full bg-slate-50 rounded-2xl border border-slate-200 overflow-hidden shadow-sm">
      {/* Board Header */}
      <div className="flex items-center justify-between px-6 py-4 bg-white border-b border-slate-100">
        <div className="flex items-center gap-4">
          <div className="p-2 bg-blue-50 text-blue-600 rounded-lg">
            <Columns size={20} />
          </div>
          <h3 className="font-bold text-slate-800 text-lg">Quadro de Atendimento</h3>
          {sectorFilter && (
            <span className="px-3 py-1 bg-slate-100 text-slate-600 text-xs font-bold rounded-full border border-slate-200 capitalize">
              {sectorFilter}
            </span>
          )}
        </div>
        <div className="flex items-center gap-3">
          <div className="relative group">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors" />
            <input 
              type="text" 
              placeholder="Buscar ticket..." 
              className="pl-10 pr-4 py-2 bg-slate-100 border-none rounded-xl text-sm focus:ring-2 focus:ring-blue-100 w-64 transition-all"
            />
          </div>
          <button className="p-2 hover:bg-slate-100 rounded-lg text-slate-500 transition-colors border border-slate-200">
            <Filter size={18} />
          </button>
        </div>
      </div>

      {/* Columns Container */}
      <DragDropContext onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto p-6 scrollbar-hide">
          <div className="flex gap-6 min-h-full">
            {columns.map(col => (
              <div key={col.id} className="flex flex-col w-80 min-w-[320px] bg-slate-100 bg-opacity-50 rounded-2xl h-full border border-slate-200 border-dashed">
                {/* Column Header */}
                <div className="p-4 flex items-center justify-between sticky top-0 bg-transparent z-10">
                  <div className="flex items-center gap-3">
                    <div className={cn("p-1.5 rounded-lg shadow-sm border border-slate-200 bg-white", col.color)}>
                      <col.icon size={16} />
                    </div>
                    <div>
                      <h4 className="font-bold text-slate-700 text-sm">{col.title}</h4>
                      <p className="text-[10px] text-slate-400 font-bold uppercase tracking-wider">
                        {boardData[col.id]?.length || 0} Tickets
                      </p>
                    </div>
                  </div>
                  <button className="p-1 hover:bg-white rounded transition-colors text-slate-400">
                    <MoreHorizontal size={16} />
                  </button>
                </div>

                {/* Droppable Area */}
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className={cn(
                        "flex-1 p-3 transition-colors duration-200 space-y-3 min-h-[500px]",
                        snapshot.isDraggingOver && "bg-blue-50/50 rounded-b-2xl"
                      )}
                    >
                      {boardData[col.id]?.map((ticket, index) => (
                        <Draggable key={ticket.id} draggableId={ticket.id} index={index}>
                          {(provided, snapshot) => (
                            <div
                              ref={provided.innerRef}
                              {...provided.draggableProps}
                              {...provided.dragHandleProps}
                            >
                              <KanbanCard 
                                ticket={ticket} 
                                isDragging={snapshot.isDragging}
                                onClick={(t) => router.push(`/tickets/${t.id}`)}
                              />
                            </div>
                          )}
                        </Draggable>
                      ))}
                      {provided.placeholder}
                    </div>
                  )}
                </Droppable>
              </div>
            ))}
          </div>
        </div>
      </DragDropContext>
    </div>
  )
}
