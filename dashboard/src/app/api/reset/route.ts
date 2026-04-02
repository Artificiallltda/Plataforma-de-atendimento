import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

export async function GET() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL
  const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!supabaseUrl || !supabaseKey) {
    return NextResponse.json({ error: 'Supabase não configurado no Dashboard' }, { status: 500 })
  }

  const supabase = createClient(supabaseUrl, supabaseKey)

  console.log('🧹 Dashboard: Iniciando limpeza total do banco de dados...')

  try {
    // 1. Deletar Mensagens
    const { error: msgErr } = await supabase
      .from('messages')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (msgErr) throw msgErr

    // 2. Deletar Tickets
    const { error: ticketErr } = await supabase
      .from('tickets')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000')

    if (ticketErr) throw ticketErr

    return NextResponse.json({ 
      success: true, 
      message: 'Banco de dados limpo com sucesso!',
      timestamp: new Date().toISOString()
    })
  } catch (error: any) {
    console.error('❌ Erro no reset via Dashboard:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
