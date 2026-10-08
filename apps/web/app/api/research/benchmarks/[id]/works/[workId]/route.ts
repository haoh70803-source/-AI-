import { researchApiActor, researchApiError } from "@/server/research/api";
import { researchBenchmarkWork } from "@/server/research/benchmark-dossier";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; workId: string }> }) {
  try { const { id, workId } = await params; return Response.json(await researchBenchmarkWork(await researchApiActor(), id, workId)); }
  catch (error) { return researchApiError(error); }
}
