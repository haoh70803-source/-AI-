import { after } from "next/server";
import { researchApiActor, researchApiError } from "@/server/research/api";
import { startAccountV2Research } from "@/server/research/account-v2-service";
import { executeResearchRun } from "@/server/research/service";

export const maxDuration = 900;
export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  try {
    const actor = await researchApiActor(); const { id } = await route.params;
    const result = await startAccountV2Research(actor, id, await request.json());
    if (result.created) after(() => executeResearchRun(actor, result.sessionId, result.runId));
    return Response.json(result, { status: result.unchanged ? 200 : 202 });
  } catch (error) { return researchApiError(error); }
}
