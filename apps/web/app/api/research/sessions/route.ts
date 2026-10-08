import { researchApiActor, researchApiError } from "@/server/research/api";
import { createResearchSession, listResearchSessions } from "@/server/research/service";
export async function GET() { try { return Response.json({ items: await listResearchSessions(await researchApiActor()) }); } catch (error) { return researchApiError(error); } }
export async function POST(request: Request) { try { return Response.json(await createResearchSession(await researchApiActor(), await request.json()), { status: 201 }); } catch (error) { return researchApiError(error); } }
