import { researchApiActor, researchApiError } from "@/server/research/api";
import { getResearchSession } from "@/server/research/service";
export async function GET(request: Request, route: { params: Promise<{ id: string }> }) {
  try { const before = Number(new URL(request.url).searchParams.get("before")); return Response.json(await getResearchSession(await researchApiActor(), (await route.params).id, Number.isSafeInteger(before) && before > 0 ? before : undefined)); } catch (error) { return researchApiError(error); }
}
