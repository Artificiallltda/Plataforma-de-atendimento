'use client'

interface NpsGaugeProps {
  score: number
  classification: string
}

export function NpsGauge({ score, classification }: NpsGaugeProps) {
  // Score ranges from -100 to 100, normalize to 0-180 degrees
  const normalizedScore = ((score + 100) / 200) * 180
  const rotation = normalizedScore - 90 // SVG rotation offset

  const getColor = () => {
    if (score >= 70) return '#10b981'
    if (score >= 30) return '#3b82f6'
    if (score >= 0) return '#f59e0b'
    return '#ef4444'
  }

  const getLabel = () => {
    return classification.replace('_', ' ').replace(/\b\w/g, l => l.toUpperCase())
  }

  // Build arc path for SVG gauge
  const createArc = (startAngle: number, endAngle: number, radius: number) => {
    const cx = 120, cy = 120
    const start = {
      x: cx + radius * Math.cos((Math.PI * startAngle) / 180),
      y: cy + radius * Math.sin((Math.PI * startAngle) / 180),
    }
    const end = {
      x: cx + radius * Math.cos((Math.PI * endAngle) / 180),
      y: cy + radius * Math.sin((Math.PI * endAngle) / 180),
    }
    const largeArcFlag = endAngle - startAngle > 180 ? 1 : 0
    return `M ${start.x} ${start.y} A ${radius} ${radius} 0 ${largeArcFlag} 1 ${end.x} ${end.y}`
  }

  const filledAngle = 180 + normalizedScore // from 180° (left) to 180+normalized

  return (
    <div className="flex flex-col items-center justify-center py-4">
      <svg width="240" height="140" viewBox="0 0 240 140">
        {/* Background arc */}
        <path
          d={createArc(180, 360, 90)}
          fill="none"
          stroke="#e2e8f0"
          strokeWidth="18"
          strokeLinecap="round"
        />
        {/* Colored arc */}
        {normalizedScore > 0 && (
          <path
            d={createArc(180, Math.min(filledAngle, 360), 90)}
            fill="none"
            stroke={getColor()}
            strokeWidth="18"
            strokeLinecap="round"
            style={{
              filter: `drop-shadow(0 0 6px ${getColor()}40)`,
            }}
          />
        )}

        {/* Zone labels */}
        <text x="20" y="135" fontSize="9" fill="#94a3b8" fontWeight="600">-100</text>
        <text x="108" y="22" fontSize="9" fill="#94a3b8" fontWeight="600">0</text>
        <text x="210" y="135" fontSize="9" fill="#94a3b8" fontWeight="600">+100</text>

        {/* Score display */}
        <text x="120" y="100" textAnchor="middle" fontSize="36" fontWeight="800" fill={getColor()}>
          {score}
        </text>
        <text x="120" y="125" textAnchor="middle" fontSize="12" fontWeight="600" fill="#64748b">
          {getLabel()}
        </text>
      </svg>

      {/* Legend */}
      <div className="flex gap-4 mt-4 text-xs font-medium text-slate-500">
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-red-400" />
          <span>&lt; 0</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-amber-400" />
          <span>0-29</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-blue-400" />
          <span>30-69</span>
        </div>
        <div className="flex items-center gap-1.5">
          <div className="w-2.5 h-2.5 rounded-full bg-emerald-400" />
          <span>70+</span>
        </div>
      </div>
    </div>
  )
}
