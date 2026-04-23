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
  Sun,
  Moon,
} from 'lucide-react'
import { createClient } from '@/lib/supabase/client'
import { motion, AnimatePresence } from 'framer-motion'
import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'
import Image from 'next/image'
import { useTheme } from '@/components/ThemeProvider'

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
  const { theme, toggle } = useTheme()

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

  const menuItems = [
    { name: 'Dashboard', icon: LayoutDashboard, path: '/dashboard' },
    { name: 'Métricas', icon: BarChart3, path: '/analytics/feedback' },
    { name: 'Equipe', icon: Users, path: '/admin/agents' },
  ]

  const handleLogout = async () => {
    await supabase.auth.signOut()
    router.push('/login')
  }

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 flex relative overflow-hidden transition-colors duration-300">
      {/* Background blobs */}
      <div className="absolute top-0 -left-4 w-96 h-96 bg-blue-100/40 dark:bg-blue-900/10 rounded-full blur-3xl opacity-60 animate-pulse pointer-events-none" />
      <div className="absolute bottom-0 right-0 w-[500px] h-[500px] bg-indigo-50/40 dark:bg-indigo-900/10 rounded-full blur-3xl opacity-80 pointer-events-none" />

      {/* ── SIDEBAR ── */}
      <aside
        className={cn(
          'bg-white/80 dark:bg-slate-900/80 backdrop-blur-xl border-r border-slate-200/50 dark:border-slate-700/50 transition-all duration-500 ease-in-out flex flex-col z-50 relative',
          isSidebarOpen ? 'w-64' : 'w-20'
        )}
      >
        {/* Logo */}
        <div className="h-20 flex items-center px-5 border-b border-slate-100/50 dark:border-slate-700/50 justify-center bg-white/50 dark:bg-slate-900/50">
          <div className="relative h-12 w-full flex-shrink-0 transition-transform duration-300 hover:scale-105">
            <Image
              src="/brand/logo.png"
              alt="Artificiall"
              fill
              className="object-contain"
              priority
            />
          </div>
        </div>

        {/* Nav */}
        <nav className="flex-1 py-6 px-3 space-y-2">
          {menuItems.map((item) => (
            <Link
              key={item.path}
              href={item.path}
              className={cn(
                'group flex items-center gap-3 px-4 py-3 rounded-2xl transition-all duration-300',
                pathname === item.path
                  ? 'bg-slate-900 dark:bg-blue-600 text-white shadow-lg'
                  : 'text-slate-500 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 hover:text-slate-900 dark:hover:text-white'
              )}
            >
              <item.icon
                size={21}
                className={cn(
                  pathname !== item.path && 'group-hover:scale-110 transition-transform duration-300'
                )}
              />
              {isSidebarOpen && (
                <span className="font-semibold tracking-tight text-sm">{item.name}</span>
              )}
            </Link>
          ))}
        </nav>

        {/* Logout */}
        <div className="p-3 border-t border-slate-100/50 dark:border-slate-700/50 mb-3">
          <button
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-3 rounded-2xl text-slate-500 dark:text-slate-400 hover:bg-rose-50 dark:hover:bg-rose-900/20 hover:text-rose-600 dark:hover:text-rose-400 transition-all duration-300 group"
          >
            <LogOut size={21} className="group-hover:-translate-x-1 transition-transform" />
            {isSidebarOpen && <span className="font-semibold tracking-tight text-sm">Sair</span>}
          </button>
        </div>
      </aside>

      {/* ── MAIN CONTENT ── */}
      <main className="flex-1 flex flex-col min-w-0 relative z-10">
        {/* Header */}
        <header className="h-16 bg-white/70 dark:bg-slate-900/70 backdrop-blur-md border-b border-slate-200/50 dark:border-slate-700/50 flex items-center justify-between px-6 sticky top-0 z-40 shadow-sm shadow-slate-100/50 dark:shadow-slate-900/50">
          <div className="flex items-center gap-4">
            <button
              onClick={() => setIsSidebarOpen(!isSidebarOpen)}
              className="p-2 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl text-slate-600 dark:text-slate-400 transition-colors border border-slate-200/60 dark:border-slate-700/60"
            >
              {isSidebarOpen ? <X size={17} /> : <Menu size={17} />}
            </button>
            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />
            <h2 className="text-lg font-extrabold text-slate-800 dark:text-slate-100 tracking-tight">
              {menuItems.find((i) => i.path === pathname)?.name || 'Central de Atendimento'}
            </h2>
          </div>

          <div className="flex items-center gap-3">
            {/* Dark mode toggle */}
            <button
              onClick={toggle}
              aria-label="Alternar modo escuro"
              className="p-2 rounded-xl hover:bg-slate-100 dark:hover:bg-slate-800 text-slate-500 dark:text-slate-400 transition-colors border border-slate-200/60 dark:border-slate-700/60"
            >
              {theme === 'dark' ? <Sun size={17} /> : <Moon size={17} />}
            </button>

            <div className="h-6 w-px bg-slate-200 dark:bg-slate-700" />

            {/* User info */}
            <div className="text-right hidden sm:block">
              <p className="text-sm font-bold text-slate-900 dark:text-slate-100 leading-none mb-1">
                {user?.email?.split('@')[0]}
              </p>
              <p className="text-[10px] font-extrabold text-blue-600 dark:text-blue-400 uppercase tracking-widest bg-blue-50 dark:bg-blue-900/30 px-2 py-0.5 rounded-md border border-blue-100 dark:border-blue-800/50">
                {role}
              </p>
            </div>
            <div className="h-9 w-9 rounded-xl bg-gradient-to-tr from-slate-100 dark:from-slate-800 to-white dark:to-slate-700 shadow-inner flex items-center justify-center text-slate-600 dark:text-slate-300 border border-slate-200/50 dark:border-slate-600/50 hover:shadow-md transition-shadow cursor-pointer">
              <UserCircle size={22} />
            </div>
          </div>
        </header>

        {/* Page content */}
        <div className="flex-1 p-8 overflow-auto">
          <AnimatePresence mode="wait">
            <motion.div
              key={pathname}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.35, ease: 'easeOut' }}
            >
              {children}
            </motion.div>
          </AnimatePresence>
        </div>
      </main>
    </div>
  )
}
