import { NextResponse } from 'next/server'

/**
 * GET /health
 * Health check endpoint for Railway deployment monitoring.
 * Returns 200 OK so Railway knows the service is alive.
 */
export async function GET() {
  return NextResponse.json(
    {
      status: 'ok',
      service: 'PAA Dashboard',
      timestamp: new Date().toISOString(),
      version: process.env.npm_package_version ?? '1.0.0',
      uptime: Math.floor(process.uptime()),
    },
    { status: 200 }
  )
}
