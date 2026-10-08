import { db, findSourceForUser } from "@content-center/db";
import { getStorageProvider, renderPdfPreviewPage } from "@content-center/providers";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
export const runtime = "nodejs";
export async function GET(request: Request, { params }: { params: Promise<{ id: string; assetId: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id, assetId } = await params;
  const page = Number(new URL(request.url).searchParams.get("page") || "1");
  if (!Number.isInteger(page) || page < 1) return apiError("INVALID_PAGE", 400);
  const source = await findSourceForUser(db, { userId: context.session.user.id, workspaceId: context.workspace.id, sourceItemId: id });
  const asset = source?.assets.find(item => item.id === assetId && item.workspaceId === context.workspace.id && item.sourceItemId === id);
  if (!asset || asset.status !== "STORED" || !asset.storageKey || asset.mimeType !== "application/pdf") return apiError("NOT_FOUND", 404);
  if (Number(asset.sizeBytes) > 25 * 1024 * 1024) return apiError("FILE_TOO_LARGE", 413);
  try {
    const signed = await getStorageProvider().getSignedUrl(asset.storageKey, 60, { assetScope: { workspaceId: context.workspace.id, sourceItemId: id, assetId } });
    const response = await fetch(signed.data.url, { signal: AbortSignal.timeout(20000), redirect: "error" });
    if (!response.ok) throw new Error("FILE_UNAVAILABLE");
    const bytes = new Uint8Array(await response.arrayBuffer());
    const rendered = await renderPdfPreviewPage(bytes, page);
    return new Response(new Uint8Array(rendered.data), { headers: { "content-type": "image/png", "cache-control": "private, no-store", "x-pdf-pages": String(rendered.total), "x-content-type-options": "nosniff" } });
  } catch (error) { return apiError("PDF_PREVIEW_FAILED", error instanceof Error && error.message === "PDF_PAGE_NOT_FOUND" ? 404 : 422, "PDF 预览暂时无法加载，可阅读提取正文或下载原文件。"); }
}
