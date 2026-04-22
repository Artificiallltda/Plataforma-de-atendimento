import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

/**
 * GET /auth/callback
 *
 * Rota de callback do Supabase Auth (PKCE flow).
 * Troca o `code` recebido no link de email por uma sessão válida,
 * depois redireciona para a página correta:
 *  - Recuperação de senha → /auth/reset-password
 *  - Login social/magic link → /dashboard
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url)
  const code = searchParams.get('code')
  const next = searchParams.get('next') ?? '/dashboard'

  if (code) {
    const cookieStore = cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      {
        cookies: {
          getAll() {
            return cookieStore.getAll()
          },
          setAll(cookiesToSet) {
            cookiesToSet.forEach(({ name, value, options }) =>
              cookieStore.set(name, value, options)
            )
          },
        },
      }
    )

    const { error } = await supabase.auth.exchangeCodeForSession(code)

    if (!error) {
      // Código trocado com sucesso → redireciona
      return NextResponse.redirect(`${origin}${next}`)
    }
  }

  // Código inválido ou ausente → volta ao login com erro
  return NextResponse.redirect(`${origin}/login?error=auth_callback_failed`)
}
