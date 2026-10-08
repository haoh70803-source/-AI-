import { after } from "next/server";
import { researchApiActor, researchApiError } from "@/server/research/api";
import { startWorkDeepResearch } from "@/server/research/work-research-service";
import { executeResearchRun } from "@/server/research/service";

export const maxDuration = 900;
export async function POST(request: Request, route: { params: Promise<{ id: string; workId: string }> }) {
  try {
    const actor = await researchApiActor(); const { id, workId } = await route.params;
    const result = await startWorkDeepResearch(actor, id, workId, await request.json());
    if (result.created) after(() => executeResearchRun(actor, result.sessionId, result.runId));
    return Response.json(result, { status: result.unchanged ? 200 : 202 });
  } catch (error) { return researchApiError(error); }
}
