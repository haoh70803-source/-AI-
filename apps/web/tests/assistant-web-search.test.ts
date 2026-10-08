import { describe, it, expect, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { parseDeepSeekSearch, searchQueryForMessage, parseSearchResponse } from "../server/assistant/web-search";
describe("assistant web search", () => {
 it("only searches explicit or current-information requests and respects opt-out", () => {
   expect(searchQueryForMessage("写一段桌面整理建议")).toBeNull();
   expect(searchQueryForMessage("不要联网，改写已有文字")).toBeNull();
   expect(searchQueryForMessage("搜索教育部最新通知")).toBe("搜索教育部最新通知");
   expect(searchQueryForMessage("搜索这个 API Key sk-secret")).toBeNull();
 });
 it("strips URL query credentials from search words", () => { expect(searchQueryForMessage("搜索 https://example.com/news?token=private")).toBe("搜索 example.com/news"); });
 it("parses SSE results and keeps only valid links", () => {
   const result = parseSearchResponse('event: message\ndata: ' + JSON.stringify({ result: { content: [{type:"text",text:"Title: Official\nURL: https://example.com/news\nText: Verified news"}] } }) + '\n\n');
   expect(result.links).toEqual(["https://example.com/news"]);
   expect(result.content).toContain("Verified news");
 });
 it("does not present quota or provider errors as search evidence", () => {
   expect(() => parseSearchResponse(JSON.stringify({result:{_meta:{"ai.exa/rateLimited":true},content:[{type:"text",text:"Get an API key"}]}}))).toThrow("SEARCH_RATE_LIMITED");
   expect(() => parseSearchResponse(JSON.stringify({result:{isError:true}}))).toThrow("SEARCH_PROVIDER_FAILED");
   expect(() => parseSearchResponse("event: message\ndata: {}\n")).toThrow("SEARCH_NO_RESULTS");
 });
});

describe("DeepSeek native search evidence", () => {
 it("uses structured results and joins citations, never model prose", () => {
  const result = parseDeepSeekSearch({content:[{type:"thinking"},{type:"text",citations:[{url:"https://example.com/a",cited_text:"原文片段"}]},{type:"web_search_tool_result",content:[{type:"web_search_result",url:"https://example.com/a",title:"官方来源"},{type:"web_search_result",url:"https://example.com/a"},{type:"web_search_result",url:"javascript:alert(1)"}]}]});
  expect(result.links).toEqual(["https://example.com/a"]); expect(result.content).toContain("原文片段");
 });
 it("rejects a normal model answer without actual search results", () => { expect(() => parseDeepSeekSearch({content:[{type:"text"}]})).toThrow("SEARCH_NO_RESULTS"); });
});
