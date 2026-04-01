interface QueueBySectorProps {
  suporte: number
  financeiro: number
  comercial: number
}

export function QueueBySector({ suporte, financeiro, comercial }: QueueBySectorProps) {
  const total = suporte + financeiro + comercial
  const max = Math.max(suporte, financeiro, comercial, 1)

  return (
    <div className="bg-white rounded-xl shadow-sm p-6">
      <h3 className="text-lg font-semibold text-gray-900 mb-4">
        📊 Fila por Setor
      </h3>

      <div className="space-y-4">
        {/* Suporte */}
        <QueueBar
          label="Suporte"
          count={suporte}
          total={total}
          max={max}
          color="bg-blue-500"
          icon="🔧"
        />

        {/* Financeiro */}
        <QueueBar
          label="Financeiro"
          count={financeiro}
          total={total}
          max={max}
          color="bg-green-500"
          icon="💰"
        />

        {/* Comercial */}
        <QueueBar
          label="Comercial"
          count={comercial}
          total={total}
          max={max}
          color="bg-purple-500"
          icon="🤝"
        />
      </div>

      {/* Total */}
      <div className="mt-6 pt-4 border-t">
        <div className="flex justify-between items-center">
          <span className="font-medium text-gray-900">Total</span>
          <span className="text-2xl font-bold text-gray-900">{total}</span>
        </div>
      </div>
    </div>
  )
}

interface QueueBarProps {
  label: string
  count: number
  total: number
  max: number
  color: string
  icon: string
}

function QueueBar({ label, count, total, max, color, icon }: QueueBarProps) {
  const percentage = (count / max) * 100
  const percentOfTotal = total > 0 ? (count / total) * 100 : 0

  return (
    <div>
      <div className="flex justify-between items-center mb-1">
        <span className="text-sm font-medium text-gray-700">
          {icon} {label}
        </span>
        <span className="text-sm text-gray-600">
          {count} ({Math.round(percentOfTotal)}%)
        </span>
      </div>
      <div className="w-full bg-gray-200 rounded-full h-3">
        <div
          className={`${color} h-3 rounded-full transition-all duration-500`}
          style={{ width: `${percentage}%` }}
        />
      </div>
    </div>
  )
}
