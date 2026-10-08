import { z } from "zod";
import { researchApiActor, researchApiError } from "@/server/research/api";
import { prepareWorkCreation } from "@/server/research/work-research-service";

const schema = z.object({ projectId: z.string().min(1).max(200), materialIds: z.array(z.string().min(1).max(200)).max(8) }).strict();

export async function POST(request: Request, route: { params: Promise<{ id: string; workId: string; runId: string }> }) {
  try {
    const actor = await researchApiActor(); const { id, workId, runId } = await route.params;
    const input = schema.parse(await request.json().catch(() => null));
    return Response.json(await prepareWorkCreation(actor, id, workId, runId, input));
  } catch (error) { return researchApiError(error); }
}
