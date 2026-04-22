'use client'

import { BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Cell } from 'recharts'

const COLORS = ['#ef4444', '#f97316', '#eab308', '#84cc16', '#22c55e']

interface CsatDistributionChartProps {
  distribution: Record<number, number>
}

export function CsatDistributionChart({ distribution }: CsatDistributionChartProps) {
  const data = Object.entries(distribution).map(([score, count]) => ({
    score: `${score} ⭐`,
    count,
    label: ['Péssimo', 'Ruim', 'Regular', 'Bom', 'Excelente'][Number(score) - 1],
  }))

  const total = data.reduce((sum, d) => sum + d.count, 0)

  if (total === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-slate-400 text-sm">
        Sem avaliações CSAT no período
      </div>
    )
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} barSize={36}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#f1f5f9" />
          <XAxis dataKey="score" tick={{ fontSize: 12, fill: '#64748b' }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fontSize: 11, fill: '#94a3b8' }} axisLine={false} tickLine={false} />
          <Tooltip
            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 13 }}
            formatter={(value: number, name: string, props: any) => {
              const pct = total > 0 ? ((value / total) * 100).toFixed(1) : 0
              return [`${value} (${pct}%)`, props.payload.label]
            }}
          />
          <Bar dataKey="count" radius={[8, 8, 0, 0]}>
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index]} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  )
}
