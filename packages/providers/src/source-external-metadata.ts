export type SourceExternalMetrics = {
  views: number | null;
  likes: number | null;
  favorites: number | null;
  comments: number | null;
  shares: number | null;
};

export type SourceExternalMetadata = {
  schemaVersion: 1;
  platform: "DOUYIN" | "XIAOHONGSHU";
  externalId: string | null;
  originalTitle: string | null;
  description: string | null;
  authorId: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  publishedAt: string | null;
  originalUrl: string;
  coverUrl: string | null;
  durationMs: number | null;
  topics: string[];
  metrics: SourceExternalMetrics;
  providerFetchedAt: string;
  providerCrawlTime: string | null;
  sourceProvider: "REDFOX";
};

export type SourceMetadataEnvelope = {
  provider: "REDFOX";
  providerMode: "REAL";
  external: SourceExternalMetadata;
  ingest?: {
    awemeType?: string;
    assetCount?: number;
  };
};

type SourceExternalMetadataInput = Omit<SourceExternalMetadata, "schemaVersion" | "providerFetchedAt" | "sourceProvider"> & {
  providerFetchedAt?: string;
};

const emptyMetrics: SourceExternalMetrics = {
  views: null,
  likes: null,
  favorites: null,
  comments: null,
  shares: null,
};

function record(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : null;
}

function nullableText(value: unknown): string | null {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function nullableNumber(value: unknown): number | null {
  return typeof value === "number" && Number.isFinite(value) && value >= 0 ? value : null;
}

function validDate(value: unknown): string | null {
  const text = nullableText(value);
  if (!text) return null;
  const timestamp = Date.parse(text);
  return Number.isNaN(timestamp) ? null : new Date(timestamp).toISOString();
}

function validUrl(value: unknown): string | null {
  const text = nullableText(value);
  if (!text) return null;
  try {
    const parsed = new URL(text);
    return parsed.protocol === "http:" || parsed.protocol === "https:" ? parsed.toString() : null;
  } catch {
    return null;
  }
}

function stringList(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return [...new Set(value.flatMap((item) => nullableText(item) ? [nullableText(item)!] : []))].slice(0, 100);
}

function metrics(value: unknown): SourceExternalMetrics {
  const source = record(value) ?? {};
  return {
    views: nullableNumber(source.views),
    likes: nullableNumber(source.likes),
    favorites: nullableNumber(source.favorites),
    comments: nullableNumber(source.comments),
    shares: nullableNumber(source.shares),
  };
}

export function createSourceExternalMetadata(input: SourceExternalMetadataInput): SourceExternalMetadata {
  return {
    schemaVersion: 1,
    platform: input.platform,
    externalId: nullableText(input.externalId),
    originalTitle: nullableText(input.originalTitle),
    description: nullableText(input.description),
    authorId: nullableText(input.authorId),
    authorName: nullableText(input.authorName),
    authorAvatarUrl: validUrl(input.authorAvatarUrl),
    publishedAt: validDate(input.publishedAt),
    originalUrl: validUrl(input.originalUrl) ?? input.originalUrl,
    coverUrl: validUrl(input.coverUrl),
    durationMs: nullableNumber(input.durationMs),
    topics: stringList(input.topics),
    metrics: metrics(input.metrics),
    providerFetchedAt: validDate(input.providerFetchedAt) ?? new Date().toISOString(),
    providerCrawlTime: validDate(input.providerCrawlTime),
    sourceProvider: "REDFOX",
  };
}

export function createSourceMetadataEnvelope(
  external: SourceExternalMetadata,
  ingest?: SourceMetadataEnvelope["ingest"],
): SourceMetadataEnvelope {
  return {
    provider: "REDFOX",
    providerMode: "REAL",
    external,
    ...(ingest ? { ingest } : {}),
  };
}

export function readSourceMetadataEnvelope(value: unknown): SourceMetadataEnvelope | null {
  const envelope = record(value);
  const external = record(envelope?.external);
  if (envelope?.provider !== "REDFOX" || envelope.providerMode !== "REAL" || !external) return null;
  const platform = external.platform === "DOUYIN" || external.platform === "XIAOHONGSHU" ? external.platform : null;
  const originalUrl = validUrl(external.originalUrl);
  const providerFetchedAt = validDate(external.providerFetchedAt);
  if (!platform || !originalUrl || !providerFetchedAt) return null;
  const ingest = record(envelope.ingest);
  return createSourceMetadataEnvelope(createSourceExternalMetadata({
    platform,
    externalId: nullableText(external.externalId),
    originalTitle: nullableText(external.originalTitle),
    description: nullableText(external.description),
    authorId: nullableText(external.authorId),
    authorName: nullableText(external.authorName),
    authorAvatarUrl: validUrl(external.authorAvatarUrl),
    publishedAt: validDate(external.publishedAt),
    originalUrl,
    coverUrl: validUrl(external.coverUrl),
    durationMs: nullableNumber(external.durationMs),
    topics: stringList(external.topics),
    metrics: metrics(external.metrics),
    providerFetchedAt,
    providerCrawlTime: validDate(external.providerCrawlTime),
  }), ingest ? {
    ...(nullableText(ingest.awemeType) ? { awemeType: nullableText(ingest.awemeType)! } : {}),
    ...(nullableNumber(ingest.assetCount) !== null ? { assetCount: nullableNumber(ingest.assetCount)! } : {}),
  } : undefined);
}

export function mergeSourceExternalMetadata(
  previous: SourceExternalMetadata | null,
  current: SourceExternalMetadata,
): SourceExternalMetadata {
  if (!previous) return current;
  return {
    ...current,
    externalId: current.externalId ?? previous.externalId,
    originalTitle: current.originalTitle ?? previous.originalTitle,
    description: current.description ?? previous.description,
    authorId: current.authorId ?? previous.authorId,
    authorName: current.authorName ?? previous.authorName,
    authorAvatarUrl: current.authorAvatarUrl ?? previous.authorAvatarUrl,
    publishedAt: current.publishedAt ?? previous.publishedAt,
    coverUrl: current.coverUrl ?? previous.coverUrl,
    durationMs: current.durationMs ?? previous.durationMs,
    topics: current.topics.length ? current.topics : previous.topics,
    metrics: {
      views: current.metrics.views ?? previous.metrics.views,
      likes: current.metrics.likes ?? previous.metrics.likes,
      favorites: current.metrics.favorites ?? previous.metrics.favorites,
      comments: current.metrics.comments ?? previous.metrics.comments,
      shares: current.metrics.shares ?? previous.metrics.shares,
    },
    providerCrawlTime: current.providerCrawlTime ?? previous.providerCrawlTime,
  };
}

export function emptySourceExternalMetrics(): SourceExternalMetrics {
  return { ...emptyMetrics };
}
