export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  return Response.json({ status: "UP" }, { headers: { "cache-control": "no-store" } });
}
export async function HEAD() {
  return new Response(null, { status: 200, headers: { "cache-control": "no-store" } });
}
