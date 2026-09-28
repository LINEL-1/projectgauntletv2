import { NextResponse } from "next/server";
import { crewAiRequest } from "@/lib/crewai";

export async function POST(request: Request) {
  let body: Record<string, unknown>;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The kickoff request body must be valid JSON." }, { status: 400 });
  }

  if (typeof body !== "object" || body === null || Array.isArray(body)) {
    return NextResponse.json({ error: "The kickoff request body must be a JSON object." }, { status: 400 });
  }

  const requiredInputs = [
    "checkin_weekday_1",
    "checkin_weekday_2",
    "end_date",
    "starting_capital",
    "investment_mandate",
    "start_date",
  ];
  const missing = requiredInputs.filter((key) => body[key] === undefined || body[key] === "");
  if (missing.length) {
    return NextResponse.json({ error: `Missing required flow inputs: ${missing.join(", ")}.` }, { status: 400 });
  }

  const kickoffInputs: Record<string, unknown> = Object.fromEntries(
    requiredInputs.map((key) => [key, body[key]]),
  );
  if (typeof body.human_input === "string" && body.human_input.trim()) {
    kickoffInputs.human_input = body.human_input;
  }

  const response = await crewAiRequest("/kickoff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(kickoffInputs),
  });
  const data = await response.json();
  if (!response.ok) {
    const message = [data?.error, data?.message, data?.detail, data?.result]
      .find((value) => typeof value === "string" && value.trim());
    const detail = typeof message === "string" ? message : JSON.stringify(data).slice(0, 500);
    return NextResponse.json(
      { error: `CrewAI kickoff failed (HTTP ${response.status})${detail ? `: ${detail}` : "."}` },
      { status: response.status },
    );
  }

  const runId = data?.kickoff_id || data?.run_id;
  if (!runId) {
    return NextResponse.json({ error: "CrewAI accepted the request but did not return a kickoff_id." }, { status: 502 });
  }

  return NextResponse.json({ ...data, run_id: runId }, { status: response.status });
}