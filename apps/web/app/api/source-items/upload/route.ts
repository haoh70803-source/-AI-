import { reserveExperienceUsage, ExperienceLimitError } from "@content-center/worker/experience-limits";
import { db } from "@content-center/db";
import { buildSourceAssetObjectKey, getStorageProvider } from "@content-center/providers";
import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { readUploadFormData, MAX_UPLOADS_PER_REQUEST, uploadErrorMessage, validateUploadedFile } from "@/server/source-upload";

function json(value: unknown) {
  return JSON.parse(JSON.stringify(value));
}

function errorCode(error: unknown) {
  return error instanceof Error ? error.message : "UPLOAD_FAILED";
}

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);

  let release: () => Promise<void>;
  try { release = await reserveExperienceUsage({workspaceId:context.workspace.id,userId:context.session.user.id,operation:"UPLOAD"}); }
  catch (error) { return apiError("EXPERIENCE_LIMIT",429,error instanceof ExperienceLimitError ? error.message : "上传服务暂不可用。"); }
  try {
  let formData: FormData;
  try { formData = await readUploadFormData(request); }
  catch (error) { return error instanceof Error && error.message === "UPLOAD_BATCH_TOO_LARGE" ? apiError("UPLOAD_BATCH_TOO_LARGE", 413, "本次上传总量超过 50 MB，请分批上传。单个音视频最多 50 MB。") : apiError("INVALID_UPLOAD_FORM", 400, "无法读取上传内容，请重新选择文件。"); }
  const files = formData?.getAll("files").filter((value): value is File => value instanceof File) ?? [];
  if (!files.length) return apiError("FILE_REQUIRED", 400, "请选择要添加的文件。");
  if (files.length > MAX_UPLOADS_PER_REQUEST) return apiError("TOO_MANY_FILES", 400, `一次最多添加 ${MAX_UPLOADS_PER_REQUEST} 个文件。`);

  const storage = getStorageProvider();
  try { if(files.length > 1) await reserveExperienceUsage({ workspaceId: context.workspace.id, userId: context.session.user.id, operation: "UPLOAD", amount: files.length - 1, quotaOnly: true }); } catch (error) { return apiError("EXPERIENCE_LIMIT", 429, error instanceof ExperienceLimitError ? error.message : "体验额度服务暂不可用。"); }
  const results: Array<Record<string, unknown>> = [];
  for (const file of files) {
    let upload: Awaited<ReturnType<typeof validateUploadedFile>>;
    try {
      upload = await validateUploadedFile(file);
    } catch (error) {
      const code = errorCode(error);
      results.push({ name: file.name, status: "FAILED", errorCode: code, message: uploadErrorMessage(code) });
      continue;
    }

    const duplicate = await db.sourceAsset.findFirst({
      where: { workspaceId: context.workspace.id, sourceItem: { workspaceId: context.workspace.id }, status: "STORED", metadata: { path: ["sha256"], equals: upload.sha256 } },
      select: { sourceItemId: true },
    });
    if (duplicate) {
      results.push({ name: upload.originalName, status: "DUPLICATE", sourceItemId: duplicate.sourceItemId });
      continue;
    }

    let sourceId = "";
    let assetId = "";
    let storageKey = "";
    try {
      const source = await db.$transaction(async (tx) => {
        const sourceItem = await tx.sourceItem.create({
          data: {
            workspaceId: context.workspace.id,
            createdById: context.session.user.id,
            sourceType: upload.sourceType,
            sourcePlatform: "GENERIC",
            sourceProvider: "LOCAL_UPLOAD",
            title: upload.title,
            rawText: upload.contentText ?? null,
            status: "PENDING",
          },
        });
        const asset = await tx.sourceAsset.create({
          data: {
            workspaceId: context.workspace.id,
            sourceItemId: sourceItem.id,
            assetType: upload.assetType,
            sourceProvider: "LOCAL_UPLOAD",
            status: "DOWNLOADING",
            mimeType: upload.mimeType,
            sizeBytes: BigInt(upload.bytes.byteLength),
            metadata: json({ sha256: upload.sha256, originalName: upload.originalName, sourceType: upload.sourceType }),
          },
        });
        return { sourceItem, asset };
      });
      sourceId = source.sourceItem.id;
      assetId = source.asset.id;
      storageKey = buildSourceAssetObjectKey({ workspaceId: context.workspace.id, sourceItemId: sourceId, assetId, assetType: upload.assetType, mimeType: upload.mimeType });
      await storage.upload({ key: storageKey, body: upload.bytes, contentType: upload.mimeType, contentLength: upload.bytes.byteLength, assetScope: { workspaceId: context.workspace.id, sourceItemId: sourceId, assetId } });
      await db.sourceAsset.update({ where: { id: assetId }, data: { status: "STORED", storageKey, storedAt: new Date() } });

      // Validation already extracts native text. No second job or AI call is needed.
      await db.sourceItem.update({ where: { id: sourceId }, data: { status: "READY" } });
      results.push({ name: upload.originalName, status: "READY", sourceItemId: sourceId, contentState: upload.kind === "DOCUMENT" && !upload.contentText ? "NO_TEXT" : "READY" });
    } catch (error) {
      if (storageKey) await storage.delete(storageKey, { workspaceId: context.workspace.id, sourceItemId: sourceId, assetId }).catch(() => undefined);
      if (sourceId) await db.sourceItem.delete({ where: { id: sourceId } }).catch(() => undefined);
      const code = errorCode(error);
      results.push({ name: upload.originalName, status: "FAILED", errorCode: code, message: uploadErrorMessage(code) });
    }
  }

  const hasSuccess = results.some((item) => item.status === "QUEUED" || item.status === "DUPLICATE" || item.status === "READY");
  return NextResponse.json({ results }, { status: hasSuccess ? 202 : 400 });
  } finally { await release(); }
}
