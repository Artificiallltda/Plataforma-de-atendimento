/**
 * Script para criar/recriar usuários do PAA no Supabase Auth.
 * 
 * Uso: npx tsx scripts/setup-users.ts
 * 
 * Requer: SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY no .env
 */

import { createClient } from '@supabase/supabase-js'
import * as dotenv from 'dotenv'

dotenv.config()

const SUPABASE_URL = process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL
const SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY

if (!SUPABASE_URL || !SERVICE_ROLE_KEY) {
  console.error('❌ SUPABASE_URL e SUPABASE_SERVICE_ROLE_KEY são obrigatórios.')
  console.error('Configure o .env com essas variáveis antes de rodar.')
  process.exit(1)
}

// Admin client com service role (bypassa RLS)
const supabase = createClient(SUPABASE_URL, SERVICE_ROLE_KEY, {
  auth: { autoRefreshToken: false, persistSession: false }
})

const USERS = [
  {
    email: 'ceo@artificiall.ai',
    password: 'Artificiall@2026!',
    name: 'CEO Artificiall',
    sector: 'supervisor',
  },
  {
    email: 'ana@artificiall.com',
    password: 'Artificiall@2026!',
    name: 'Ana - Supervisora',
    sector: 'supervisor',
  },
  {
    email: 'joao@artificiall.com',
    password: 'Artificiall@2026!',
    name: 'João - Suporte',
    sector: 'suporte',
  },
  {
    email: 'maria@artificiall.com',
    password: 'Artificiall@2026!',
    name: 'Maria - Financeiro',
    sector: 'financeiro',
  },
]

async function createUsers() {
  console.log('🚀 Iniciando criação de usuários no Supabase Auth...\n')

  for (const user of USERS) {
    try {
      // 1. Criar/atualizar no Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.admin.createUser({
        email: user.email,
        password: user.password,
        email_confirm: true, // confirma email automaticamente (sem verificação)
      })

      if (authError) {
        // Se já existe, apenas atualiza a senha
        if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
          // Busca o user existente para pegar o ID
          const { data: listData } = await supabase.auth.admin.listUsers()
          const existingUser = listData?.users.find(u => u.email === user.email)
          
          if (existingUser) {
            await supabase.auth.admin.updateUserById(existingUser.id, {
              password: user.password,
              email_confirm: true,
            })
            console.log(`  ✅ ${user.email} → senha atualizada`)
          }
        } else {
          console.error(`  ❌ ${user.email} → Erro Auth: ${authError.message}`)
          continue
        }
      } else {
        console.log(`  ✅ ${user.email} → criado no Auth (id: ${authData.user?.id})`)
      }

      // 2. Garantir que existe na tabela agents
      const { error: agentError } = await supabase
        .from('agents')
        .upsert(
          { email: user.email, name: user.name, sector: user.sector, isOnline: true },
          { onConflict: 'email' }
        )

      if (agentError) {
        console.warn(`  ⚠️  ${user.email} → Erro agents: ${agentError.message}`)
      } else {
        console.log(`  ✅ ${user.email} → registrado na tabela agents (${user.sector})`)
      }

      console.log()
    } catch (err: any) {
      console.error(`  💥 ${user.email} → Erro inesperado: ${err.message}`)
    }
  }

  console.log('─'.repeat(50))
  console.log('✅ Script concluído!\n')
  console.log('📋 Credenciais de acesso ao Dashboard:')
  console.log('─'.repeat(50))
  for (const user of USERS) {
    console.log(`  ${user.sector.padEnd(12)} │ ${user.email.padEnd(28)} │ ${user.password}`)
  }
  console.log('─'.repeat(50))
  console.log('\n🔗 URL: https://plataformadeatendimentoartificiall.up.railway.app/login')
}

createUsers()
