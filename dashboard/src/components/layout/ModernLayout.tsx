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

import Image from 'next/image'

function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

interface ModernLayoutProps {
  children: React.ReactNode
}

export function ModernLayout({ children }: ModernLayoutProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true)
  const [user, setUser] = useState<any>(null)
  const [role, setRole] = useState<string>('Supervisor')
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
      
      if (agent?.sector) {
        setRole(agent.sector.charAt(0).toUpperCase() + agent.sector.slice(1))
      }
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
    <div className="min-h-screen bg-[#f8fafc] flex relative overflow-hidden">
      {/* Background Mesh Gradients - Efeito Premium */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-100/50 rounded-full blur-3xl opacity-60 animate-pulse pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-indigo-50/50 rounded-full blur-3xl opacity-80 pointer-events-none" />
      <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[800px] h-[800px] bg-slate-100/30 rounded-full blur-3xl pointer-events-none" />

      {/* Sidebar */}
      <aside 
        className={cn(
          "bg-white/80 backdrop-blur-xl border-r border-slate-200/50 transition-all duration-500 ease-in-out flex flex-col z-50 relative",
          isSidebarOpen ? "w-64" : "w-24"
        )}
      >
        {/* Logo Area */}
        <div className="h-24 flex items-center px-6 border-b border-slate-100/50 overflow-hidden justify-center bg-white/50 backdrop-blur-sm">
          <div className="relative h-14 w-full flex-shrink-0 transition-transform duration-300 transform hover:scale-105">
            <Image 
              src="/brand/logo.png" 
              alt="Artificiall" 
              fill 
              className="object-contain"
              priority
            />
          </div>
        </div>

        <nav className="flex-1 py-8 px-4 space-y-3">
          {menuItems.map((item) => (
            <Link 
              key={item.path} 
              href={item.path}
              className={cn(
                "group flex items-center gap-3 px-4 py-3.5 rounded-2xl transition-all duration-300",
                pathname === item.path 
                  ? "bg-slate-900 text-white shadow-lg shadow-slate-200 ring-1 ring-slate-800" 
                  : "text-slate-500 hover:bg-slate-100 hover:text-slate-900"
              )}
            >
              <item.icon size={22} className={cn(pathname === item.path ? "text-white" : "group-hover:scale-110 transition-transform duration-300")} />
              {isSidebarOpen && (
                <span className="font-semibold tracking-tight">{item.name}</span>
              )}
            </Link>
          ))}
        </nav>

        <div className="p-4 border-t border-slate-100/50 mb-4">
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3.5 rounded-2xl text-slate-500 hover:bg-rose-50 hover:text-rose-600 transition-all duration-300 group"
          >
            <LogOut size={22} className="group-hover:-translate-x-1 transition-transform" />
            {isSidebarOpen && <span className="font-semibold tracking-tight">Sair da Console</span>}
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10">
        <header className="h-20 bg-white/60 backdrop-blur-md border-b border-slate-200/50 flex items-center justify-between px-10 sticky top-0 z-40 shadow-sm shadow-slate-100/50">
          <div className="flex items-center gap-6">
            <button 
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2.5 hover:bg-slate-200/50 rounded-xl text-slate-600 transition-colors border border-slate-200/50 shadow-sm"
            >
              {isSidebarOpen ? <X size={18} /> : <Menu size={18} />}
            </button>
            <div className="h-8 w-[1px] bg-slate-200/60" />
            <h2 className="text-xl font-extrabold text-slate-800 tracking-tight">
              {menuItems.find(i => i.path === pathname)?.name || 'Central de Atendimento'}
            </h2>
          </div>

          <div className="flex items-center gap-4 pl-6 border-l border-slate-200/60">
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-slate-900 leading-none mb-1">
                {user?.email?.split('@')[0]}
              </p>
              <p className="text-[10px] font-extrabold text-blue-600 uppercase tracking-widest bg-blue-50 px-2 py-0.5 rounded-md border border-blue-100">
                {role}
              </p>
            </div>
            <div className="h-11 w-11 rounded-2xl bg-gradient-to-tr from-slate-100 to-white shadow-inner flex items-center justify-center text-slate-600 border border-slate-200/50 hover:shadow-md transition-shadow group cursor-pointer">
              <UserCircle size={24} className="group-hover:scale-110 transition-transform" />
            </div>
          </div>
        </header>

        <div className="flex-1 p-10 overflow-auto scrollbar-hide">
          <AnimatePresence mode="wait">
            <motion.div
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.4, ease: "easeOut" }}
              key={pathname}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
