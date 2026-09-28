import { NextResponse } from "next/server";

export async function GET(_request: Request, { params }: { params: { runId: string } }) {
  const baseUrl = process.env.CREWAI_BASE_URL;
  const apiKey = process.env.CREWAI_API_KEY;
  const flowId = process.env.CREWAI_FLOW_ID;
  if (!baseUrl || !apiKey || !flowId) return NextResponse.json({ error: "CrewAI environment variables are not configured." }, { status: 503 });
  const response = await fetch(`${baseUrl}/flows/${flowId}/runs/${params.runId}`, { headers: { Authorization: `Bearer ${apiKey}` }, cache: "no-store" });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}