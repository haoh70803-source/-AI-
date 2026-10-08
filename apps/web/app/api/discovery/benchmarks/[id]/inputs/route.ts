import { NextResponse } from "next/server";
import { ZodError } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { ResearchAccessError } from "@/server/discovery/research-library";
import { getBenchmarkInputs, importBenchmarkComments } from "@/server/discovery/benchmark-inputs";

function failure(error: unknown) {
  if (error instanceof ResearchAccessError) return apiError(error.status === 404 ? "NOT_FOUND" : "FORBIDDEN", error.status);
  if (error instanceof ZodError) return apiError("INVALID_COMMENT_DATA", 400, "请检查 F2 评论 JSON：必须有 comments，且每条包含匹配作品的 aweme_id、cid 和 text。");
  return apiError("BENCHMARK_INPUT_FAILED", 500, "资料读取或导入失败，请重试。");
}
export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401);
  try { return NextResponse.json(await getBenchmarkInputs(context.workspace.id, context.session.user.id, (await params).id, new URL(request.url).searchParams.get("runId") ?? undefined)); } catch (error) { return failure(error); }
}
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  try {
    if (Number(request.headers.get("content-length")) > 2_000_000) return apiError("PAYLOAD_TOO_LARGE", 413);
    const reader = request.body?.getReader();
    if (!reader) return apiError("INVALID_JSON", 400);
    let bytes = 0; let text = ""; const decoder = new TextDecoder();
    while (true) {
      const chunk = await reader.read(); if (chunk.done) break;
      bytes += chunk.value.byteLength;
      if (bytes > 2_000_000) { await reader.cancel(); return apiError("PAYLOAD_TOO_LARGE", 413); }
      text += decoder.decode(chunk.value, { stream: true });
    }
    text += decoder.decode();
    let data: unknown; try { data = JSON.parse(text); } catch { return apiError("INVALID_JSON", 400); }
    return NextResponse.json(await importBenchmarkComments({ workspaceId: context.workspace.id, userId: context.session.user.id, accountId: (await params).id, data }));
  } catch (error) { return failure(error); }
}
