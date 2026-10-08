import { after } from "next/server";
import { researchApiActor, researchApiError } from "@/server/research/api";
import { startFocusV2Research } from "@/server/research/focus-v2-service";
import { executeResearchRun } from "@/server/research/service";

export const maxDuration = 900;
export async function POST(request: Request) {
  try { const actor = await researchApiActor();
    const result = await startFocusV2Research(actor, await request.json());
    if (result.created) after(() => executeResearchRun(actor, result.sessionId, result.runId));
    return Response.json(result, { status: result.unchanged ? 200 : 202 });
  } catch (error) { return researchApiError(error); }
}
