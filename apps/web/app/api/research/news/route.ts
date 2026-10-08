import { NextResponse } from "next/server";
import { researchApiActor, researchApiError } from "@/server/research/api";
import { newsReadModel, newsAction } from "@/server/research/news/service";
import { NewsTransportError } from "@/server/research/news/transport";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET() {
  try { return NextResponse.json(await newsReadModel(await researchApiActor()), { headers: { "Cache-Control": "private, no-store" } }); } catch (error) { return researchApiError(error); }
}
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) return NextResponse.json({ error: { code: "ORIGIN_DENIED", message: "请从当前工作台操作。" } }, { status: 403 });
  if (Number(request.headers.get("content-length") || 0) > 2048) return NextResponse.json({ error: { code: "INPUT_TOO_LARGE", message: "输入过长。" } }, { status: 413 });
  try {
    const actor = await researchApiActor();
    const body = await request.text(); if (body.length > 2048) return NextResponse.json({ error: { code: "INPUT_TOO_LARGE", message: "输入过长。" } }, { status: 413 });
    return NextResponse.json(await newsAction(actor, JSON.parse(body)), { headers: { "Cache-Control": "private, no-store" } });
  } catch (error) {
    if (error instanceof NewsTransportError) return NextResponse.json({ error: { code: error.code, message: "资讯服务暂不可用，请保留已有阅读记录并稍后重试。" } }, { status: error.status });
    if (error instanceof SyntaxError) return NextResponse.json({ error: { code: "INVALID_INPUT", message: "输入格式有误。" } }, { status: 400 });
    return researchApiError(error);
  }
}
