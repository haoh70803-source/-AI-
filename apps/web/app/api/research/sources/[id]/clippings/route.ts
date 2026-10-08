import { researchApiActor, researchApiError } from "@/server/research/api";
import { saveResearchClipping } from "@/server/research/service";
export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  try { const actor = await researchApiActor(), { id } = await route.params; return Response.json(await saveResearchClipping(actor, id, await request.json())); }
  catch (cause) { return researchApiError(cause); }
}
