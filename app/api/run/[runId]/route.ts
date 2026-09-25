import { proxyCrewAI } from '@/lib/crewai'
export async function GET(_: Request, context: { params: { runId: string } }) { return proxyCrewAI(`/runs/${context.params.runId}`) }
