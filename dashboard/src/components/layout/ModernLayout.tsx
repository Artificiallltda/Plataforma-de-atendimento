'use client'

import React, { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname, useRouter } from 'next/navigation'
import { 
  LayoutDashboard, 
  Users, 
  BarChart3, 
  LogOut, 
  Menu, 
  X,
  UserCircle,
  Bell
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
      
      setRole(agent?.sector?.toLowerCase() || 'supervisor')
    }
    getUser()
  }, [router, supabase])

  // MENU SEM FILTRO - APARECE TUDO PARA TODOS OS LOGADOS
  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { name: 'Métricas', icon: BarChart3, path: '/analytics/feedback' },
    { name: 'Equipe', icon: Users, path: '/admin/agents' }
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
        <div className="h-20 flex items-center px-6 border-b border-slate-100">
          <div className="h-10 w-10 premium-gradient rounded-xl flex items-center justify-center text-white font-bold text-xl">
            A
          </div>
          {isSidebarOpen && (
            <motion.span 
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              className="ml-3 font-bold text-slate-800 text-lg"
            >
              Artificiall <span className="text-blue-600">PAA</span>
            </motion.span>
          )}
        </div>

        <nav className="flex-1 py-6 px-3 space-y-2">
          {menuItems.map((item) => (
            <Link 
              key={item.path} 
              href={item.path}
              className={cn(
                "group flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
                pathname === item.path 
                  ? "bg-blue-600 text-white shadow-md shadow-blue-200" 
                  : "text-slate-500 hover:bg-blue-50 hover:text-blue-600"
              )}
            >
              <item.icon size={22} className={cn(pathname === item.path ? "text-white" : "group-hover:scale-110 transition-transform")} />
              {isSidebarOpen && (
                <span className="font-medium">{item.name}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-xl text-slate-500 hover:bg-red-50 hover:text-red-600 transition-all"
          >
            <LogOut size={22} />
            {isSidebarOpen && <span className="font-medium">Sair</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0">
        <header className="h-20 bg-white border-b border-slate-200 flex items-center justify-between px-8 sticky top-0 z-40">
          <div className="flex items-center gap-4">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-100 rounded-lg text-slate-600"
            >
              {isSidebarOpen ? <X size={20} /> : <Menu size={20} />}
            </button>
            <div className="h-6 w-[1px] bg-slate-200 mx-2" />
            <h2 className="text-xl font-bold text-slate-800">
              {menuItems.find(i => i.path === pathname)?.name || 'Atendimento'}
            </h2>
          </div>

          <div className="flex items-center gap-3 pl-6 border-l border-slate-200">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-semibold text-slate-900 leading-none mb-1">
                {user?.email?.split('@')[0]}
              </p>
              <p className="text-xs font-medium text-blue-600 capitalize">
                {role}
              </p>
            </div>
            <div className="h-10 w-10 rounded-full bg-slate-200 flex items-center justify-center text-slate-600 border border-slate-300">
              <UserCircle size={24} />
            </div>
          </div>
        </header>

        <div className="flex-1 p-8 overflow-auto">
          {children}
        </div>
      </main>
    </div>
  )
}
