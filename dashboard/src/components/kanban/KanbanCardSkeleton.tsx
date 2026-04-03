'use client'

import React from 'react'
import { motion } from 'framer-motion'

export function KanbanCardSkeleton() {
  return (
    <div className="bg-white/40 backdrop-blur-sm rounded-[28px] p-5 border border-white/40 shadow-sm flex flex-col gap-5 animate-pulse select-none">
      <div className="pl-3">
        {/* Header Skeleton */}
        <div className="flex justify-between items-start mb-4">
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 bg-slate-200/60 rounded-xl" />
            <div className="h-3 w-24 bg-slate-200/60 rounded-lg" />
          </div>
          <div className="h-6 w-16 bg-slate-200/60 rounded-lg" />
        </div>

        {/* Title and Intent Skeleton */}
        <div className="h-6 w-3/4 bg-slate-200/80 rounded-xl mb-2" />
        <div className="h-4 w-full bg-slate-200/40 rounded-lg mb-6" />

        {/* AI & Human Status Skeleton */}
        <div className="flex items-center justify-between pt-4 border-t border-slate-100/50">
          <div className="flex items-center gap-4">
            <div className="h-6 w-6 bg-slate-200/60 rounded-md" />
            <div className="h-6 w-20 bg-slate-200/60 rounded-lg" />
          </div>
          <div className="h-6 w-12 bg-slate-200/60 rounded-lg" />
        </div>
        
        {/* Footer Skeleton */}
        <div className="mt-4 flex items-center justify-between">
          <div className="flex -space-x-2">
            <div className="h-8 w-8 rounded-full bg-slate-200/80 border-2 border-white" />
            <div className="h-8 w-8 rounded-full bg-slate-200/40 border-2 border-white" />
          </div>
          <div className="h-4 w-20 bg-blue-100/40 rounded-lg" />
        </div>
      </div>
    </div>
  )
}
