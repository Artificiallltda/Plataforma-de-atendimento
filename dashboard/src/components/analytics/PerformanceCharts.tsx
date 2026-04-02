'use client'

import React from 'react'
import { 
  AreaChart, 
  Area, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar,
  Cell,
  Legend
} from 'recharts'
import { motion } from 'framer-motion'

const data = [
  { name: 'Seg', tickets: 400, bot: 240 },
  { name: 'Ter', tickets: 300, bot: 139 },
  { name: 'Qua', tickets: 200, bot: 980 },
  { name: 'Qui', tickets: 278, bot: 390 },
  { name: 'Sex', tickets: 189, bot: 480 },
  { name: 'Sab', tickets: 239, bot: 380 },
  { name: 'Dom', tickets: 349, bot: 430 },
]

const COLORS = ['#3b82f6', '#8b5cf6', '#10b981', '#f59e0b']

export function PerformanceCharts() {
  return (
    <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
      {/* Volume Chart */}
      <motion.div 
        initial={{ opacity: 0, x: -20 }}
        animate={{ opacity: 1, x: 0 }}
        className="glass-card p-8"
      >
        <div className="flex justify-between items-center mb-8">
          <div>
            <h4 className="font-bold text-slate-800 text-lg">Volume de Atendimentos</h4>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Últimos 7 dias</p>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold uppercase tracking-tight">
            <div className="flex items-center gap-1.5 text-blue-500">
              <div className="h-2 w-2 rounded-full bg-blue-500" /> Humano
            </div>
            <div className="flex items-center gap-1.5 text-purple-500">
              <div className="h-2 w-2 rounded-full bg-purple-500" /> Bot
            </div>
          </div>
        </div>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={data}>
              <defs>
                <linearGradient id="colorTickets" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#3b82f6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#3b82f6" stopOpacity={0}/>
                </linearGradient>
                <linearGradient id="colorBot" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#8b5cf6" stopOpacity={0.3}/>
                  <stop offset="95%" stopColor="#8b5cf6" stopOpacity={0}/>
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }}
                dy={10}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }}
              />
              <Tooltip 
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Area type="monotone" dataKey="tickets" stroke="#3b82f6" strokeWidth={3} fillOpacity={1} fill="url(#colorTickets)" />
              <Area type="monotone" dataKey="bot" stroke="#8b5cf6" strokeWidth={3} fillOpacity={1} fill="url(#colorBot)" />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </motion.div>

      {/* CSAT Distribution */}
      <motion.div 
        initial={{ opacity: 0, x: 20 }}
        animate={{ opacity: 1, x: 0 }}
        className="glass-card p-8"
      >
        <div className="flex justify-between items-center mb-8">
          <div>
            <h4 className="font-bold text-slate-800 text-lg">Distribuição CSAT</h4>
            <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">Satisfação do Cliente</p>
          </div>
        </div>

        <div className="h-[300px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <BarChart data={[
              { name: '5 ⭐', count: 120 },
              { name: '4 ⭐', count: 80 },
              { name: '3 ⭐', count: 30 },
              { name: '2 ⭐', count: 10 },
              { name: '1 ⭐', count: 5 },
            ]}>
              <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#E2E8F0" />
              <XAxis 
                dataKey="name" 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }}
              />
              <YAxis 
                axisLine={false} 
                tickLine={false} 
                tick={{ fontSize: 12, fill: '#94a3b8', fontWeight: 600 }}
              />
              <Tooltip 
                cursor={{ fill: 'transparent' }}
                contentStyle={{ borderRadius: '16px', border: 'none', boxShadow: '0 10px 15px -3px rgb(0 0 0 / 0.1)' }}
              />
              <Bar dataKey="count" radius={[10, 10, 0, 0]}>
                {[1, 2, 3, 4, 5].map((entry, index) => (
                  <Cell key={`cell-${index}`} fill={COLORS[index % COLORS.length]} />
                ))}
              </Bar>
            </BarChart>
          </ResponsiveContainer>
        </div>
      </motion.div>
    </div>
  )
}
