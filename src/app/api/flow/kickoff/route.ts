import { NextResponse } from "next/server";
import { crewAiRequest } from "@/lib/crewai";

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "The kickoff request body must be valid JSON." }, { status: 400 });
  }

  return crewAiRequest("/kickoff", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}