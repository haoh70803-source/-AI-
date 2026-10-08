import { normalizeSourceUrl } from "@content-center/core";
import { Readability } from "@mozilla/readability";
import { JSDOM } from "jsdom";
import type { IngestSourceProvider } from "./contracts";
import { IngestProviderError } from "./ingest-error";
import { fetchPublicText, type SafeFetchOptions } from "./safe-url";
import type { ProviderResult, SourceIngestInput, SourceIngestResult, SourceMetadata } from "./types";

function realResult(data: SourceIngestResult): ProviderResult<SourceIngestResult> {
  return { providerMode: "REAL", data };
}

function absoluteUrl(value: string | null, base: string): string | undefined {
  if (!value) return undefined;
  try {
    const url = new URL(value, base);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
}

function meta(document: Document, selector: string): string | undefined {
  return document.querySelector<HTMLMetaElement>(selector)?.content.trim() || undefined;
}

function normalizePlainText(value: string): string {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export class ManualTextSourceProvider implements IngestSourceProvider {
  readonly providerName = "MANUAL";

  supports(input: string): boolean {
    return input.trim().length > 0;
  }

  async ingest(input: SourceIngestInput) {
    const rawText = input.value.trim();
    if (!rawText) throw new IngestProviderError("EMPTY_TEXT", "正文不能为空。", false);
    const metadata: SourceMetadata = {
      sourceType: "TEXT",
      title: input.title?.trim() || undefined,
      description: input.notes?.trim() || undefined,
    };
    return realResult({
      metadata,
      rawText,
    });
  }

  async resolve(input: string) {
    const result = await this.ingest({ value: input });
    return { providerMode: result.providerMode, data: result.data.metadata };
  }

  async fetchMetadata(input: string) {
    return this.resolve(input);
  }

  async fetchMedia(input: string) {
    return { providerMode: "REAL" as const, data: { body: new TextEncoder().encode(input), contentType: "text/plain" } };
  }
}

export class GenericUrlSourceProvider implements IngestSourceProvider {
  readonly providerName = "GENERIC_URL";

  constructor(private readonly fetchOptions: SafeFetchOptions = {}) {}

  supports(input: string): boolean {
    try {
      const protocol = new URL(input.trim()).protocol;
      return protocol === "http:" || protocol === "https:";
    } catch {
      return false;
    }
  }

  async ingest(input: SourceIngestInput) {
    if (!this.supports(input.value)) throw new IngestProviderError("INVALID_URL", "URL 无效。", false);
    const fetched = await fetchPublicText(input.value, this.fetchOptions);
    const dom = new JSDOM(fetched.body, { url: fetched.finalUrl });
    const document = dom.window.document;
    const canonicalCandidate = absoluteUrl(document.querySelector<HTMLLinkElement>('link[rel="canonical"]')?.href ?? null, fetched.finalUrl);
    const canonicalUrl = normalizeSourceUrl(fetched.finalUrl, canonicalCandidate);
    const article = new Readability(document.cloneNode(true) as Document).parse();
    const rawText = normalizePlainText(article?.textContent ?? document.body?.textContent ?? "");
    if (rawText.length < 20) {
      throw new IngestProviderError("UNSUPPORTED_CONTENT", "网页没有可提取的有效正文。", false);
    }

    const publishedAt =
      meta(document, 'meta[property="article:published_time"]') ??
      meta(document, 'meta[name="date"]') ??
      meta(document, 'meta[name="pubdate"]');
    const metadata: SourceMetadata = {
      sourceType: "URL",
      platform: "GENERIC",
      url: canonicalUrl,
      title: article?.title?.trim() || meta(document, 'meta[property="og:title"]') || document.title.trim() || undefined,
      author: article?.byline?.trim() || meta(document, 'meta[name="author"]'),
      description: meta(document, 'meta[name="description"]') ?? meta(document, 'meta[property="og:description"]'),
      thumbnailUrl: absoluteUrl(meta(document, 'meta[property="og:image"]') ?? null, fetched.finalUrl),
      publishedAt,
      raw: { finalUrl: fetched.finalUrl, contentType: fetched.contentType, contentLength: rawText.length },
    };
    return realResult({ metadata, rawText });
  }

  async resolve(input: string) {
    const result = await this.ingest({ value: input });
    return { providerMode: result.providerMode, data: result.data.metadata };
  }

  async fetchMetadata(input: string) {
    return this.resolve(input);
  }

  async fetchMedia(input: string) {
    const fetched = await fetchPublicText(input, this.fetchOptions);
    return {
      providerMode: "REAL" as const,
      data: { body: new TextEncoder().encode(fetched.body), contentType: fetched.contentType },
    };
  }
}

export class MockVideoSourceProvider implements IngestSourceProvider {
  readonly providerName = "MOCK_VIDEO";

  supports(input: string): boolean {
    return /^mock:\/\/video\/[a-z0-9-]+$/i.test(input.trim());
  }

  async ingest(input: SourceIngestInput) {
    if (!this.supports(input.value)) {
      throw new IngestProviderError("UNSUPPORTED_VIDEO", "本阶段仅支持 mock://video/* 测试入口。", false);
    }
    console.warn("MOCK_PROVIDER_USED", { provider: this.providerName });
    const fullText = "MOCK MODE：这是用于验证视频采集流程的模拟 Transcript。";
    return {
      providerMode: "MOCK" as const,
      data: {
        metadata: {
          sourceType: "VIDEO",
          platform: "OTHER",
          url: input.value,
          title: input.title?.trim() || "Mock Video",
          description: "MOCK MODE",
        },
        rawText: fullText,
        transcript: { language: "zh", durationMs: 10_000, fullText, segments: [{ startMs: 0, endMs: 10_000, text: fullText }] },
      },
    };
  }

  async resolve(input: string) {
    const result = await this.ingest({ value: input });
    return { providerMode: result.providerMode, data: result.data.metadata };
  }

  async fetchMetadata(input: string) {
    return this.resolve(input);
  }

  async fetchMedia(input: string) {
    if (!this.supports(input)) throw new IngestProviderError("UNSUPPORTED_VIDEO", "不支持的视频测试地址。", false);
    console.warn("MOCK_PROVIDER_USED", { provider: this.providerName });
    return { providerMode: "MOCK" as const, data: { body: new Uint8Array(), contentType: "video/mock" } };
  }
}
