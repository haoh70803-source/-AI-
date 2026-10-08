import { db, findSourceForUser } from "@content-center/db";
import { getStorageProvider } from "@content-center/providers";
import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";

const ACCESS_TTL_SECONDS = 5 * 60;

export async function GET(request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id: sourceId, assetId } = await params;
  const source = await findSourceForUser(db, {
    userId: context.session.user.id,
    workspaceId: context.workspace.id,
    sourceItemId: sourceId,
  });
  const asset = source?.assets.find((candidate) => candidate.id === assetId && candidate.workspaceId === context.workspace.id && candidate.sourceItemId === source.id);
  if (!source || !asset) return apiError("NOT_FOUND", 404);
  if (asset.status !== "STORED" || !asset.storageKey) return apiError("ASSET_NOT_STORED", 409, "素材文件尚未保存完成。");

  const searchParams = new URL(request.url).searchParams;
  if (searchParams.has("objectKey")) return apiError("INVALID_REQUEST", 400, "不能直接指定对象路径。");
  const disposition = searchParams.get("disposition") ?? "inline";
  if (disposition !== "inline" && disposition !== "attachment") return apiError("INVALID_DISPOSITION", 400, "下载方式无效。");
  try {
    const metadata = asset.metadata && typeof asset.metadata === "object" && !Array.isArray(asset.metadata) ? asset.metadata as Record<string, unknown> : {};
    const extension = ({ "video/mp4": ".mp4", "audio/mpeg": ".mp3", "audio/wav": ".wav", "audio/mp4": ".m4a", "application/pdf": ".pdf", "image/png": ".png", "image/jpeg": ".jpg", "image/webp": ".webp", "text/plain": ".txt" } as Record<string, string>)[asset.mimeType || ""] || "";
    const filename = (typeof metadata.originalName === "string" ? metadata.originalName : `${source.title || "source-asset"}${extension}`).replace(/[\\/:*?"<>|\r\n]/g, "_").slice(0, 180);
    const signed = await getStorageProvider().getSignedUrl(asset.storageKey, ACCESS_TTL_SECONDS, {
      disposition,
      filename: disposition === "attachment" ? filename : undefined,
      assetScope: { workspaceId: context.workspace.id, sourceItemId: source.id, assetId: asset.id },
    });
    return NextResponse.json({ url: signed.data.url, expiresInSeconds: ACCESS_TTL_SECONDS, disposition });
  } catch (error) {
    if (error instanceof Error && (error.message.startsWith("UNCONFIGURED") || error.message === "INVALID_STORAGE_ENDPOINT")) {
      return apiError("STORAGE_UNCONFIGURED", 503, "对象存储尚未配置。");
    }
    return apiError("STORAGE_ACCESS_FAILED", 502, "无法生成素材访问链接。");
  }
}
