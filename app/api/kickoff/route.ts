import { proxyCrewAI } from '@/lib/crewai'
export async function POST(request: Request) { return proxyCrewAI('/kickoff', { method: 'POST', body: JSON.stringify(await request.json()) }) }
