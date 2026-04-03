'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'

export interface Agent {
  id: string
  name: string
  email: string
  sector: 'suporte' | 'financeiro' | 'comercial' | 'supervisor'
  isOnline: boolean
  ticketsAtivos: number
}

export function useAgents(enabled: boolean = true) {
  const [agents, setAgents] = useState<Agent[]>([])
  const [loading, setLoading] = useState(true)
  const supabase = createClient()

  useEffect(() => {
    const loadAgents = async () => {
      // Buscar agentes
      const { data: agentsData } = await supabase
        .from('agents')
        .select('*')

      if (!agentsData) {
        setLoading(false)
        return
      }

      // Ordenação manual no JavaScript (Imune a erros de nome de coluna no banco)
      const sortedAgentsData = [...agentsData].sort((a, b) => {
        // Ordenar primeiro por setor e depois por nome
        const sectorComp = (a.sector || '').localeCompare(b.sector || '')
        if (sectorComp !== 0) return sectorComp
        return (a.name || '').localeCompare(b.name || '')
      })

      // Buscar carga de tickets para cada agente
      const agentsWithTickets = await Promise.all(
        sortedAgentsData.map(async (agent) => {
          const { count } = await supabase
            .from('tickets')
            .select('id', { count: 'exact', head: true })
            .or(`assignedTo.eq.${agent.id},assigned_to.eq.${agent.id}`) // Busca flexível para os dois casos
            .neq('status', 'resolvido')

          return {
            ...agent,
            ticketsAtivos: count || 0
          } as Agent
        })
      )

      setAgents(agentsWithTickets)
      setLoading(false)
    }

    loadAgents()
  }, [enabled, supabase])

  return { agents, loading }
}

interface AgentsListProps {
  agents: Agent[]
  loading?: boolean
}

export function AgentsList({ agents, loading }: AgentsListProps) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-600"></div>
      </div>
    )
  }

  const onlineAgents = agents.filter(a => a.isOnline)
  const offlineAgents = agents.filter(a => !a.isOnline)

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        👥 Agentes Online ({onlineAgents.length})
      </h3>

      <div className="space-y-3">
        {onlineAgents.map(agent => (
          <AgentRow key={agent.id} agent={agent} />
        ))}
      </div>

      {offlineAgents.length > 0 && (
        <>
          <h4 className="text-sm font-medium text-gray-600 mt-6 mb-3">
            Offline ({offlineAgents.length})
          </h4>
          <div className="space-y-3">
            {offlineAgents.map(agent => (
              <AgentRow key={agent.id} agent={agent} />
            ))}
          </div>
        </>
      )}
    </div>
  )
}

interface AgentRowProps {
  agent: Agent
}

function AgentRow({ agent }: AgentRowProps) {
  const sectorIcons = {
    suporte: '🔧',
    financeiro: '💰',
    comercial: '🤝',
    supervisor: '👑'
  }

  const loadColor = agent.ticketsAtivos > 5 ? 'text-red-600 font-medium' :
                    agent.ticketsAtivos > 3 ? 'text-yellow-600' :
                    'text-gray-600'

  return (
    <div className="flex items-center justify-between p-3 bg-gray-50 rounded-lg">
      <div className="flex items-center gap-3">
        <div className={`w-2 h-2 rounded-full ${agent.isOnline ? 'bg-green-500' : 'bg-gray-400'}`} />
        <div>
          <p className="font-medium text-gray-900">{agent.name}</p>
          <p className="text-xs text-gray-500">
            {sectorIcons[agent.sector]} {agent.sector}
          </p>
        </div>
      </div>
      <div className={`text-sm ${loadColor}`}>
        {agent.ticketsAtivos} tickets
      </div>
    </div>
  )
}
