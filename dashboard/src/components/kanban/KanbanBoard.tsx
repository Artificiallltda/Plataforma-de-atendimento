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
  isLoading?: boolean
}

const columns = [
  { id: 'novo', title: 'Novos', icon: Zap, color: 'text-blue-500', bg: 'bg-blue-50' },
  { id: 'bot_ativo', title: 'IA Ativa', icon: Bot, color: 'text-purple-500', bg: 'bg-purple-50' },
  { id: 'aguardando_humano', title: 'Aguardando Humano', icon: Clock, color: 'text-yellow-600', bg: 'bg-yellow-50' },
  { id: 'em_atendimento', title: 'Em Atendimento', icon: User, color: 'text-orange-500', bg: 'bg-orange-50' },
  { id: 'resolvido', title: 'Resolvidos', icon: CheckCircle2, color: 'text-emerald-500', bg: 'bg-emerald-50' }
]

export function KanbanBoard({ initialTickets, sectorFilter, isLoading }: KanbanBoardProps) {
  const router = useRouter()
  const [boardData, setBoardData] = useState<Record<string, Ticket[]>>({})
  const [isDragging, setIsDragging] = useState(false)
  const supabase = createClient()

  useEffect(() => {
    // Bloqueia a atualização externa se o usuário estiver arrastando manualmente
    if (isDragging) return

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
  }, [initialTickets, isDragging])

  const onDragStart = () => {
    setIsDragging(true)
  }

  const onDragEnd = async (result: DropResult) => {
    setIsDragging(false)
    const { destination, source, draggableId } = result

    if (!destination) return
    if (destination.droppableId === source.droppableId && destination.index === source.index) return

    const startColId = source.droppableId
    const finishColId = destination.droppableId
    
    // Copy the current state
    const newBoardData = { ...boardData }
    const startCol = Array.from(newBoardData[startColId] || [])
    const finishCol = startColId === finishColId ? startCol : Array.from(newBoardData[finishColId] || [])

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
    <div className="flex flex-col h-full bg-transparent overflow-hidden">
      {/* Board Header */}
      <div className="flex items-center justify-between px-2 py-6 mb-2">
        <div className="flex items-center gap-5">
          <div className="h-14 w-14 bg-slate-900 text-white rounded-2xl flex items-center justify-center shadow-xl shadow-slate-200 rotate-3 hover:rotate-0 transition-transform duration-500">
            <Columns size={24} />
          </div>
          <div>
            <h3 className="font-black text-slate-800 text-2xl tracking-tight">Fluxo de Atendimento</h3>
            <div className="flex items-center gap-2 mt-1">
              {sectorFilter && (
                <span className="px-3 py-0.5 bg-blue-50 text-blue-600 text-[10px] font-black rounded-lg border border-blue-100 uppercase tracking-widest">
                  Setor: {sectorFilter}
                </span>
              )}
              <span className="px-3 py-0.5 bg-emerald-50 text-emerald-600 text-[10px] font-black rounded-lg border border-emerald-100 uppercase tracking-widest flex items-center gap-1">
                <div className="w-1 h-1 bg-emerald-500 rounded-full animate-pulse" />
                Tempo Real Ativo
              </span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="relative group hidden lg:block">
            <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
            <input 
              type="text" 
              placeholder="Pesquisar por cliente ou ID..." 
              className="pl-12 pr-6 py-3 bg-white/80 backdrop-blur-sm border border-slate-200 rounded-2xl text-sm focus:ring-4 focus:ring-slate-100 w-80 transition-all shadow-sm outline-none font-medium"
            />
          </div>
          <button className="p-3 bg-white hover:bg-slate-50 rounded-2xl text-slate-600 transition-all border border-slate-200 shadow-sm hover:shadow-md group">
            <Filter size={20} className="group-hover:rotate-12 transition-transform" />
          </button>
        </div>
      </div>

      {/* Columns Container */}
      <DragDropContext onDragStart={onDragStart} onDragEnd={onDragEnd}>
        <div className="flex-1 overflow-x-auto pb-6 scrollbar-hide">
          <div className="flex gap-8 min-h-full pb-4">
            {columns.map((col, index) => (
              <motion.div 
                key={col.id} 
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                transition={{ duration: 0.5, delay: index * 0.1 }}
                className="flex flex-col w-[350px] min-w-[350px] bg-slate-200/20 backdrop-blur-md rounded-[32px] h-full border border-white/40 shadow-sm"
              >
                {/* Column Header */}
                <div className="p-6 flex items-center justify-between sticky top-0 z-10 bg-transparent">
                  <div className="flex items-center gap-4">
                    <div className={cn("p-2.5 rounded-xl shadow-lg border border-white bg-white", col.color)}>
                      <col.icon size={20} />
                    </div>
                    <div>
                      <h4 className="font-extrabold text-slate-800 text-sm tracking-tight">{col.title}</h4>
                      <p className="text-[10px] text-slate-500 font-bold uppercase tracking-widest opacity-70">
                        {isLoading ? '...' : `${boardData[col.id]?.length || 0} Atendimentos`}
                      </p>
                    </div>
                  </div>
                  <div className="h-2 w-2 rounded-full bg-slate-300" />
                </div>

                {/* Droppable Area */}
                <Droppable droppableId={col.id}>
                  {(provided, snapshot) => (
                    <div
                      {...provided.droppableProps}
                      ref={provided.innerRef}
                      className={cn(
                        "flex-1 p-4 transition-all duration-300 space-y-4 min-h-[500px]",
                        snapshot.isDraggingOver && "bg-white/30"
                      )}
                    >
                      {isLoading ? (
                        // Skeleton Loaders
                        <div className="space-y-4">
                          {[1, 2, 3].map(i => (
                            <div key={i} className="h-24 bg-white/50 animate-pulse rounded-3xl border border-white/40 shadow-sm" />
                          ))}
                        </div>
                      ) : (
                        <>
                          {boardData[col.id]?.map((ticket, index) => (
                            <Draggable key={ticket.id} draggableId={ticket.id} index={index}>
                              {(provided, snapshot) => (
                                <div
                                  ref={provided.innerRef}
                                  {...provided.draggableProps}
                                  {...provided.dragHandleProps}
                                  className="transition-transform"
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
                          
                          {/* Empty State visual */}
                          {(!boardData[col.id] || boardData[col.id].length === 0) && (
                            <div className="h-32 rounded-3xl border-2 border-dashed border-slate-300/30 flex items-center justify-center">
                               <p className="text-slate-400 text-xs font-bold uppercase tracking-tighter opacity-50">Vazio</p>
                            </div>
                          )}
                        </>
                      )}
                    </div>
                  )}
                </Droppable>
              </motion.div>
            ))}
          </div>
        </div>
      </DragDropContext>
    </div>
  )
}
