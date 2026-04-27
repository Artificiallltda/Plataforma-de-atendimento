'use client'

import React, { useState } from 'react'
import { 
  X, 
  UserPlus, 
  Mail, 
  Shield, 
  Loader2,
  CheckCircle2,
  AlertCircle
} from 'lucide-react'
import { motion, AnimatePresence } from 'framer-motion'

interface AddAgentModalProps {
  isOpen: boolean
  onClose: () => void
  onSuccess: () => void
}

export function AddAgentModal({ isOpen, onClose, onSuccess }: AddAgentModalProps) {
  const [formData, setFormData] = useState({
    name: '',
    email: '',
    sector: 'suporte'
  })
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [success, setSuccess] = useState(false)
  const [tempPassword, setTempPassword] = useState<string | null>(null)
  const [copied, setCopied] = useState(false)

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)
    setError(null)

    try {
      // Backend gera senha aleatória forte e devolve em `temporary_password`
      const response = await fetch('/api/admin/register-agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(formData)
      })

      const data = await response.json()

      if (!response.ok) {
        throw new Error(data.error || 'Erro ao registrar atendente')
      }

      setTempPassword(data.temporary_password || null)
      setSuccess(true)
    } catch (err: any) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    onSuccess()
    onClose()
    setSuccess(false)
    setTempPassword(null)
    setCopied(false)
    setFormData({ name: '', email: '', sector: 'suporte' })
  }

  const copyCredentials = async () => {
    if (!tempPassword) return
    const text = `Email: ${formData.email}\nSenha temporária: ${tempPassword}\n\nAcesse: ${window.location.origin}/login\nNo primeiro acesso, troque a senha em "Esqueci minha senha".`
    try {
      await navigator.clipboard.writeText(text)
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    } catch {
      setError('Não foi possível copiar — selecione e copie manualmente.')
    }
  }

  return (
    <AnimatePresence>
      {isOpen && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center p-4">
          {/* Overlay */}
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={onClose}
            className="absolute inset-0 bg-slate-900/40 backdrop-blur-sm"
          />

          {/* Modal */}
          <motion.div
            initial={{ opacity: 0, scale: 0.95, y: 20 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            exit={{ opacity: 0, scale: 0.95, y: 20 }}
            className="relative bg-white rounded-3xl shadow-2xl w-full max-w-md overflow-hidden"
          >
            {/* Header */}
            <div className="premium-gradient p-8 text-white relative">
              <button 
                onClick={onClose}
                className="absolute top-6 right-6 p-2 hover:bg-white/20 rounded-full transition-colors"
                disabled={loading}
              >
                <X size={20} />
              </button>
              <div className="h-14 w-14 bg-white/20 backdrop-blur-md rounded-2xl flex items-center justify-center mb-4">
                <UserPlus size={28} />
              </div>
              <h3 className="text-2xl font-bold tracking-tight">Novo Atendente</h3>
              <p className="text-white/80 text-sm">Cadastre um novo membro na equipe Artificiall</p>
            </div>

            {/* Body */}
            <div className="p-8">
              {success ? (
                <motion.div
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="py-6 text-center"
                >
                  <div className="h-16 w-16 bg-emerald-100 text-emerald-600 rounded-full flex items-center justify-center mx-auto mb-4">
                    <CheckCircle2 size={32} />
                  </div>
                  <h4 className="text-xl font-bold text-slate-800 mb-2">Atendente criado!</h4>
                  <p className="text-slate-500 text-sm mb-4">
                    Copie as credenciais abaixo e envie para o atendente em canal seguro.
                  </p>

                  {tempPassword && (
                    <div className="bg-slate-50 border border-slate-200 rounded-2xl p-4 text-left space-y-2 mb-4">
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase">Email</p>
                        <p className="text-sm font-mono text-slate-800 break-all">{formData.email}</p>
                      </div>
                      <div>
                        <p className="text-xs font-bold text-slate-400 uppercase">Senha temporária</p>
                        <p className="text-sm font-mono text-slate-800 select-all">{tempPassword}</p>
                      </div>
                    </div>
                  )}

                  <div className="flex flex-col gap-2">
                    <button
                      type="button"
                      onClick={copyCredentials}
                      disabled={!tempPassword}
                      className="w-full py-3 bg-blue-600 hover:bg-blue-500 text-white font-bold rounded-2xl transition-colors disabled:opacity-50"
                    >
                      {copied ? 'Copiado!' : 'Copiar credenciais'}
                    </button>
                    <button
                      type="button"
                      onClick={handleClose}
                      className="w-full py-3 border border-slate-200 text-slate-600 hover:bg-slate-50 font-bold rounded-2xl transition-colors"
                    >
                      Fechar
                    </button>
                  </div>

                  <p className="text-xs text-slate-400 mt-3">
                    Recomende ao atendente trocar a senha em "Esqueci minha senha".
                  </p>
                </motion.div>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-5">
                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700 ml-1">Nome Completo</label>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                        <UserPlus size={18} />
                      </div>
                      <input
                        required
                        type="text"
                        value={formData.name}
                        onChange={e => setFormData({...formData, name: e.target.value})}
                        placeholder="Ex: João Silva"
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700 ml-1">E-mail Corporativo</label>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                        <Mail size={18} />
                      </div>
                      <input
                        required
                        type="email"
                        value={formData.email}
                        onChange={e => setFormData({...formData, email: e.target.value})}
                        placeholder="atendente@artificiall.ai"
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all placeholder:text-slate-400"
                      />
                    </div>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-sm font-bold text-slate-700 ml-1">Setor de Atuação</label>
                    <div className="relative group">
                      <div className="absolute left-4 top-1/2 -translate-y-1/2 text-slate-400 group-focus-within:text-blue-500 transition-colors">
                        <Shield size={18} />
                      </div>
                      <select
                        required
                        value={formData.sector}
                        onChange={e => setFormData({...formData, sector: e.target.value})}
                        className="w-full pl-12 pr-4 py-3 bg-slate-50 border border-slate-200 rounded-2xl focus:ring-4 focus:ring-blue-100 focus:border-blue-400 outline-none transition-all appearance-none"
                      >
                        <option value="suporte">Suporte Técnico</option>
                        <option value="financeiro">Financeiro</option>
                        <option value="comercial">Comercial</option>
                        <option value="supervisor">Supervisor</option>
                      </select>
                    </div>
                  </div>

                  {error && (
                    <div className="p-4 bg-rose-50 border border-rose-100 rounded-2xl flex items-center gap-3 text-rose-600 text-sm font-medium">
                      <AlertCircle size={18} />
                      {error}
                    </div>
                  )}

                  <button
                    disabled={loading}
                    type="submit"
                    className="w-full py-4 premium-gradient text-white font-bold rounded-2xl shadow-lg shadow-blue-200 hover:shadow-xl hover:scale-[1.02] active:scale-[0.98] transition-all disabled:opacity-50 disabled:scale-100 flex items-center justify-center gap-2"
                  >
                    {loading ? (
                      <Loader2 size={20} className="animate-spin" />
                    ) : (
                      <>
                        <CheckCircle2 size={20} />
                        Cadastrar Atendente
                      </>
                    )}
                  </button>
                </form>
              )}
            </div>
          </motion.div>
        </div>
      )}
    </AnimatePresence>
  )
}
