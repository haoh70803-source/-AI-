import { afterEach, beforeEach, expect, it, vi } from "vitest";
const mocks = vi.hoisted(() => ({ member: vi.fn(), search: vi.fn(), connection: vi.fn(), chunks: vi.fn(), get: vi.fn(), set: vi.fn() }));
vi.mock("server-only", () => ({}));
vi.mock("@content-center/integrations", () => ({ feishuMember: mocks.member, searchFeishu: mocks.search }));
vi.mock("@content-center/db", () => ({ db: { feishuConnection: { findUnique: mocks.connection }, feishuChunk: { findMany: mocks.chunks } } }));
vi.mock("../server/assistant/cache", () => ({ assistantCache: { get: mocks.get, set: mocks.set }, assistantCacheKey: (namespace: string, scope: unknown) => namespace + JSON.stringify(scope) }));
import { feishuContextItems } from "../server/feishu/service";
const actor = { workspaceId: "w", userId: "u" };
const match = { id: "chunk", sourceItemId: "source", title: "客户沟通", url: "https://example.feishu.cn/docx/test", category: "KNOWLEDGE", text: "新正文", version: "2", checkedAt: new Date().toISOString() };
beforeEach(() => { mocks.member.mockResolvedValue({}); mocks.connection.mockResolvedValue({ id: "connection", enabled: true, revision: 1 }); mocks.get.mockResolvedValue(null); mocks.set.mockResolvedValue(undefined); mocks.search.mockResolvedValue([match]); mocks.chunks.mockResolvedValue([]); });
afterEach(() => vi.resetAllMocks());
it("stores only scoped chunk identifiers, not document text or completed creative replies", async () => {
  expect((await feishuContextItems(actor, "客户沟通"))[0]?.ownership).toBe("EXTERNAL");
  expect(mocks.set).toHaveBeenCalledWith(expect.stringContaining('"userId":"u"'), '["chunk"]', 30);
});
it("reauthorizes cache hits and reads the latest allowed document version", async () => {
  mocks.get.mockResolvedValue('["chunk"]'); mocks.chunks.mockResolvedValue([{ id: "chunk", text: "更新后的正文", document: { sourceItemId: "source", originalUrl: match.url, category: "KNOWLEDGE", remoteRevision: "3", checkedAt: new Date(), sourceItem: { title: match.title } } }]);
  const result = await feishuContextItems(actor, "客户沟通"); expect(result[0]?.version).toBe("3"); expect(result[0]?.content).toContain("更新后的正文"); expect(mocks.search).not.toHaveBeenCalled();
  expect(mocks.chunks.mock.calls[0]![0].where.document).toMatchObject({ workspaceId: "w", connectionId: "connection", state: "READY", connection: { enabled: true, revision: 1 }, sourceItem: { status: "READY" } });
});
it("falls back to fresh authorized retrieval when cached chunks expired or were removed", async () => {
  mocks.get.mockResolvedValue('["removed"]'); await feishuContextItems(actor, "客户沟通"); expect(mocks.search).toHaveBeenCalledOnce();
});
it("rejects disabled members before cache access and respects disconnected sources", async () => {
  mocks.member.mockRejectedValueOnce(new Error("revoked")); await expect(feishuContextItems(actor, "客户沟通")).rejects.toThrow("revoked"); expect(mocks.get).not.toHaveBeenCalled();
  mocks.connection.mockResolvedValue({ id: "connection", enabled: false, revision: 2 }); expect(await feishuContextItems(actor, "客户沟通")).toEqual([]); expect(mocks.get).not.toHaveBeenCalled();
});
