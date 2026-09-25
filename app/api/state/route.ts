import { proxyCrewAI } from '@/lib/crewai'
export async function GET() { return proxyCrewAI('/state') }
