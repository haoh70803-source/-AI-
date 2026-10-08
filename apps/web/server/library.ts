import { db, type Prisma } from "@content-center/db";
import { getStorageProvider } from "@content-center/providers";

export type LibraryQuery = {
  search?: string;
  sourcePlatform?: string;
  sourceType?: string;
  status?: string;
  tag?: string;
  collection?: string;
  sort?: string;
  page?: string;
  pageSize?: string;
  view?: string;
};

const allowedPlatforms = ["GENERIC", "DOUYIN", "XIAOHONGSHU", "WECHAT", "BILIBILI", "YOUTUBE", "TIKTOK", "OTHER"];
const allowedTypes = ["TEXT", "URL", "VIDEO", "AUDIO", "IMAGE", "DOCUMENT"];
const allowedStatuses = ["PENDING", "PROCESSING", "READY", "FAILED", "ARCHIVED"];

export async function listLibrarySources(workspaceId: string, query: LibraryQuery) {
  let page = Math.max(1, Math.floor(Number(query.page) || 1));
  const pageSize = Math.min(50, Math.max(1, Math.floor(Number(query.pageSize) || 12)));
  const where: Prisma.SourceItemWhereInput = {
    workspaceId,
    ...(query.search?.trim()
      ? {
          OR: [
            { title: { contains: query.search.trim(), mode: "insensitive" } },
            { author: { contains: query.search.trim(), mode: "insensitive" } },
            { rawText: { contains: query.search.trim(), mode: "insensitive" } },
            { description: { contains: query.search.trim(), mode: "insensitive" } },
            { sourceUrl: { contains: query.search.trim(), mode: "insensitive" } },
            { canonicalUrl: { contains: query.search.trim(), mode: "insensitive" } },
            { externalId: { contains: query.search.trim(), mode: "insensitive" } },
            { transcript: { fullText: { contains: query.search.trim(), mode: "insensitive" } } },
            { sourceUnderstanding: { workspaceId, text: { contains: query.search.trim(), mode: "insensitive" } } },
            ...["originalTitle", "authorName", "description"].map((key) => ({ metadata: { path: ["external", key], string_contains: query.search!.trim(), mode: "insensitive" as const } })),
          ],
        }
      : {}),
    ...(allowedPlatforms.includes(query.sourcePlatform ?? "") ? { sourcePlatform: query.sourcePlatform as never } : {}),
    ...(allowedTypes.includes(query.sourceType ?? "") ? { sourceType: query.sourceType as never } : {}),
    ...(allowedStatuses.includes(query.status ?? "") ? { status: query.status as never } : { status: { not: "ARCHIVED" } }),
    ...(query.tag ? { tags: { some: { tagId: query.tag } } } : {}),
    ...(query.collection ? { collections: { some: { collectionId: query.collection } } } : {}),
  };
  const orderBy: Prisma.SourceItemOrderByWithRelationInput =
    query.sort === "oldest"
      ? { createdAt: "asc" }
      : query.sort === "title"
        ? { title: "asc" }
        : { createdAt: "desc" };
  const total = await db.sourceItem.count({ where });
  const lastPage = Math.max(1, Math.ceil(total / pageSize));
  page = Math.min(page, lastPage);
  const items = await db.sourceItem.findMany({
      where,
      select: {
        id: true,
        sourceType: true,
        sourceProvider: true,
        sourcePlatform: true,
        title: true,
        author: true,
        thumbnailUrl: true,
        status: true,
        rawText: true,
        createdAt: true,
        tags: { select: { tag: { select: { id: true, name: true } } }, take: 5 },
        ingestJobs: {
          where: { jobType: { in: ["EXTRACT_TEXT", "FETCH_URL", "TRANSCRIBE", "PROCESS_MEDIA"] } },
          select: { id: true, jobType: true, provider: true, providerMode: true, status: true, errorMessage: true, metadata: true },
          orderBy: { createdAt: "desc" },
          take: 1,
        },
        assets: { select: { id: true, assetType: true, status: true, storageKey: true, mimeType: true } },
        transcript: { select: { providerMode: true } },
      },
      orderBy,
      skip: (page - 1) * pageSize,
      take: pageSize,
    });
  let storage: ReturnType<typeof getStorageProvider> | null = null;
  if (items.some((item) => !item.thumbnailUrl && item.assets.some((asset) => asset.assetType === "IMAGE" && asset.status === "STORED" && asset.storageKey))) {
    try { storage = getStorageProvider(); } catch { storage = null; }
  }
  const resolvedItems = await Promise.all(items.map(async (item) => {
    if (item.thumbnailUrl || !storage) return item;
    const image = item.assets.find((asset) => asset.assetType === "IMAGE" && asset.status === "STORED" && asset.storageKey);
    if (!image?.storageKey) return item;
    try {
      const signed = await storage.getSignedUrl(image.storageKey, 300, { assetScope: { workspaceId, sourceItemId: item.id, assetId: image.id } });
      return { ...item, thumbnailUrl: signed.data.url };
    } catch {
      return item;
    }
  }));
  return { items: resolvedItems, total, page, pageSize, pages: Math.max(1, Math.ceil(total / pageSize)) };
}
