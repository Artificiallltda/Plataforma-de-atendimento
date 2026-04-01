/**
 * Componentes PDF para Relatórios
 */

import { Document, Page, Text, View, StyleSheet, Font } from '@react-pdf/renderer'

// Tentar registrar fonte com fallback
try {
  Font.register({
    family: 'Roboto',
    fonts: [
      { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-light-webfont.ttf', fontWeight: 300 },
      { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-regular-webfont.ttf', fontWeight: 400 },
      { src: 'https://cdnjs.cloudflare.com/ajax/libs/ink/3.1.10/fonts/Roboto/roboto-bold-webfont.ttf', fontWeight: 700 }
    ]
  })
} catch (e) {
  // Font already registered
}

const styles = StyleSheet.create({
  page: {
    flexDirection: 'column',
    backgroundColor: '#ffffff',
    padding: 30
  },
  header: {
    marginBottom: 20,
    borderBottom: 2,
    borderBottomColor: '#4f46e5',
    paddingBottom: 10
  },
  title: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937'
  },
  subtitle: {
    fontSize: 12,
    color: '#6b7280',
    marginTop: 4
  },
  section: {
    marginBottom: 20
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: 'bold',
    color: '#374151',
    marginBottom: 10
  },
  kpiGrid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 10
  },
  kpiCard: {
    width: '48%',
    padding: 15,
    backgroundColor: '#f9fafb',
    borderRadius: 8,
    borderLeftWidth: 4,
    borderLeftColor: '#4f46e5'
  },
  kpiValue: {
    fontSize: 24,
    fontWeight: 'bold',
    color: '#1f2937'
  },
  kpiLabel: {
    fontSize: 10,
    color: '#6b7280',
    marginTop: 4
  },
  table: {
    marginTop: 10
  },
  tableRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#e5e7eb',
    paddingVertical: 8
  },
  tableHeader: {
    fontWeight: 'bold',
    fontSize: 10,
    color: '#374151'
  },
  tableCell: {
    fontSize: 9,
    color: '#6b7280'
  },
  footer: {
    position: 'absolute',
    bottom: 30,
    left: 30,
    right: 30,
    borderTopWidth: 1,
    borderTopColor: '#e5e7eb',
    paddingTop: 10,
    fontSize: 8,
    color: '#9ca3af',
    textAlign: 'center'
  }
})

interface ReportPDFProps {
  kpis: {
    ticketsAbertos: number
    ticketsCriticos: number
    tmrMedio: number
    csatMedio: number
    botContainmentRate: number
  }
  period: {
    start: string
    end: string
  }
  generatedAt: string
}

export function ReportPDF({ kpis, period, generatedAt }: ReportPDFProps) {
  return (
    <Document>
      <Page size="A4" style={styles.page}>
        {/* Header */}
        <View style={styles.header}>
          <Text style={styles.title}>Relatório PAA</Text>
          <Text style={styles.subtitle}>
            Plataforma de Atendimento Artificiall
          </Text>
          <Text style={styles.subtitle}>
            Período: {period.start} até {period.end}
          </Text>
        </View>

        {/* KPIs */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📊 KPIs Principais</Text>
          <View style={styles.kpiGrid}>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{kpis.ticketsAbertos}</Text>
              <Text style={styles.kpiLabel}>Tickets Abertos</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{kpis.ticketsCriticos}</Text>
              <Text style={styles.kpiLabel}>Tickets Críticos</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>
                {Math.round(kpis.tmrMedio / 60)}m
              </Text>
              <Text style={styles.kpiLabel}>TMR Médio</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{kpis.csatMedio} ⭐</Text>
              <Text style={styles.kpiLabel}>CSAT Médio</Text>
            </View>
            <View style={styles.kpiCard}>
              <Text style={styles.kpiValue}>{kpis.botContainmentRate}%</Text>
              <Text style={styles.kpiLabel}>Bot Containment</Text>
            </View>
          </View>
        </View>

        {/* Detalhes */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>📋 Detalhes</Text>
          <View style={styles.table}>
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '50%' }]}>
                Tickets Abertos
              </Text>
              <Text style={[styles.tableCell, { width: '50%', textAlign: 'right' }]}>
                {kpis.ticketsAbertos}
              </Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '50%' }]}>
                Tickets Críticos
              </Text>
              <Text style={[styles.tableCell, { width: '50%', textAlign: 'right' }]}>
                {kpis.ticketsCriticos}
              </Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '50%' }]}>
                TMR Médio
              </Text>
              <Text style={[styles.tableCell, { width: '50%', textAlign: 'right' }]}>
                {Math.round(kpis.tmrMedio / 60)} minutos
              </Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '50%' }]}>
                CSAT Médio
              </Text>
              <Text style={[styles.tableCell, { width: '50%', textAlign: 'right' }]}>
                {kpis.csatMedio} / 5.0
              </Text>
            </View>
            <View style={styles.tableRow}>
              <Text style={[styles.tableCell, { width: '50%' }]}>
                Bot Containment Rate
              </Text>
              <Text style={[styles.tableCell, { width: '50%', textAlign: 'right' }]}>
                {kpis.botContainmentRate}%
              </Text>
            </View>
          </View>
        </View>

        {/* Footer */}
        <Text style={styles.footer}>
          Gerado em {generatedAt} • Plataforma de Atendimento Artificiall (PAA)
        </Text>
      </Page>
    </Document>
  )
}

export async function exportReportToPDF(
  kpis: ReportPDFProps['kpis'],
  period: { start: string; end: string }
) {
  const { pdf } = await import('@react-pdf/renderer')
  
  const doc = (
    <ReportPDF
      kpis={kpis}
      period={period}
      generatedAt={new Date().toLocaleString('pt-BR')}
    />
  )

  const blob = await pdf(doc).toBlob()
  const url = URL.createObjectURL(blob)
  const link = document.createElement('a')
  link.href = url
  link.setAttribute('download', `relatorio_paa_${period.start}_to_${period.end}.pdf`)
  document.body.appendChild(link)
  link.click()
  document.body.removeChild(link)
  URL.revokeObjectURL(url)
}
