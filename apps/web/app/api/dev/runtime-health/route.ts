import { NextResponse } from "next/server";
import { getRuntimeHealth } from "@/server/runtime/health";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ error: "NOT_AVAILABLE" }, { status: 404 });
  }

  return NextResponse.json(await getRuntimeHealth(), {
    headers: { "Cache-Control": "no-store, max-age=0" },
  });
}
