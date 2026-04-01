import { KpiData } from '@/hooks/use-kpis'

interface KpiCardsProps {
  kpis: KpiData
}

export function KpiCards({ kpis }: KpiCardsProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-8">
      {/* Tickets Abertos */}
      <KpiCard
        title="Tickets Abertos"
        value={kpis.ticketsAbertos}
        icon="📋"
        color="bg-blue-500"
        subtitle={`${kpis.ticketsCriticos} críticos`}
      />

      {/* TMR */}
      <KpiCard
        title="Tempo Médio de Resposta"
        value={formatTime(kpis.tmrMedio)}
        icon="⏱️"
        color="bg-green-500"
        subtitle="Meta: < 5 min"
      />

      {/* CSAT */}
      <KpiCard
        title="CSAT Médio"
        value={kpis.csatMedio > 0 ? `${kpis.csatMedio} ⭐` : 'N/A'}
        icon="⭐"
        color="bg-yellow-500"
        subtitle="Meta: > 4.0"
      />

      {/* Bot Containment */}
      <KpiCard
        title="Bot Containment"
        value={`${kpis.botContainmentRate}%`}
        icon="🤖"
        color="bg-purple-500"
        subtitle="Resolvidos sem humano"
      />
    </div>
  )
}

interface KpiCardProps {
  title: string
  value: string | number
  icon: string
  color: string
  subtitle?: string
}

function KpiCard({ title, value, icon, color, subtitle }: KpiCardProps) {
  return (
    <div className="bg-white rounded-xl shadow-sm p-6 border-l-4" style={{ borderColor: color.replace('bg-', '') }}>
      <div className="flex items-center justify-between mb-2">
        <span className="text-2xl">{icon}</span>
        <span className={`px-2 py-1 rounded-full text-xs font-medium text-white ${color}`}>
          Ao vivo
        </span>
      </div>
      <p className="text-3xl font-bold text-gray-900 mb-1">{value}</p>
      <p className="text-sm text-gray-600">{title}</p>
      {subtitle && <p className="text-xs text-gray-400 mt-1">{subtitle}</p>}
    </div>
  )
}

function formatTime(seconds: number): string {
  if (seconds < 60) return `${seconds}s`
  const mins = Math.round(seconds / 60)
  if (mins < 60) return `${mins}m`
  const hours = Math.round(mins / 60)
  return `${hours}h`
}
