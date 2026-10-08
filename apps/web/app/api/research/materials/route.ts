import { researchApiActor, researchApiError } from "@/server/research/api";
import { listResearchMaterials } from "@/server/research/service";
export async function GET(request: Request) { try { return Response.json({ items: await listResearchMaterials(await researchApiActor(), new URL(request.url).searchParams.get("q") ?? "") }); } catch (error) { return researchApiError(error); } }
