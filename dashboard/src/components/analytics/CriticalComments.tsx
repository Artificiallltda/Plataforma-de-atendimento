'use client'

import { motion } from 'framer-motion'
import { AlertTriangle, TrendingDown } from 'lucide-react'

interface Comment {
  id: string
  score: number
  comment: string
  created_at: string
}

interface CriticalCommentsProps {
  lowCsat: Comment[]
  detractors: Comment[]
}

function CommentCard({ comment, color }: { comment: Comment; color: 'red' | 'orange' }) {
  const colorMap = {
    red: {
      bg: 'bg-rose-50/80',
      border: 'border-rose-100',
      badge: 'bg-rose-100 text-rose-700',
    },
    orange: {
      bg: 'bg-amber-50/80',
      border: 'border-amber-100',
      badge: 'bg-amber-100 text-amber-700',
    },
  }
  const c = colorMap[color]

  return (
    <div className={`p-4 ${c.bg} rounded-xl ${c.border} border transition-all hover:shadow-sm`}>
      <div className="flex justify-between items-center mb-2">
        <span className={`text-xs font-bold px-2 py-0.5 rounded-md ${c.badge}`}>
          {color === 'red' ? `${comment.score} ⭐` : `Nota: ${comment.score}`}
        </span>
        <span className="text-[11px] text-slate-400 font-medium">
          {new Date(comment.created_at).toLocaleDateString('pt-BR')}
        </span>
      </div>
      <p className="text-sm text-slate-600 italic leading-relaxed">&ldquo;{comment.comment}&rdquo;</p>
    </div>
  )
}

export function CriticalComments({ lowCsat, detractors }: CriticalCommentsProps) {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.5 }}
        className="bg-white/70 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/40 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-5">
          <div className="p-2 bg-rose-100 rounded-lg">
            <AlertTriangle size={16} className="text-rose-600" />
          </div>
          <h2 className="text-base font-bold text-slate-700">
            Críticas Recentes <span className="text-slate-400 font-medium">(CSAT &lt; 3)</span>
          </h2>
        </div>
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {lowCsat.length > 0 ? (
            lowCsat.map(c => <CommentCard key={c.id} comment={c} color="red" />)
          ) : (
            <div className="text-center py-8 text-slate-400 text-sm">
              <p>🎉 Nenhuma crítica negativa recente!</p>
            </div>
          )}
        </div>
      </motion.div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.55 }}
        className="bg-white/70 backdrop-blur-sm p-6 rounded-2xl border border-slate-200/40 shadow-sm"
      >
        <div className="flex items-center gap-2 mb-5">
          <div className="p-2 bg-amber-100 rounded-lg">
            <TrendingDown size={16} className="text-amber-600" />
          </div>
          <h2 className="text-base font-bold text-slate-700">
            Detratores <span className="text-slate-400 font-medium">(NPS 0-6)</span>
          </h2>
        </div>
        <div className="space-y-3 max-h-[400px] overflow-y-auto pr-1">
          {detractors.length > 0 ? (
            detractors.map(c => <CommentCard key={c.id} comment={c} color="orange" />)
          ) : (
            <div className="text-center py-8 text-slate-400 text-sm">
              <p>🎉 Nenhum detrator recente!</p>
            </div>
          )}
        </div>
      </motion.div>
    </div>
  )
}
