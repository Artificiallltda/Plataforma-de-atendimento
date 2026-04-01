'use client'

import { useState } from 'react'
import { exportTicketsToCSV, exportKpisToCSV, exportFeedbackToCSV } from '@/lib/export-csv'
import { exportReportToPDF } from '@/lib/export-pdf'

interface ExportButtonProps {
  type: 'tickets' | 'kpis' | 'feedback' | 'report'
  data?: any
  variant?: 'primary' | 'secondary'
}

export function ExportButton({ type, data, variant = 'secondary' }: ExportButtonProps) {
  const [exporting, setExporting] = useState(false)

  const handleExport = async () => {
    setExporting(true)
    
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
    } catch (error) {
      console.error('Erro ao exportar:', error)
      alert('Erro ao exportar. Tente novamente.')
    } finally {
      setExporting(false)
    }
  }

  const baseClasses = 'px-4 py-2 rounded-lg font-medium transition flex items-center gap-2'
  const variantClasses = variant === 'primary'
    ? 'bg-indigo-600 text-white hover:bg-indigo-700'
    : 'bg-white text-gray-700 border border-gray-300 hover:bg-gray-50'

  const icons = {
    tickets: '📋',
    kpis: '📊',
    feedback: '⭐',
    report: '📄'
  }

  return (
    <button
      onClick={handleExport}
      disabled={exporting || !data}
      className={`${baseClasses} ${variantClasses} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <span>{icons[type]}</span>
      <span>{exporting ? 'Exportando...' : `Exportar ${type.toUpperCase()}`}</span>
    </button>
  )
}
