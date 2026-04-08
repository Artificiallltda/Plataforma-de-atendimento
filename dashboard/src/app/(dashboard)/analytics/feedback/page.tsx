'use client'

import { useState } from 'react'
import { useFeedback } from '@/hooks/use-feedback'
import { ExportButton } from '@/components/export/ExportButton'
import { 
  LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, 
  XAxis, YAxis, CartesianGrid, Tooltip, Legend, ResponsiveContainer 
} from 'recharts'

const COLORS_CSAT = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e']
const COLORS_NPS = ['#ef4444', '#fcd34d', '#22c55e']

export default function FeedbackAnalyticsPage() {
  const [days, setDays] = useState(30)
  const { data, loading } = useFeedback({ days })

  if (loading || !data) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
      </div>
    )
  }

  const npsDistributionData = [
    { name: 'Detratores', value: data.npsDistribution.detractors },
    { name: 'Neutros', value: data.npsDistribution.passives },
    { name: 'Promotores', value: data.npsDistribution.promoters },
  ]

  const csatDistributionData = Object.entries(data.csatDistribution).map(([score, count]) => ({
    score: `${score} ⭐`,
    count
  }))

  return (
    <div className="p-8">
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-bold text-gray-900">Analytics de Satisfação</h1>
          <p className="text-gray-600">Monitore CSAT e NPS em tempo real</p>
        </div>
        <div className="flex gap-4">
          <div className="flex gap-2">
            {[7, 30, 90].map(d => (
              <button
                key={d}
                onClick={() => setDays(d)}
                className={`px-4 py-2 rounded-lg text-sm font-medium transition-colors ${
                  days === d 
                  ? 'bg-blue-600 text-white' 
                  : 'bg-white text-gray-600 border border-gray-200 hover:bg-gray-50'
                }`}
              >
                Últimos {d} dias
              </button>
            ))}
          </div>
          <ExportButton type="feedback" data={data} variant="primary" />
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6 mb-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">CSAT Médio</p>
          <div className="flex items-end gap-2">
            <h3 className="text-3xl font-bold">{data.csatAverage}</h3>
            <span className="text-yellow-500 mb-1">⭐</span>
          </div>
          <p className="text-xs text-gray-400 mt-2">Meta: {'>'} 4.0</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">NPS Score</p>
          <h3 className={`text-3xl font-bold ${
            data.npsScore >= 70 ? 'text-green-600' : 
            data.npsScore >= 30 ? 'text-blue-600' : 
            data.npsScore >= 0 ? 'text-yellow-600' : 'text-red-600'
          }`}>
            {data.npsScore}
          </h3>
          <p className="text-xs text-gray-400 mt-2 capitalize">Zona de: {data.npsClassification}</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">Promotores (9-10)</p>
          <h3 className="text-3xl font-bold text-green-600">{data.npsDistribution.promoters}</h3>
          <p className="text-xs text-gray-400 mt-2">Lealdade positiva</p>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <p className="text-sm text-gray-500 mb-1">Detratores (0-6)</p>
          <h3 className="text-3xl font-bold text-red-600">{data.npsDistribution.detractors}</h3>
          <p className="text-xs text-gray-400 mt-2">Risco de Churn</p>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* CSAT Evolution */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-6">Evolução do CSAT</h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.csatByDay}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" />
                <YAxis domain={[0, 5]} ticks={[0, 1, 2, 3, 4, 5]} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#3b82f6" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* CSAT Distribution */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-6">Distribuição de Notas</h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart data={csatDistributionData}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="score" />
                <YAxis />
                <Tooltip />
                <Bar dataKey="count" fill="#3b82f6" radius={[4, 4, 0, 0]}>
                  {csatDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS_CSAT[index]} />
                  ))}
                </Bar>
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8 mb-8">
        {/* NPS Composition */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-6">Composição NPS</h2>
          <div className="h-[300px] w-full flex items-center">
            <ResponsiveContainer width="100%" height="100%">
              <PieChart>
                <Pie
                  data={npsDistributionData}
                  cx="50%"
                  cy="50%"
                  innerRadius={60}
                  outerRadius={100}
                  paddingAngle={5}
                  dataKey="value"
                >
                  {npsDistributionData.map((entry, index) => (
                    <Cell key={`cell-${index}`} fill={COLORS_NPS[index]} />
                  ))}
                </Pie>
                <Tooltip />
                <Legend verticalAlign="bottom" height={36}/>
              </PieChart>
            </ResponsiveContainer>
          </div>
        </div>

        {/* NPS Evolution */}
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-6">Evolução NPS</h2>
          <div className="h-[300px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <LineChart data={data.npsByDay}>
                <CartesianGrid strokeDasharray="3 3" vertical={false} />
                <XAxis dataKey="date" />
                <YAxis domain={[-100, 100]} />
                <Tooltip />
                <Line type="monotone" dataKey="score" stroke="#10b981" strokeWidth={3} dot={{ r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>

      {/* Comentários Críticos */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4 text-red-600">⚠️ Críticas Recentes (CSAT {'<'} 3)</h2>
          <div className="space-y-4">
            {data.lowCsatComments.length > 0 ? (
              data.lowCsatComments.map((c) => (
                <div key={c.id} className="p-4 bg-red-50 rounded-lg border border-red-100">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-bold text-red-700">{c.score} ⭐</span>
                    <span className="text-xs text-gray-500">{new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-gray-700 italic">"{c.comment}"</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">Nenhuma crítica negativa recente.</p>
            )}
          </div>
        </div>

        <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100">
          <h2 className="text-lg font-semibold mb-4 text-orange-600">📉 Comentários de Detratores (NPS 0-6)</h2>
          <div className="space-y-4">
            {data.detractorComments.length > 0 ? (
              data.detractorComments.map((c) => (
                <div key={c.id} className="p-4 bg-orange-50 rounded-lg border border-orange-100">
                  <div className="flex justify-between mb-2">
                    <span className="text-sm font-bold text-orange-700">Nota: {c.score}</span>
                    <span className="text-xs text-gray-500">{new Date(c.created_at).toLocaleDateString()}</span>
                  </div>
                  <p className="text-sm text-gray-700 italic">"{c.comment}"</p>
                </div>
              ))
            ) : (
              <p className="text-sm text-gray-500">Nenhum comentário de detrator recente.</p>
            )}
          </div>
        </div>
      </div>
    </div>
  )
}
