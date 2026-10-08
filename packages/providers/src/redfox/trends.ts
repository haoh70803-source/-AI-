export type TrendPlatform = "DOUYIN" | "XIAOHONGSHU" | "GLOBAL";
export type ProviderTrendType = "HOT" | "SURGING" | "DARK_HORSE";
export type TrendWindow = "TODAY" | "SEVEN_DAYS";

export type TrendMetrics = {
  contentCount: number | null;
  engagement: number | null;
  growth: number | null;
  likes: number | null;
  comments: number | null;
};

export type ProviderTrendItem = {
  externalKey: string;
  platform: TrendPlatform;
  type: ProviderTrendType;
  title: string;
  keyword: string | null;
  rank: number | null;
  trendScore: null;
  metrics: TrendMetrics;
  sourceProvider: "REDFOX";
  /** Server-only provider snapshot. API and persistence layers must omit this field. */
  rawProviderMetadata?: Record<string, unknown>;
};

export type TrendProviderResult = {
  items: ProviderTrendItem[];
  providerRequestId?: string;
};

export interface TrendProvider {
  getHot(input: { platform: "DOUYIN" | "XIAOHONGSHU" | "GLOBAL"; window: TrendWindow; startDate: string; endDate: string }): Promise<TrendProviderResult>;
  getSurging(input: { platform: "DOUYIN"; window: TrendWindow; startDate: string; endDate: string }): Promise<TrendProviderResult>;
  getDarkHorse(input: { platform: "XIAOHONGSHU"; window: TrendWindow; startDate: string; endDate: string; keyword: string }): Promise<TrendProviderResult>;
}
