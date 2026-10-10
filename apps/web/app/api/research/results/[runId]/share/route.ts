import { z } from "zod";
import { researchSelectionSchema } from "@/server/research/contracts";
import { researchApiActor, researchApiError } from "@/server/research/api";
import { buildResearchSharePreview, shareResearchRunToProject } from "@/server/research/sharing";
import { getResearchResult } from "@/server/research/read-model";
const body = z.object({ projectId: z.string().min(1).max(200).optional(), newProject: z.object({ title: z.string().trim().min(1).max(200), clientRequestId: z.uuid() }).strict().optional(), selection: researchSelectionSchema.optional(), expectedVersion: z.number().int().positive().optional() }).strict().refine(value => Boolean(value.projectId) !== Boolean(value.newProject));
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try {
    const { runId } = await params;
    const result = await getResearchResult(await researchApiActor(), runId);
    return Response.json({ ...buildResearchSharePreview(result.resultTitle || result.question, result.blocks), version: result.version }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return researchApiError(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try { const { runId } = await params; const { projectId, newProject, selection, expectedVersion } = body.parse(await request.json()); return Response.json(await shareResearchRunToProject(await researchApiActor(), runId, newProject ?? projectId!, selection, expectedVersion), { status: 201 }); }
  catch (error) { return researchApiError(error); }
}
