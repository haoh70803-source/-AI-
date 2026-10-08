import { releaseReadiness } from "@/server/runtime/readiness";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  const state = await releaseReadiness();
  return Response.json(state, { status: state.ready ? 200 : 503, headers: { "cache-control": "no-store" } });
}
export async function HEAD() {
  const state = await releaseReadiness();
  return new Response(null, { status: state.ready ? 200 : 503, headers: { "cache-control": "no-store" } });
}
