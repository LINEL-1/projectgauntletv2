import { NextResponse } from "next/server";

export async function crewAiRequest(path: string, init: RequestInit = {}) {
  const baseUrl = process.env.CREWAI_BASE_URL;
  const apiKey = process.env.CREWAI_API_KEY;
  const flowId = process.env.CREWAI_FLOW_ID;

  if (!baseUrl || !apiKey || !flowId) {
    return NextResponse.json({ error: "CrewAI environment variables are not configured." }, { status: 503 });
  }

  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${apiKey}`);

  let response: Response;
  try {
    response = await fetch(
      `${baseUrl.replace(/\/$/, "")}/flows/${encodeURIComponent(flowId)}${path}`,
      { ...init, headers, cache: "no-store" },
    );
  } catch {
    return NextResponse.json(
      { error: "Could not reach CrewAI. Check CREWAI_BASE_URL and your network connection." },
      { status: 502 },
    );
  }

  const body = await response.text();
  if (!body.trim()) {
    return NextResponse.json(
      { error: `CrewAI returned an empty response (HTTP ${response.status}). Check the API key, flow ID, and endpoint.` },
      { status: response.ok ? 502 : response.status },
    );
  }

  try {
    return NextResponse.json(JSON.parse(body), { status: response.status });
  } catch {
    const contentType = response.headers.get("content-type") || "unknown content type";
    return NextResponse.json(
      { error: `CrewAI returned a non-JSON response (HTTP ${response.status}, ${contentType}). Check API access, CREWAI_BASE_URL, and CREWAI_FLOW_ID.` },
      { status: response.ok ? 502 : response.status },
    );
  }
}
