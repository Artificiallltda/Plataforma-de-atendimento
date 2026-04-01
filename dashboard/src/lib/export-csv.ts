/**
 * Utilitário de Exportação CSV
 */

import Papa from 'papaparse'

export function exportToCSV<T extends Record<string, any>>(
  data: T[],
  filename: string,
  columns?: { key: keyof T; label: string }[]
) {
  // Se colunas não fornecidas, usar chaves do primeiro objeto
  const headers = columns
    ? columns.map(c => c.label)
    : Object.keys(data[0] || {})

  // Transformar dados
  const rows = data.map(item => {
    if (columns) {
      return columns.map(c => item[c.key])
    }
    return Object.values(item)
  })

  // Gerar CSV
  const csv = Papa.unparse({
    fields: headers,
    data: rows
  })

  // Criar blob e download
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' })
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', filename)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}

export function exportTicketsToCSV(tickets: any[]) {
  const filename = `tickets_${new Date().toISOString().split('T')[0]}.csv`
  
  exportToCSV(tickets, filename, [
    { key: 'id', label: 'ID' },
    { key: 'customer.name', label: 'Cliente' },
    { key: 'channel', label: 'Canal' },
    { key: 'sector', label: 'Setor' },
    { key: 'status', label: 'Status' },
    { key: 'priority', label: 'Prioridade' },
    { key: 'intent', label: 'Intenção' },
    { key: 'currentAgent', label: 'Agente IA' },
    { key: 'createdAt', label: 'Criado em' },
    { key: 'resolvedAt', label: 'Resolvido em' },
    { key: 'csatScore', label: 'CSAT' }
  ])
}

export function exportKpisToCSV(kpis: any, period: { start: string; end: string }) {
  const filename = `kpis_${period.start}_to_${period.end}.csv`
  
  const data = [{
    periodo: `${period.start} até ${period.end}`,
    tickets_abertos: kpis.ticketsAbertos,
    tickets_criticos: kpis.ticketsCriticos,
    tmr_medio_segundos: kpis.tmrMedio,
    tmr_medio_minutos: Math.round(kpis.tmrMedio / 60),
    csat_medio: kpis.csatMedio,
    bot_containment_rate: kpis.botContainmentRate,
    agentes_online: kpis.agentesOnline,
    fila_suporte: kpis.filaSuporte,
    fila_financeiro: kpis.filaFinanceiro,
    fila_comercial: kpis.filaComercial
  }]

  exportToCSV(data, filename)
}

export function exportFeedbackToCSV(feedback: any[]) {
  const filename = `feedback_${new Date().toISOString().split('T')[0]}.csv`
  
  exportToCSV(feedback, filename, [
    { key: 'id', label: 'ID' },
    { key: 'type', label: 'Tipo' },
    { key: 'score', label: 'Score' },
    { key: 'comment', label: 'Comentário' },
    { key: 'createdAt', label: 'Data' }
  ])
}
