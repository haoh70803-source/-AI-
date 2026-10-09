import { normalizeSourceUrl } from "@content-center/core";
import { db } from "@content-center/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { listLibrarySources } from "@/server/library";
import { createSourceAndJob, SourceServiceError } from "@/server/source-service";
import { extractDouyinShareUrl, extractRedFoxContentUrl, RedFoxError, DoubaoError, LocalAsrError, resolvePublicAddress } from "@content-center/providers";

const createSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TEXT"), title: z.string().trim().max(200).optional(), text: z.string().trim().min(1).max(500_000), notes: z.string().trim().max(2_000).optional() }),
  z.object({ kind: z.literal("URL"), url: z.string().trim().url().max(2_000) }),
  z.object({ kind: z.literal("MEDIA_URL"), url: z.string().trim().url().max(2_000), autoTranscribe: z.boolean().optional() }),
  z.object({ kind: z.literal("DOUYIN"), autoTranscribe: z.boolean().optional(), shareText: z.string().trim().min(1).max(10_000) }),
  z.object({
    kind: z.literal("REDFOX"),
    autoTranscribe: z.boolean().optional(),
    url: z.string().trim().url().max(2_000),
    externalId: z.string().trim().max(300).optional(),
    title: z.string().trim().max(500).optional(),
    author: z.string().trim().max(300).optional(),
    description: z.string().trim().max(5_000).optional(),
    thumbnailUrl: z.string().trim().url().max(2_000).optional(),
    contentType: z.enum(["VIDEO", "IMAGE", "ARTICLE", "UNKNOWN"]).optional(),
  }),
]);

export async function GET(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const params = Object.fromEntries(new URL(request.url).searchParams.entries());
  return NextResponse.json(await listLibrarySources(context.workspace.id, params));
}

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const clientRequestId=request.headers.get("idempotency-key") ?? undefined;
  if(clientRequestId && !z.uuid().safeParse(clientRequestId).success)return apiError("INVALID_REQUEST_KEY",400);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "采集输入不完整或格式不正确。");
  const requestKeyRecord = clientRequestId ? await db.ingestJob.findFirst({where:{workspaceId:context.workspace.id,requestedById:context.session.user.id,metadata:{path:["clientRequestId"],equals:clientRequestId}},select:{id:true}}) : null;
  if (parsed.data.kind === "URL" || parsed.data.kind === "MEDIA_URL") {
    let canonicalUrl: string;
    try {
      canonicalUrl = normalizeSourceUrl(parsed.data.url);
      if (parsed.data.kind === "MEDIA_URL") await resolvePublicAddress(canonicalUrl);
    } catch {
      return apiError("INVALID_URL", 400, "请输入可公开下载的视频地址，不能使用本机或内网地址。");
    }
    const duplicate = await db.sourceItem.findFirst({ where: { workspaceId: context.workspace.id, canonicalUrl }, select: { id: true } });
    if (duplicate && !requestKeyRecord) return NextResponse.json({ error: "DUPLICATE_URL", sourceItemId: duplicate.id }, { status: 409 });
  }
  if (parsed.data.kind === "DOUYIN" || parsed.data.kind === "REDFOX") {
    let canonicalUrl: string;
    let platform: "DOUYIN" | "XIAOHONGSHU";
    try {
      const resolved = parsed.data.kind === "DOUYIN"
        ? { url: extractDouyinShareUrl(parsed.data.shareText), platform: "DOUYIN" as const }
        : extractRedFoxContentUrl(parsed.data.url);
      canonicalUrl = normalizeSourceUrl(resolved.url);
      platform = resolved.platform;
    } catch (error) {
      if (error instanceof RedFoxError) return apiError(error.code, 400, error.message);
      return apiError("INVALID_REDFOX_URL", 400, "请输入有效的抖音或小红书作品链接。");
    }
    const duplicate = await db.sourceItem.findFirst({
      where: {
        workspaceId: context.workspace.id,
        OR: [
          { canonicalUrl },
          ...(parsed.data.kind === "REDFOX" && parsed.data.externalId
            ? [{ sourcePlatform: platform, externalId: parsed.data.externalId }]
            : []),
        ],
      },
      select: { id: true, status: true },
    });
    if (duplicate && !requestKeyRecord) {
      return NextResponse.json(
        {
          error: "DUPLICATE_SOURCE",
          message: duplicate.status === "FAILED"
            ? "素材库中已经存在，可进入素材详情重新解析。"
            : "素材库中已经存在。",
          sourceItemId: duplicate.id,
          retryAllowed: duplicate.status === "FAILED",
        },
        { status: 409 },
      );
    }
  }
  try {
    const created = await createSourceAndJob({ workspaceId: context.workspace.id, userId: context.session.user.id, source: parsed.data, autoTranscribe: "autoTranscribe" in parsed.data ? parsed.data.autoTranscribe : false, clientRequestId });
    return NextResponse.json({ sourceItemId: created.sourceItem.id, jobId: created.ingestJob.id, status: created.ingestJob.status }, { status: 202 });
  } catch (error) {
    if (error instanceof DoubaoError || error instanceof LocalAsrError) return apiError(error.code, 409, error.message);
    if (error instanceof SourceServiceError) {
      if(error.code==="IDEMPOTENCY_KEY_REUSED")return apiError(error.code,409,"同一请求标识不能用于不同内容。");
      return apiError(
        error.code,
        error.code === "REDFOX_DISABLED" ? 409 : 400,
        error.code === "REDFOX_DISABLED"
          ? "红狐 API 已禁用。"
          : "请先在 设置 → AI 与外部服务 配置红狐 API。",
      );
    }
    if (error instanceof RedFoxError) return apiError(error.code, 400, error.message);
    if (error instanceof Error && error.message === "QUEUE_UNAVAILABLE") return apiError("QUEUE_UNAVAILABLE", 503);
    return apiError("SOURCE_CREATE_FAILED", 409, "该内容可能已被当前 Workspace 收录。");
  }
}
