import { NextResponse } from "next/server";

export async function POST(request: Request) {
  const baseUrl = process.env.CREWAI_BASE_URL;
  const apiKey = process.env.CREWAI_API_KEY;
  const flowId = process.env.CREWAI_FLOW_ID;
  if (!baseUrl || !apiKey || !flowId) return NextResponse.json({ error: "CrewAI environment variables are not configured." }, { status: 503 });
  const body = await request.json();
  const response = await fetch(`${baseUrl}/flows/${flowId}/kickoff`, { method: "POST", headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" }, body: JSON.stringify(body) });
  const data = await response.json();
  return NextResponse.json(data, { status: response.status });
}