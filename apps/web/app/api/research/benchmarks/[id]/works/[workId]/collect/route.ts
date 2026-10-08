import { researchApiActor, researchApiError } from "@/server/research/api";
import { collectWorkSourceForResearch } from "@/server/research/work-research-service";
import { ResearchError } from "@/server/research/access";
import { discoveryApiError } from "@/server/discovery/api";

export async function POST(_request: Request, route: { params: Promise<{ id: string; workId: string }> }) {
  try {
    const actor = await researchApiActor(); const { id, workId } = await route.params;
    const result = await collectWorkSourceForResearch(actor, id, workId);
    return Response.json(result, { status: result.created ? 202 : 200 });
  } catch (error) { return error instanceof ResearchError ? researchApiError(error) : discoveryApiError(error); }
}
