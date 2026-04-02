import { NextResponse } from 'next/server'

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000'

    const response = await fetch(`${backendUrl}/admin/register-agent`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    console.error('Erro na API Route de admin:', error)
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}

export async function DELETE(request: Request) {
  try {
    const { searchParams } = new URL(request.url)
    const id = searchParams.get('id')
    const backendUrl = process.env.BACKEND_URL || 'http://localhost:3000'

    if (!id) return NextResponse.json({ error: 'ID não fornecido' }, { status: 400 })

    const response = await fetch(`${backendUrl}/admin/delete-agent/${id}`, {
      method: 'DELETE'
    })

    const data = await response.json()
    return NextResponse.json(data, { status: response.status })
  } catch (error) {
    return NextResponse.json({ error: 'Erro interno no servidor' }, { status: 500 })
  }
}
