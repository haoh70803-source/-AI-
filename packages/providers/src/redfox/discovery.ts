export type DiscoveryPlatform = "DOUYIN" | "XIAOHONGSHU";
export type ExternalContentType = "VIDEO" | "IMAGE" | "ARTICLE" | "UNKNOWN";

export type ExternalMetrics = {
  views: number | null;
  likes: number | null;
  comments: number | null;
  shares: number | null;
  favorites: number | null;
};

export type ExternalContent = {
  externalId: string;
  platform: DiscoveryPlatform;
  contentType: ExternalContentType;
  title: string | null;
  description: string | null;
  authorId: string | null;
  authorName: string | null;
  authorAvatarUrl: string | null;
  coverUrl: string | null;
  originalUrl: string;
  publishedAt: string | null;
  metrics: ExternalMetrics;
  durationMs: number | null;
  sourceProvider: "REDFOX";
  /** Server-only provider snapshot. API layers must omit this field. */
  rawProviderMetadata?: Record<string, unknown>;
};

export type ExternalAccount = {
  externalId: string;
  platform: DiscoveryPlatform;
  name: string;
  avatarUrl: string | null;
  bio: string | null;
  followers: number | null;
  likes: number | null;
  originalUrl: string | null;
  sourceProvider: "REDFOX";
  /** Server-only provider snapshot. API layers must omit this field. */
  rawProviderMetadata?: Record<string, unknown>;
};

export type ExternalResultPage<T> = {
  items: T[];
  total: number | null;
  hasMore: boolean | null;
  nextOffset?: number | null;
  providerRequestId?: string;
};
