import { ModernLayout } from '@/components/layout/ModernLayout'

export default function DashboardLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <ModernLayout>
      {children}
    </ModernLayout>
  )
}
