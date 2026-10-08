import { afterEach, describe, expect, it } from "vitest";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os"; import path from "node:path";
import { NewsStore } from "../server/research/news/store";
import { NewsSync } from "../server/research/news/sync";
import { createPublicNewsTransport, publicNewsUrl, type PublicNewsTransport } from "../server/research/news/transport";
import { safePublicLink, singaporeDay } from "../server/research/news/contracts";
const roots: string[] = [];
afterEach(async () => { for (const root of roots.splice(0)) await rm(root, { recursive: true, force: true }); });
const now = Date.parse("2026-10-06T10:00:00Z");
const item = (id: string, publishedAt: string | null = "2026-10-06T02:00:00Z") => ({ id, title: id, summary: "public summary", originalTitle: null, source: { name: "source" }, links: { aihot: "https://aihot.news/items/" + id, original: "https://example.org/" + id }, publishedAt, discoveredAt: "2026-10-06T03:00:00Z", category: "industry" as const, attribution: { name: "AIHOT", url: "https://aihot.news/" } });
const response = (body: unknown, status = 200, retryAfter: string | null = null) => ({ status, body, etag: null, retryAfter });
async function setup(transport: PublicNewsTransport) { const root = await mkdtemp(path.join(os.tmpdir(), "xin-news-test-")); roots.push(root); const store = new NewsStore(root); return { store, sync: new NewsSync(store, transport, () => now) }; }
const emptyIndex = { schemaVersion: 1, count: 0, items: [] };
describe("news public origin and privacy boundaries", () => {
  it("denies public network by default", async () => { await expect(createPublicNewsTransport()("dailies")).rejects.toMatchObject({ code: "PUBLIC_NEWS_DISABLED" }); });
  it("rejects arbitrary URLs, operations, query fields, and invalid dates", () => {
    expect(() => publicNewsUrl("https://evil.test" as never)).toThrow();
    expect(() => publicNewsUrl("snapshot", { url: "https://evil.test" })).toThrow();
    expect(() => publicNewsUrl("snapshot", { fields: "minimal" })).toThrow();
    expect(() => publicNewsUrl("snapshot", { page: "\r\nCookie: private" })).toThrow();
    expect(() => publicNewsUrl("daily", {}, "2026-02-30")).toThrow();
    expect(() => publicNewsUrl("dailies", { limit: "181" })).toThrow();
  });
  it("keeps cursor encoded under only the fixed public origin", () => {
    const url = publicNewsUrl("changes", { cursor: "https://evil.test/?private=1", limit: "100" });
    expect(url.origin).toBe("https://aihot.news"); expect(url.pathname).toBe("/api/v1/selected/changes");
    expect(url.searchParams.get("cursor")).toBe("https://evil.test/?private=1");
  });
  it("rejects unsafe original links and uses Singapore date without guessing null publication", () => {
    expect(safePublicLink("javascript:alert(1)")).toBeNull(); expect(safePublicLink("https://a:b@example.com")).toBeNull();
    expect(safePublicLink("http://example.com")).toBeNull(); expect(singaporeDay("2026-10-05T17:00:00Z")).toBe("2026-10-06");
    expect(item("unknown", null).publishedAt).toBeNull();
  });
});
describe("durable public news synchronization", () => {
  it("coalesces concurrent bootstrap and respects the hourly TTL", async () => {
    let snapshots = 0; const { store, sync } = await setup(async operation => operation === "snapshot" ? (snapshots++, response({ schemaVersion: 1, asOf: new Date(now).toISOString(), cursor: "c1", count: 1, hasMore: false, nextPage: null, items: [item("new")] })) : response(emptyIndex));
    const [a, b] = await Promise.all([sync.run(), sync.run()]); expect(a.items.new).toBeTruthy(); expect(b.cursor).toBe("c1");
    await sync.run(); expect(snapshots).toBe(1); expect((await store.read()).nextAttempt).toBe(now + 3600000);
  });
  it("does not delete older retained records when a changes batch omits them; applies explicit removal", async () => {
    const { store, sync } = await setup(async operation => operation === "changes" ? response({ schemaVersion: 1, cursor: "c2", count: 2, hasMore: false, changes: [{ op: "remove", changedAt: new Date(now).toISOString(), id: "withdrawn" }, { op: "upsert", changedAt: new Date(now).toISOString(), item: item("new") }] }) : response(emptyIndex));
    const state = await store.read(); state.cursor = "c1"; state.items = { retained: item("retained", "2026-09-01T00:00:00Z"), withdrawn: item("withdrawn") }; await store.write(state);
    const result = await sync.run(); expect(Object.keys(result.items).sort()).toEqual(["new", "retained"]); expect(result.removed).toContain("withdrawn"); expect((await store.read()).cursor).toBe("c2");
  });
  it("retains old content and cursor if a later page fails", async () => {
    let calls = 0; const { store, sync } = await setup(async () => ++calls === 1 ? response({ schemaVersion: 1, cursor: "c2", count: 1, hasMore: true, changes: [{ op: "remove", changedAt: new Date(now).toISOString(), id: "old" }] }) : response(null, 503));
    const state = await store.read(); state.cursor = "c1"; state.items.old = item("old"); await store.write(state);
    const result = await sync.run(); expect(result.items.old).toBeTruthy(); expect(result.cursor).toBe("c1"); expect(result.error).toBe("UPSTREAM_503"); expect(result.nextAttempt).toBe(now + 60000);
  });
  it("rebuilds once after 409, removes only against a complete snapshot, and preserves known historical items", async () => {
    const { store, sync } = await setup(async operation => operation === "changes" ? response(null, 409) : operation === "snapshot" ? response({ schemaVersion: 1, asOf: new Date(now).toISOString(), cursor: "recovered", count: 2, hasMore: false, nextPage: null, items: [item("historical", "2026-09-01T00:00:00Z"), item("new")] }) : response(emptyIndex));
    const state = await store.read(); state.cursor = "expired"; state.items = { historical: item("historical"), withdrawn: item("withdrawn") }; await store.write(state);
    const result = await sync.run(); expect(result.cursor).toBe("recovered"); expect(result.items.historical).toBeTruthy(); expect(result.items.withdrawn).toBeUndefined(); expect(result.removed).toContain("withdrawn");
  });
  it("rejects inconsistent snapshot pagination without committing", async () => {
    let pages = 0; const { sync } = await setup(async () => response({ schemaVersion: 1, asOf: new Date(now).toISOString(), cursor: ++pages === 1 ? "c1" : "c2", count: 1, hasMore: pages === 1, nextPage: pages === 1 ? "page2" : null, items: [item("page" + pages)] }));
    const state = await sync.run(); expect(state.cursor).toBeNull(); expect(Object.keys(state.items)).toHaveLength(0); expect(state.error).toBe("SNAPSHOT_INCONSISTENT");
  });
  it("honors Retry-After and does not retry or erase good data during cooldown", async () => {
    let requests = 0; const { store, sync } = await setup(async () => { requests++; return response(null, 429, "7200"); });
    const state = await store.read(); state.cursor = "c1"; state.items.old = item("old"); await store.write(state);
    const result = await sync.run(); expect(result.nextAttempt).toBe(now + 7200000); expect(result.error).toBe("RATE_LIMITED"); await sync.run(); expect(requests).toBe(1); expect(result.items.old).toBeTruthy();
  });
  it("makes no requests while paused and shares an interprocess lock", async () => {
    let requests = 0; const { store, sync } = await setup(async () => { requests++; return response(emptyIndex); });
    await store.setPaused(true); await sync.run(); expect(requests).toBe(0);
    const release = await store.lock(); expect(release).toBeTruthy(); expect(await store.lock()).toBeNull(); await release!(); expect(await store.lock()).toBeTruthy();
  });
  it("handles empty 304 daily responses without JSON parsing and preserves reports", async () => {
    const { store, sync } = await setup(async operation => operation === "changes" ? response({ schemaVersion: 1, cursor: "c1", count: 0, hasMore: false, changes: [] }) : response(null, 304));
    const state = await store.read(); state.cursor = "c1"; state.etags.dailies = '"etag"'; await store.write(state);
    const result = await sync.run(); expect(result.error).toBeNull(); expect(result.lastSuccess).toBe(new Date(now).toISOString());
  });
  it("does not invent daily history or permit dates missing from official index", async () => {
    const { sync } = await setup(async () => response(emptyIndex)); await expect(sync.daily("2026-10-01")).rejects.toMatchObject({ code: "DAILY_NOT_FOUND" });
  });
});

it("applies a completed withdrawal batch even when the separate daily upstream fails", async () => {
 const {store,sync}=await setup(async operation=>operation==="changes"?response({schemaVersion:1,cursor:"c2",count:1,hasMore:false,changes:[{op:"remove",changedAt:new Date(now).toISOString(),id:"withdrawn"}]}):response(null,503));
 const state=await store.read();state.cursor="c1";state.items.withdrawn=item("withdrawn");await store.write(state);
 const result=await sync.run();expect(result.items.withdrawn).toBeUndefined();expect(result.cursor).toBe("c2");expect(result.removed).toContain("withdrawn");expect(result.error).toBe("UPSTREAM_503");
});
