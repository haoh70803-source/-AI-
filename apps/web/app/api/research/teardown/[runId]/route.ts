import { researchApiActor, researchApiError } from "@/server/research/api";
import { cancelTeardown, getTeardown, retryTeardown } from "@/server/research/teardown/service";
export async function GET(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try { return Response.json(await getTeardown(await researchApiActor(), (await params).runId)); }
  catch (error) { return researchApiError(error); }
}
export async function DELETE(_request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try { return Response.json(await cancelTeardown(await researchApiActor(), (await params).runId)); }
  catch (error) { return researchApiError(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ runId: string }> }) {
  try { return Response.json(await retryTeardown(await researchApiActor(), (await params).runId, await request.json())); }
  catch (error) { return researchApiError(error); }
}
