import { crewAiRequest } from "@/lib/crewai";

export async function GET() {
  return crewAiRequest("/inputs");
}