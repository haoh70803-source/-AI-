import { after } from "next/server";
import { researchApiActor, researchApiError } from "@/server/research/api";
import { executeResearchRun, reserveResearchRun } from "@/server/research/service";
export const maxDuration = 900;
export async function POST(request: Request, route: { params: Promise<{ id: string }> }) {
  try { const actor = await researchApiActor(); const { id } = await route.params; const reserved = await reserveResearchRun(actor, id, await request.json()); if (reserved.created) after(() => executeResearchRun(actor, id, reserved.run.id)); return Response.json({ id: reserved.run.id, status: reserved.run.status, created: reserved.created }, { status: 202 }); } catch (error) { return researchApiError(error); }
}
