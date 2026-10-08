import { after } from "next/server";
import { researchApiActor, researchApiError } from "@/server/research/api";
import { startTopicOpportunityV2 } from "@/server/research/topic-opportunity-v2-service";
import { executeResearchRun } from "@/server/research/service";

export const maxDuration = 900;
export async function POST(request: Request, route: { params: Promise<{ stableKey: string }> }) {
  try {
    const actor = await researchApiActor(); const { stableKey } = await route.params;
    const result = await startTopicOpportunityV2(actor, stableKey, await request.json());
    if (result.created) after(() => executeResearchRun(actor, result.sessionId, result.runId));
    return Response.json(result, { status: result.unchanged ? 200 : 202 });
  } catch (error) { return researchApiError(error); }
}
