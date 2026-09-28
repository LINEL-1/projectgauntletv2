import { NextResponse } from "next/server";
import { crewAiRequest } from "@/lib/crewai";

export async function GET(_request: Request, { params }: { params: { runId: string } }) {
  const response = await crewAiRequest(`/status/${encodeURIComponent(params.runId)}`);
  const data = await response.json();
  if (!response.ok) return NextResponse.json(data, { status: response.status });

  const executionState = String(data.state || data.status || "").toLowerCase();
  const status = ["success", "completed"].includes(executionState)
    ? "completed"
    : ["failed", "error", "revoked"].includes(executionState)
      ? "failed"
      : "running";

  return NextResponse.json({
    ...data,
    status,
    result: data.result ?? data.result_json ?? null,
    outputs: data.outputs || data.result_json?.outputs || {},
    error: data.error || (status === "failed" ? data.status : undefined),
  });
}