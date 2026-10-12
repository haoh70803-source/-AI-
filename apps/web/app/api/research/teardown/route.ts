import { researchApiActor, researchApiError } from "@/server/research/api";
import { listTeardowns, startTeardown } from "@/server/research/teardown/service";
export async function GET(request: Request) {
  try { return Response.json(await listTeardowns(await researchApiActor(), new URL(request.url).searchParams.get("page") ?? 1)); }
  catch (error) { return researchApiError(error); }
}
export async function POST(request: Request) {
  try { return Response.json(await startTeardown(await researchApiActor(), await request.json()), { status: 202 }); }
  catch (error) { return researchApiError(error); }
}
