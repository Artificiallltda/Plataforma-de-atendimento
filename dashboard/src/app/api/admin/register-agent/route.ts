import { NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

/**
 * Bridge entre Dashboard (Next.js) e backend Fastify.
 *
 * - Verifica que quem chama está autenticado no Supabase (Dashboard logado).
 * - Encaminha a requisição com Bearer ADMIN_API_TOKEN para o backend.
 * - Devolve a resposta do backend (incluindo senha temporária no register).
 *
 * O ADMIN_API_TOKEN é server-side only (sem prefixo NEXT_PUBLIC).
 */

const BACKEND_URL = process.env.BACKEND_URL || process.env.NEXT_PUBLIC_API_URL || 'http://localhost:3000'
const ADMIN_TOKEN = process.env.ADMIN_API_TOKEN || ''

async function requireDashboardSession() {
  const supabase = await createClient()
  const { data: { session } } = await supabase.auth.getSession()
  return !!session
}

function adminHeaders(extra: Record<string, string> = {}) {
  const headers: Record<string, string> = { 'Content-Type': 'application/json', ...extra }
  if (ADMIN_TOKEN) headers['Authorization'] = `Bearer ${ADMIN_TOKEN}`
  return headers
}

export async function POST(request: Request) {
  if (!(await requireDashboardSession())) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  try {
    const body = await request.json()
    const response = await fetch(`${BACKEND_URL}/admin/register-agent`, {
      method: 'POST',
      headers: adminHeaders(),
      body: JSON.stringify(body),
    })
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Erro na API Route de admin (register):', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  if (!(await requireDashboardSession())) {
    return NextResponse.json({ error: 'Não autenticado' }, { status: 401 })
  }

  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'ID não fornecido' }, { status: 400 })

    const response = await fetch(`${BACKEND_URL}/admin/delete-agent/${id}`, {
      method: 'DELETE',
      headers: adminHeaders(),
    })
    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Erro na API Route de admin (delete):', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}
