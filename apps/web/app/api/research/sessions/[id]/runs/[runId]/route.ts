import { researchApiActor, researchApiError } from "@/server/research/api";
import { getResearchRunStatus, saveResearchResult } from "@/server/research/service";
type Route = { params: Promise<{ id: string; runId: string }> };
export async function GET(_request: Request, route: Route) { try { const { id, runId } = await route.params; return Response.json(await getResearchRunStatus(await researchApiActor(), id, runId)); } catch (error) { return researchApiError(error); } }
export async function POST(_request: Request, route: Route) { try { const { id, runId } = await route.params; return Response.json(await saveResearchResult(await researchApiActor(), id, runId)); } catch (error) { return researchApiError(error); } }
