'use client'

import { PieChart, Pie, Cell, ResponsiveContainer, Tooltip } from 'recharts'

const COLORS = ['#ef4444', '#fbbf24', '#22c55e']

interface NpsCompositionChartProps {
  distribution: { promoters: number; passives: number; detractors: number }
}

export function NpsCompositionChart({ distribution }: NpsCompositionChartProps) {
  const data = [
    { name: 'Detratores (0-6)', value: distribution.detractors },
    { name: 'Neutros (7-8)', value: distribution.passives },
    { name: 'Promotores (9-10)', value: distribution.promoters },
  ]

  const total = data.reduce((sum, d) => sum + d.value, 0)

  if (total === 0) {
    return (
      <div className="h-[280px] flex items-center justify-center text-slate-400 text-sm">
        Sem dados NPS no período
      </div>
    )
  }

  const renderLabel = ({ cx, cy, midAngle, innerRadius, outerRadius, percent }: any) => {
    if (percent < 0.05) return null
    const RADIAN = Math.PI / 180
    const radius = innerRadius + (outerRadius - innerRadius) * 0.5
    const x = cx + radius * Math.cos(-midAngle * RADIAN)
    const y = cy + radius * Math.sin(-midAngle * RADIAN)
    return (
      <text x={x} y={y} fill="white" textAnchor="middle" dominantBaseline="central" fontSize={13} fontWeight={700}>
        {`${(percent * 100).toFixed(0)}%`}
      </text>
    )
  }

  return (
    <div className="h-[280px] w-full">
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie
            data={data}
            cx="50%"
            cy="45%"
            innerRadius={55}
            outerRadius={95}
            paddingAngle={4}
            dataKey="value"
            labelLine={false}
            label={renderLabel}
          >
            {data.map((_, index) => (
              <Cell key={`cell-${index}`} fill={COLORS[index]} stroke="none" />
            ))}
          </Pie>
          <Tooltip
            contentStyle={{ borderRadius: 12, border: '1px solid #e2e8f0', boxShadow: '0 4px 12px rgba(0,0,0,0.08)', fontSize: 13 }}
            formatter={(value: number) => [`${value} resposta(s)`, '']}
          />
        </PieChart>
      </ResponsiveContainer>
      <div className="flex justify-center gap-5 -mt-2">
        {data.map((item, i) => (
          <div key={item.name} className="flex items-center gap-1.5 text-xs font-medium text-slate-500">
            <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: COLORS[i] }} />
            <span>{item.name.split(' (')[0]}</span>
          </div>
        ))}
      </div>
    </div>
  )
}
