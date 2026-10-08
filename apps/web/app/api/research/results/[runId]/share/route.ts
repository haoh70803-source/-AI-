import { z } from "zod";
import { researchSelectionSchema } from "@/server/research/contracts";
import { researchApiActor, researchApiError } from "@/server/research/api";
import { shareResearchRunToProject } from "@/server/research/sharing";
const body = z.object({ projectId: z.string().min(1).max(200), selection: researchSelectionSchema.optional() }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try { const { runId } = await params; const { projectId, selection } = body.parse(await request.json()); return Response.json(await shareResearchRunToProject(await researchApiActor(), runId, projectId, selection), { status: 201 }); }
  catch (error) { return researchApiError(error); }
}
