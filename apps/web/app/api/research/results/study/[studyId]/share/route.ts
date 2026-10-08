import { z } from "zod";
import { researchSelectionSchema } from "@/server/research/contracts";
import { researchApiActor, researchApiError } from "@/server/research/api";
import { shareLegacyStudyToProject } from "@/server/research/sharing";
const body = z.object({ projectId: z.string().min(1).max(200), selection: researchSelectionSchema.optional() }).strict();
export async function POST(request: Request, { params }: { params: Promise<{ studyId: string }> }) {
  try { const { studyId } = await params; const { projectId, selection } = body.parse(await request.json()); return Response.json(await shareLegacyStudyToProject(await researchApiActor(), studyId, projectId, selection), { status: 201 }); }
  catch (error) { return researchApiError(error); }
}
