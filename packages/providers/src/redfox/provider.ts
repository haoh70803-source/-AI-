import type { SourceProvider } from "../contracts";
import type { ProviderResult, SourceMetadata } from "../types";
import { RedFoxClient } from "./client";
import { normalizeRedFoxSource, type ResolvedSource } from "./normalize";
import { extractRedFoxContentUrl, isSupportedDouyinUrl, isSupportedXiaohongshuUrl } from "./platform";

export class RedFoxSourceProvider implements SourceProvider {
  readonly providerName = "REDFOX";
  private lastResult?: { input: string; result: ResolvedSource; providerRequestId?: string; providerCode: string };

  constructor(private readonly client: RedFoxClient) {}

  supports(input: string): boolean {
    try {
      const url = extractRedFoxContentUrl(input).url;
      return isSupportedDouyinUrl(url) || isSupportedXiaohongshuUrl(url);
    } catch {
      return false;
    }
  }

  async resolve(input: string): Promise<ProviderResult<ResolvedSource>> {
    const originalUrl = extractRedFoxContentUrl(input).url;
    const parsed = await this.client.parseWork(originalUrl);
    const result = normalizeRedFoxSource(parsed.data, originalUrl);
    this.lastResult = { input: originalUrl, result, providerRequestId: parsed.providerRequestId, providerCode: parsed.providerCode };
    return { providerMode: "REAL", data: result };
  }

  async fetchMetadata(input: string): Promise<ProviderResult<SourceMetadata>> {
    const result = await this.resolve(input);
    return {
      providerMode: "REAL",
      data: {
        sourceType: result.data.sourceType,
        platform: result.data.sourcePlatform,
        url: result.data.resolvedUrl ?? result.data.originalUrl,
        title: result.data.title,
        author: result.data.author,
        description: result.data.description,
        thumbnailUrl: result.data.thumbnailUrl,
        raw: { ...result.data.providerMetadata, ...result.data.providerRaw },
      },
    };
  }

  async fetchMedia(input: string) {
    const originalUrl = extractRedFoxContentUrl(input).url;
    const result = this.lastResult?.input === originalUrl ? this.lastResult.result : (await this.resolve(originalUrl)).data;
    return { providerMode: "REAL" as const, data: { media: result.media } };
  }

  getLastRequestMetadata() {
    return this.lastResult
      ? { providerRequestId: this.lastResult.providerRequestId, providerCode: this.lastResult.providerCode }
      : {};
  }
}
