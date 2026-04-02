'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { 
  LayoutDashboard, 
  MessageSquare, 
  Users, 
  BarChart3, 
  Settings, 
  LogOut, 
  Menu, 
  X,
  UserCircle,
  Bell,
  ChevronRight
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface ModernLayoutProps {
  children: React.ReactNode
}

export function ModernLayout({ children }: ModernLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [role, setRole] = useState<string>('')
  const pathname = usePathname()
  const router = useRouter()
  const supabase = createClient()

  useEffect(() => {
    const getUser = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        router.push('/login')
        return
      }
      setUser(user)

      const { data: agent } = await supabase
        .from('agents')
        .select('sector')
        .eq('email', user.email)
        .single()
      
      setRole(agent?.sector || 'atendente')
    }
    getUser()
  }, [router, supabase])

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard', roles: ['suporte', 'financeiro', 'comercial', 'supervisor'] },
    { name: 'Analytics', icon: BarChart3, path: '/supervisor', roles: ['supervisor'] },
    { name: 'Atendentes', icon: Users, path: '/admin/agents', roles: ['supervisor'] },
    { name: 'Configurações', icon: Settings, path: '/settings', roles: ['suporte', 'financeiro', 'comercial', 'supervisor'] },
  ]

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 flex">
      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-white border-r border-slate-200 transition-all duration-300 flex flex-col z-50",
          isSidebarOpen ? "w-64" : "w-20"
        )}
      >
        {/* Logo Area */}
        <div className="h-20 flex items-center px-6 border-b border-slate-100">
          <div className="h-10 w-10 premium-gradient rounded-xl flex items-center justify-center text-white font-bold text-xl">
            A
          </div>
          {isSidebarOpen && (
            <motion.span 
              initial={{ opacity: 0, x: -10 }}
              animate={{ opacity: 1, x: 0 }}
              className="ml-3 font-bold text-slate-800 text-lg tracking-tight"
            >
              Artificiall <span className="text-blue-600">PAA</span>
            </motion.span>
          )}
        </div>

        {/* Navigation */}
        <nav className="flex-1 py-6 px-3 space-y-2">
          {menuItems.filter(item => item.roles.includes(role)).map((item) => (
            <Link 
              key={item.path} 
              href={item.path}
              className={cn(
                "group relative",
                pathname === item.path ? "sidebar-link-active" : "sidebar-link"
              )}
            >
              <item.icon size={22} className={cn(pathname === item.path ? "text-white" : "group-hover:scale-110 transition-transform")} />
              {isSidebarOpen && (
                <motion.span
                  initial={{ opacity: 0, x: -10 }}
                  animate={{ opacity: 1, x: 0 }}
                  className="font-medium"
                >
                  {item.name}
                </motion.span>
              )}
              {!isSidebarOpen && (
                <div className="absolute left-14 bg-slate-800 text-white px-2 py-1 rounded text-xs opacity-0 group-hover:opacity-100 transition-opacity whitespace-nowrap pointer-events-none z-50">
                  {item.name}
                </div>
              )}
            </Link>
          ))}
        </nav>

        {/* User Footer */}
        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all group"
          >
            <LogOut size={22} className="group-hover:-translate-x-1 transition-transform" />
            {isSidebarOpen && <span className="font-medium">Sair</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        {/* Header */}
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-100 rounded-lg transition-colors text-slate-600"
            >
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="h-6 w-[1px] bg-slate-200 mx-2" />
            <h2 className="text-xl font-bold text-slate-800 tracking-tight">
              {menuItems.find(i => i.path === pathname)?.name || 'Atendimento'}
            </h2>
          </div>

          <div className="flex items-center gap-6">
            {/* Search or Notifications could go here */}
            <button className="relative p-2 text-slate-500 hover:bg-slate-100 rounded-full transition-colors">
              <Bell size={20} />
              <span className="absolute top-2 right-2 h-2 w-2 bg-red-500 rounded-full border-2 border-white" />
            </button>

            <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
              <div className="text-right hidden sm:block">
                <p className="text-sm font-semibold text-slate-900 leading-none mb-1">
                  {user?.email?.split('@')[0] || 'Agente'}
                </p>
                <p className="text-xs font-medium text-blue-600 capitalize">
                  {role}
                </p>
              </div>
              <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 border border-slate-300">
                <UserCircle size={24} />
              </div>
            </div>
          </div>
        </header>

        {/* Page Content */}
        <div className="flex-1 p-8 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
