'use client'

import { useEffect, useState } from 'react'
import { exportTicketsToCSV, exportKpisToCSV, exportFeedbackToCSV } from '@/lib/export-csv'
import { exportReportToPDF } from '@/lib/export-pdf'

interface ExportButtonProps {
  type: 'tickets' | 'kpis' | 'feedback' | 'report'
  data?: any
  variant?: 'primary' | 'secondary'
}

export function ExportButton({ type, data, variant = 'secondary' }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!error) return
    const t = setTimeout(() => setError(null), 4000)
    return () => clearTimeout(t)
  }, [error])

  const handleExport = async () => {
    setExporting(true)
    setError(null)

    try {
      if (type === 'tickets' && data) {
        exportTicketsToCSV(data)
      } else if (type === 'kpis' && data) {
        const period = {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end: new Date().toISOString().split('T')[0]
        }
        exportKpisToCSV(data, period)
      } else if (type === 'feedback' && data) {
        exportFeedbackToCSV(data)
      } else if (type === 'report' && data) {
        const period = {
          start: new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
          end: new Date().toISOString().split('T')[0]
        }
        await exportReportToPDF(data.kpis, period)
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Erro ao exportar'
      console.error('Erro ao exportar:', message)
      setError(message)
    } finally {
      setExporting(false)
    }
  }

  const baseClasses = 'px-4 py-2 rounded-lg font-medium transition flex items-center gap-2'
  const variantClasses = variant === 'primary'
    ? 'bg-indigo-600 hover:bg-indigo-700 text-white'
    : 'bg-white dark:bg-slate-800 text-slate-700 dark:text-slate-200 border border-slate-300 dark:border-slate-600 hover:bg-slate-50 dark:hover:bg-slate-700'

  const icons = {
    tickets: '📋',
    kpis: '📊',
    feedback: '⭐',
    report: '📄'
  }

  return (
    <div className="relative inline-block">
      <button
        onClick={handleExport}
        disabled={exporting || !data}
        className={`${baseClasses} ${variantClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
      >
        <span>{icons[type]}</span>
        <span>{exporting ? 'Exportando...' : `Exportar ${type.toUpperCase()}`}</span>
      </button>
      {error && (
        <div className="absolute top-full mt-2 right-0 px-3 py-2 bg-rose-50 dark:bg-rose-900/30 border border-rose-200 dark:border-rose-800/50 text-rose-700 dark:text-rose-300 text-xs rounded-lg shadow-sm whitespace-nowrap z-10">
          {error}
        </div>
      )}
    </div>
  )
}
