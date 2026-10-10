import { researchApiActor, researchApiError } from "@/server/research/api";
import { deleteTeardownHistory } from "@/server/research/teardown/service";

export async function DELETE(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try { return Response.json(await deleteTeardownHistory(await researchApiActor(), (await params).runId)); }
  catch (error) { return researchApiError(error); }
}
