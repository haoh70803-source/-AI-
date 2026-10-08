import { reserveExperienceUsage, ExperienceLimitError } from "@content-center/worker/experience-limits";
import "server-only";
import { IntegrationService } from "@content-center/integrations";
import { GenericUrlSourceProvider, providerFetch } from "@content-center/providers";
import { searchDiscoveryContent } from "../discovery/service";
import { refreshTrends } from "../discovery/trends/service";
export type SearchEvidence = { provider: string; query: string; retrievedAt: string; content: string; links: string[]; warning?: string };
export function searchQueryForMessage(message: string): string | null {
  if (/(?:不要|不用|无需|禁止)(?:再)?(?:联网|搜索|上网)/u.test(message)) return null;
  if (/^(?:你|这个|这里|现在).{0,10}(?:能|可以|支持|有没有).{0,8}(?:联网|搜索)(?:吗|么|能力|功能|？|\?)?$/u.test(message.trim())) return null;
  if (!/(联网|上网|搜索|搜一下|查一下|查找|最新|今日|今天.*热点|最近.*(?:热点|新闻|政策)|实时)/u.test(message)) return null;
  if (/(?:api[_ -]?key|密码|密钥|身份证|银行卡|sk-[a-z0-9]|Bearer\s)/iu.test(message)) return null;
  return message.replace(/https?:\/\/[^\s]+/gu, value => { try { const url = new URL(value); return url.hostname + url.pathname; } catch { return ""; } }).slice(0, 300);
}
export function parseSearchResponse(text: string): { content: string; links: string[] } {
  const payloads = text.trim().startsWith("{") ? [text] : text.split(/\r?\n/u).filter(line => line.startsWith("data: ")).map(line => line.slice(6));
  let body = "";
  for (const payload of payloads) {
    let data; try { data = JSON.parse(payload); } catch { continue; }
    if (data.result?._meta?.["ai.exa/rateLimited"]) throw new Error("SEARCH_RATE_LIMITED");
    if (data.error || data.result?.isError) throw new Error("SEARCH_PROVIDER_FAILED");
    body += (data.result?.content || []).filter((item: { type: string; text?: string }) => item.type === "text").map((item: { text: string }) => item.text).join("\n");
  }
  if (/rate limit|api key|unauthorized/i.test(body) && !/https?:.*\n.*https?:/u.test(body)) throw new Error("SEARCH_RATE_LIMITED");
  const links = [...new Set(body.match(/https?:\/\/[^\s<>"\])]+/gu) || [])].filter(value => { try { const url = new URL(value); return !url.username && !url.password && !/(?:localhost|127\.0\.0\.1)/i.test(url.hostname); } catch { return false; } }).slice(0, 6);
  if (!body.trim() || !links.length) throw new Error("SEARCH_NO_RESULTS");
  return { content: body.slice(0, 10_000), links };
}
export async function exaSearch(query: string, apiKey: string, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(25_000);
  const response = await providerFetch("https://mcp.exa.ai/mcp", { method: "POST", headers: { "content-type": "application/json", accept: "application/json, text/event-stream", "x-api-key": apiKey }, body: JSON.stringify({ jsonrpc: "2.0", id: 1, method: "tools/call", params: { name: "web_search_exa", arguments: { query, objective: "回答当前检索问题，优先官网、原始报道和近期发布资料，保留出处及发布日期。", numResults: 5 } } }), signal: signal ? AbortSignal.any([signal, timeout]) : timeout });
  if (!response.ok) throw new Error(response.status === 429 ? "SEARCH_RATE_LIMITED" : "SEARCH_PROVIDER_FAILED");
  const reader = response.body?.getReader(); if (!reader) throw new Error("SEARCH_NO_RESULTS");
  const chunks: Uint8Array[] = []; let size = 0;
  try { while (true) { const {value,done} = await reader.read(); if (done) break; size += value.length; if (size > 300_000) throw new Error("SEARCH_RESPONSE_TOO_LARGE"); chunks.push(value); } } finally { await reader.cancel().catch(() => undefined); }
  return parseSearchResponse(Buffer.concat(chunks).toString("utf8"));
}
type NativeSearchBlock = { type: string; content?: Array<{ type: string; url?: string; title?: string; page_age?: string }>; citations?: Array<{ url?: string; cited_text?: string }> };
export function parseDeepSeekSearch(body: { content?: NativeSearchBlock[] }) {
  const blocks = body.content ?? [];
  const snippets = new Map<string,string>();
  for (const block of blocks) if (block.type === "text") for (const citation of block.citations ?? []) if (citation.url && citation.cited_text) snippets.set(citation.url, citation.cited_text.slice(0, 1800));
  const seen = new Set<string>();
  const sources = blocks.filter(block => block.type === "web_search_tool_result").flatMap(block => Array.isArray(block.content) ? block.content : []).flatMap(item => {
    if (item.type !== "web_search_result" || !item.url || seen.has(item.url)) return [];
    try { const url = new URL(item.url); if (!["http:","https:"].includes(url.protocol) || url.username || url.password) return []; } catch { return []; }
    seen.add(item.url);
    return [{ title: item.title || item.url, url: item.url, publishedAt: item.page_age || null, excerpt: snippets.get(item.url) || null }];
  }).slice(0, 6);
  if (!sources.length) throw new Error("SEARCH_NO_RESULTS");
  return { content: JSON.stringify(sources), links: sources.map(item => item.url) };
}
export async function deepSeekNativeSearch(query: string, config: Record<string,unknown>, signal?: AbortSignal) {
  // Only send official DeepSeek credentials to its native search endpoint.
  if (config.provider !== "DEEPSEEK" || new URL(String(config.baseUrl)).origin !== "https://api.deepseek.com") throw new Error("SEARCH_PROVIDER_UNSUPPORTED");
  const timeout = AbortSignal.timeout(60_000);
  const response = await providerFetch("https://api.deepseek.com/anthropic/v1/messages", { method: "POST", headers: { "content-type": "application/json", "anthropic-version": "2023-06-01", "x-api-key": String(config.apiKey), authorization: `Bearer ${config.apiKey}` }, body: JSON.stringify({ model: config.model, max_tokens: 2200, messages: [{ role: "user", content: [{ type: "text", text: `Perform a web search for the query: ${query}. Include citations to the sources.` }] }], tools: [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }] }), signal: signal ? AbortSignal.any([signal,timeout]) : timeout });
  if (!response.ok) throw new Error(response.status === 429 ? "SEARCH_RATE_LIMITED" : "SEARCH_PROVIDER_FAILED");
  return parseDeepSeekSearch(await response.json());
}
export async function searchForAssistant(input: { workspaceId: string; userId: string; query: string; signal?: AbortSignal }): Promise<SearchEvidence> {
  let release = async () => {};
  let usedProvider = /抖音|小红书/u.test(input.query) ? "RedFox" : "Exa";
  const base = { query: input.query, retrievedAt: new Date().toISOString() };
  try {
    input.signal?.throwIfAborted();
    release = await reserveExperienceUsage({ ...input, operation: "SEARCH" });
    if (/抖音|小红书/u.test(input.query)) {
      const platform = /小红书/u.test(input.query) ? "XIAOHONGSHU" as const : "DOUYIN" as const;
      if (/热榜|热搜|热点|热门榜/u.test(input.query)) {
        const result = await refreshTrends({ ...input, platform, type: "HOT", window: "TODAY", force: false });
        input.signal?.throwIfAborted();
        return { ...base, provider: "RedFox", content: JSON.stringify(result.items.slice(0, 8).map(item => ({ title: item.title, rank: item.rank, observedAt: item.observedAt, summary: item.summary }))), links: ["/research/trends"], warning: "这是平台今日热门作品榜快照，不等于新闻热搜榜；采集时间不是作品发布时间或新闻发生时间。" };
      }
      const result = await searchDiscoveryContent({ ...input, platform, sort: "LATEST" });
      input.signal?.throwIfAborted();
      const items = result.items.slice(0, 5);
      if (!items.length) throw new Error("SEARCH_NO_RESULTS");
      return { ...base, provider: "RedFox", content: JSON.stringify(items.map(item => ({ title: item.title, description: item.description, publishedAt: item.publishedAt, url: item.originalUrl, author: item.authorName }))), links: items.map(item => item.originalUrl), warning: result.cached ? "使用五分钟内的搜索缓存。" : undefined };
    }
    const service = new IntegrationService();
    const llm = await service.getDecryptedIntegrationConfig(input.workspaceId, "LLM");
    if (llm?.provider === "DEEPSEEK" && new URL(String(llm.baseUrl)).origin === "https://api.deepseek.com") {
      usedProvider = "DeepSeek 联网搜索";
      const releaseModel = await reserveExperienceUsage({...input,operation:"AI"});
      const result = await (async () => { try { return await deepSeekNativeSearch(input.query,llm,input.signal); } finally { await releaseModel(); } })();
      const reader = new GenericUrlSourceProvider({ timeoutMs: 8_000, maxBytes: 1_000_000, maxRedirects: 2 });
      const pages = await Promise.allSettled(result.links.slice(0, 2).map(async url => {
        input.signal?.throwIfAborted();
        const page = await reader.ingest({ value: url });
        return { url, title: page.data.metadata.title, publishedAt: page.data.metadata.publishedAt, excerpt: page.data.rawText?.slice(0, 4500) };
      }));
      input.signal?.throwIfAborted();
      const readable = pages.flatMap(page => page.status === "fulfilled" && page.value.excerpt ? [page.value] : []);
      return { ...base, provider: "DeepSeek 联网搜索", ...result, content: JSON.stringify({ searchResults: JSON.parse(result.content), openedPages: readable }), warning: readable.length ? undefined : "本次只获得搜索标题和来源链接，网页正文未能读取。" };
    }
    const config = await service.getDecryptedIntegrationConfig(input.workspaceId, "WEB_SEARCH");
    if (!config || typeof config.apiKey !== "string") return { ...base, provider: "Exa", content: "", links: [], warning: "当前模型未提供可用的原生搜索。可使用已配置的官方 DeepSeek 模型，或在设置中配置 Exa 搜索。" };
    const result = await exaSearch(input.query, config.apiKey, input.signal);
    return { ...base, provider: "Exa", ...result };
  } catch (error) {
    if (input.signal?.aborted) throw error;
    return { ...base, provider: usedProvider, content: "", links: [], warning: error instanceof ExperienceLimitError ? error.message : error instanceof Error && error.message === "SEARCH_RATE_LIMITED" ? "搜索服务额度不足或请求过于频繁，请检查搜索服务配置。" : "本次联网检索未取得可用结果，请稍后重试。" };
  } finally { await release(); }
}
