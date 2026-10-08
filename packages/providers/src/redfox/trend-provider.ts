import { RedFoxClient } from "./client";
import { RedFoxError } from "./errors";
import { normalizeTrendPage } from "./trend-normalize";
import type { TrendProvider, TrendProviderResult } from "./trends";

export class RedFoxTrendProvider implements TrendProvider {
  constructor(private readonly client: RedFoxClient) {}

  async getHot(input: Parameters<TrendProvider["getHot"]>[0]): Promise<TrendProviderResult> {
    const response = input.platform === "DOUYIN"
      ? await this.client.getDouyinHot({ startDate: input.startDate, endDate: input.endDate })
      : input.platform === "XIAOHONGSHU"
        ? await this.client.getXiaohongshuHot({ window: input.window, rankDate: input.endDate })
        : await this.client.getGlobalHotspot({ startDate: `${input.startDate} 00:00:00`, endDate: `${input.endDate} 23:59:59` });
    return { items: normalizeTrendPage(input.platform, "HOT", response.data), providerRequestId: response.providerRequestId };
  }

  async getSurging(input: Parameters<TrendProvider["getSurging"]>[0]): Promise<TrendProviderResult> {
    const response = await this.client.getDouyinSurging(input);
    return { items: normalizeTrendPage("DOUYIN", "SURGING", response.data), providerRequestId: response.providerRequestId };
  }

  async getDarkHorse(input: Parameters<TrendProvider["getDarkHorse"]>[0]): Promise<TrendProviderResult> {
    if (!input.keyword.trim()) throw new RedFoxError("REDFOX_BAD_REQUEST", "小红书黑马趋势需要明确的关注主题。", false, 400);
    const response = await this.client.getXiaohongshuDarkHorse({ keyword: input.keyword, startDate: input.startDate });
    return { items: normalizeTrendPage("XIAOHONGSHU", "DARK_HORSE", response.data), providerRequestId: response.providerRequestId };
  }
}
