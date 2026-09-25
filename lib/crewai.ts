import { NextResponse } from 'next/server'

const base = process.env.CREWAI_BASE_URL
const flow = process.env.CREWAI_FLOW_ID
const key = process.env.CREWAI_API_KEY

export async function proxyCrewAI(path: string, init?: RequestInit) {
  if (!base || !flow || !key) return NextResponse.json({ error: 'CrewAI environment variables are not configured.' }, { status: 500 })
  try {
    const response = await fetch(`${base}/flows/${flow}${path}`, { ...init, headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', ...(init?.headers || {}) }, cache: 'no-store' })
    const data = await response.json().catch(() => ({}))
    return NextResponse.json(data, { status: response.status })
  } catch (error) { return NextResponse.json({ error: error instanceof Error ? error.message : 'CrewAI request failed' }, { status: 502 }) }
}
