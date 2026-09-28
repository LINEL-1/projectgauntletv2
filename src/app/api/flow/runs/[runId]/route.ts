import { crewAiRequest } from "@/lib/crewai";

export async function GET(_request: Request, { params }: { params: { runId: string } }) {
  return crewAiRequest(`/runs/${encodeURIComponent(params.runId)}`);
}