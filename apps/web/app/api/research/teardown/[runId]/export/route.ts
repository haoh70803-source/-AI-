import { researchApiActor, researchApiError } from "@/server/research/api";
import { exportTeardown } from "@/server/research/teardown/service";
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try { return new Response(await exportTeardown(await researchApiActor(), (await params).runId), { headers: { "Content-Type": "text/markdown; charset=utf-8", "Content-Disposition": 'attachment; filename="douyin-teardown.md"', "Cache-Control": "private, no-store" } }); }
  catch (error) { return researchApiError(error); }
}
