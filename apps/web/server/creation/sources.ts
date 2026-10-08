import "server-only";
import { getMaterialReadableContent } from "../material-detail/readable-content";
import { db } from "@content-center/db";
import { getStorageProvider, type LLMContentBlock } from "@content-center/providers";
import { CreationInputError } from "./models";

export async function loadCreationSources(workspaceId: string, ids: string[], userId: string) {
  if (ids.length > 8) throw new CreationInputError("一次最多添加 8 条资料。");
  const rows = await db.sourceItem.findMany({ where: { workspaceId, id: { in: ids }, status: { not: "ARCHIVED" } }, select: {
    id: true, title: true, sourceType: true, status: true, rawText: true,
    transcript: { select: { fullText: true } },
    assets: { where: { status: "STORED", assetType: "IMAGE" }, take: 1, orderBy: { createdAt: "desc" }, select: { id: true, storageKey: true, mimeType: true } },
    ingestJobs: { take: 1, orderBy: { createdAt: "desc" }, select: { id: true, status: true, errorMessage: true } },
  } });
  const readings = new Map(await Promise.all(ids.map(async id => [id, await getMaterialReadableContent({ workspaceId, userId, sourceItemId: id })] as const)));
  return ids.map((id) => {
    const row = rows.find((item) => item.id === id);
    const text = row ? readings.get(id)?.contentText ?? "" : "";
    const image = row?.sourceType === "IMAGE" ? row.assets[0] : undefined;
    const job = row?.ingestJobs[0];
    const ready = Boolean(text);
    const reading = !ready && Boolean(job && ["QUEUED", "RUNNING", "RETRYING"].includes(job.status));
    return { id, title: row?.title || "未命名资料", sourceType: row?.sourceType ?? "TEXT", text, image,
      state: ready ? "READY" as const : reading ? "READING" as const : "FAILED" as const,
      message: ready ? (image ? "图片已就绪" : "文字已就绪") : reading ? "正在读取资料…" : !row ? "资料已失效，请移除后重新选择。" : image ? "图片已上传，请先在资料页完成识读后再引用。" : job?.errorMessage || "尚未取得可用内容，请重新读取资料。",
      jobId: job?.id ?? null,
    };
  });
}

export async function creationImageContent(workspaceId: string, sources: Awaited<ReturnType<typeof loadCreationSources>>): Promise<LLMContentBlock[]> {
  const content: LLMContentBlock[] = [];
  for (const source of sources) {
    if (!source.image?.storageKey) continue;
    const image = source.image;
    if (!["image/jpeg", "image/png", "image/webp"].includes(image.mimeType ?? "")) throw new CreationInputError("图片格式不支持，请重新上传 JPG、PNG 或 WebP。");
    const signed = await getStorageProvider().getSignedUrl(image.storageKey!, 120, { assetScope: { workspaceId, sourceItemId: source.id, assetId: image.id } });
    const response = await fetch(signed.data.url, { signal: AbortSignal.timeout(15_000), redirect: "error" });
    if (!response.ok || Number(response.headers.get("content-length")) > 25 * 1024 * 1024) throw new CreationInputError("图片读取失败，请稍后重试。");
    const data = Buffer.from(await response.arrayBuffer());
    if (data.length > 25 * 1024 * 1024) throw new CreationInputError("图片过大，请重新选择。");
    content.push({ type: "text", text: `参考图片：${source.title}；来源：${source.id}` }, { type: "image", source: { type: "base64", mediaType: image.mimeType as "image/jpeg" | "image/png" | "image/webp", data: data.toString("base64") } });
  }
  return content;
}
