'use client'

import React, { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase/client'
import { 
  UserPlus, 
  Trash2, 
  Shield, 
  Mail, 
  Calendar,
  Search,
  MoreVertical,
  Loader2,
  UserCheck,
  UserMinus
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'
import { AddAgentModal } from '@/components/admin/AddAgentModal'
import { ModernLayout } from '@/components/layout/ModernLayout'

export default function AdminAgentsPage() {
  const [agents, setAgents] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [isModalOpen, setIsModalOpen] = useState(false)
  const [searchTerm, setSearchTerm] = useState('')
  const supabase = createClient()

  const loadAgents = async () => {
    try {
      setLoading(true)
      const { data, error } = await supabase
        .from('agents')
        .select('*')
        .order('name')
      
      if (error) throw error
      setAgents(data || [])
    } catch (err) {
      console.error('Erro ao carregar agentes:', err)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    loadAgents()
  }, [])

  const handleDelete = async (id: string) => {
    if (!confirm('Deseja realmente remover este atendente? Esta ação é irreversível.')) return

    try {
      const response = await fetch(`/api/admin/register-agent?id=${id}`, {
        method: 'DELETE'
      })

      if (!response.ok) throw new Error('Erro ao deletar')
      
      loadAgents()
    } catch (err) {
      alert('Erro ao remover agente')
    }
  }

  const filteredAgents = agents.filter(a => 
    a.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
    a.email.toLowerCase().includes(searchTerm.toLowerCase())
  )

  return (
    <ModernLayout>
      <div className="space-y-8">
        {/* Page Header */}
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
          <div>
            <h1 className="text-3xl font-bold text-slate-800 tracking-tight">Gestão de Equipe</h1>
            <p className="text-slate-500 mt-1">Gerencie os acessos e setores dos atendentes da PAA.</p>
          </div>
          <button 
            onClick={() => setIsModalOpen(true)}
            className="premium-gradient text-white px-6 py-3 rounded-2xl font-bold flex items-center justify-center gap-2 hover:scale-[1.02] active:scale-[0.98] transition-all shadow-lg shadow-blue-100"
          >
            <UserPlus size={20} />
            Novo Atendente
          </button>
        </div>

        {/* Stats Summary */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
          <StatCard title="Total de Agentes" value={agents.length} icon={UserCheck} color="text-blue-600" bg="bg-blue-50" />
          <StatCard title="Setor Supore" value={agents.filter(a => a.sector === 'suporte').length} icon={Shield} color="text-purple-600" bg="bg-purple-50" />
          <StatCard title="Setor Financeiro" value={agents.filter(a => a.sector === 'financeiro').length} icon={Shield} color="text-emerald-600" bg="bg-emerald-50" />
        </div>

        {/* Search & Table */}
        <div className="bg-white rounded-3xl border border-slate-200 overflow-hidden shadow-sm">
          <div className="p-6 border-b border-slate-100 flex items-center justify-between gap-4">
            <div className="relative flex-1 max-w-md">
              <Search size={18} className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400" />
              <input 
                type="text" 
                placeholder="Buscar por nome ou email..." 
                className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all"
                value={searchTerm}
                onChange={e => setSearchTerm(e.target.value)}
              />
            </div>
            <p className="text-sm font-medium text-slate-500">{filteredAgents.length} atendentes encontrados</p>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="bg-slate-50/50">
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Atendente</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Setor</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Status</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider">Criado em</th>
                  <th className="px-6 py-4 text-xs font-bold text-slate-400 uppercase tracking-wider text-right">Ações</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100">
                {loading ? (
                  Array.from({ length: 3 }).map((_, i) => (
                    <tr key={i}>
                      <td colSpan={5} className="px-6 py-8 animate-pulse bg-slate-50/20" />
                    </tr>
                  ))
                ) : filteredAgents.map((agent) => (
                  <tr key={agent.id} className="hover:bg-slate-50/50 transition-colors group">
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-3">
                        <div className="h-10 w-10 rounded-full bg-slate-100 flex items-center justify-center text-slate-600 font-bold border border-slate-200">
                          {agent.name.charAt(0)}
                        </div>
                        <div>
                          <p className="font-bold text-slate-800 leading-none mb-1">{agent.name}</p>
                          <div className="flex items-center gap-1 text-xs text-slate-500">
                            <Mail size={12} />
                            {agent.email}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <span className={cn(
                        "px-3 py-1 rounded-full text-xs font-bold capitalize",
                        agent.sector === 'supervisor' ? "bg-amber-100 text-amber-700" :
                        agent.sector === 'suporte' ? "bg-blue-100 text-blue-700" :
                        agent.sector === 'financeiro' ? "bg-emerald-100 text-emerald-700" :
                        "bg-purple-100 text-purple-700"
                      )}>
                        {agent.sector}
                      </span>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-2">
                        <div className={cn("h-2 w-2 rounded-full", agent.isOnline ? "bg-emerald-500 animate-pulse" : "bg-slate-300")} />
                        <span className="text-xs font-medium text-slate-600">{agent.isOnline ? 'Online' : 'Offline'}</span>
                      </div>
                    </td>
                    <td className="px-6 py-4">
                      <div className="flex items-center gap-1.5 text-xs text-slate-500 font-medium">
                        <Calendar size={14} />
                        {new Date(agent.createdAt).toLocaleDateString('pt-BR')}
                      </div>
                    </td>
                    <td className="px-6 py-4 text-right">
                      <button 
                        onClick={() => handleDelete(agent.id)}
                        className="p-2 hover:bg-rose-50 text-slate-400 hover:text-rose-600 rounded-lg transition-all"
                        title="Remover Agente"
                      >
                        <UserMinus size={18} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        <AddAgentModal 
          isOpen={isModalOpen} 
          onClose={() => setIsModalOpen(false)} 
          onSuccess={loadAgents}
        />
      </div>
    </ModernLayout>
  )
}

function StatCard({ title, value, icon: Icon, color, bg }: any) {
  return (
    <div className="bg-white p-6 rounded-3xl border border-slate-200 flex items-center gap-5 shadow-sm">
      <div className={cn("p-4 rounded-2xl shadow-sm", bg, color)}>
        <Icon size={24} />
      </div>
      <div>
        <p className="text-xs font-bold text-slate-400 uppercase tracking-wider">{title}</p>
        <p className="text-2xl font-black text-slate-800">{value}</p>
      </div>
    </div>
  )
}

function cn(...inputs: any[]) {
  return inputs.filter(Boolean).join(' ')
}
