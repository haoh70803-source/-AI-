import { randomUUID } from "node:crypto";
import { mkdtemp, rm } from "node:fs/promises"; import path from "node:path"; import os from "node:os";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
vi.mock("../server/api-access", () => ({ getApiWorkspaceContext: vi.fn(), apiError: (error: string, status: number, message?: string) => Response.json({ error, message }, { status }) }));
import { db } from "@content-center/db";
import { getApiWorkspaceContext } from "../server/api-access";
import { GET, POST } from "../app/api/research/news/route";
import { POST as preference } from "../app/api/research/preferences/route";
import { newsRuntime } from "../server/research/news/runtime";
let workspaceId = "", userId = "", otherId = "", root = "";
const asUser = (id: string) => vi.mocked(getApiWorkspaceContext).mockResolvedValue({ workspace: { id: workspaceId }, session: { user: { id } } } as never);
const req = (body: object, origin = "http://localhost:3030") => new Request("http://localhost:3030/api/research/news", { method: "POST", headers: { "Content-Type": "application/json", Origin: origin }, body: JSON.stringify(body) });
beforeAll(async () => {
 if (new URL(process.env.DATABASE_URL!).port !== "55436") throw Error("ISOLATED_NEWS_TEST_ONLY");
 root = await mkdtemp(path.join(os.tmpdir(), "xin-news-api-")); vi.stubEnv("AIHOT_NEWS_CACHE_ROOT", root); vi.stubEnv("AIHOT_PUBLIC_NEWS_ENABLED", "false");
 const target = await db.user.findFirst({ where: { email: "2629194738@qq.com", systemRole: "SYSTEM_ADMIN", disabledAt: null }, select: { id: true } });
 if (!target) throw Error("ISOLATED_EXISTING_ADMIN_FIXTURE_REQUIRED"); userId = target.id;
 otherId = (await db.user.create({ data: { name: "Disposable news scope test", email: "news-scope-" + randomUUID() + "@example.test", systemRole: "SYSTEM_ADMIN" } })).id;
 workspaceId = (await db.workspace.create({ data: { name: "Disposable news scope", slug: randomUUID(), members: { create: [{ userId, role: "OWNER" }, { userId: otherId, role: "EDITOR" }] } } })).id;
 const state = await newsRuntime().store.read();
 state.items.public = { id: "public", title: "Public news", originalTitle: null, summary: "public", source: { name: "AIHOT source" }, links: { aihot: "https://aihot.news/", original: "https://example.test/" }, publishedAt: null, discoveredAt: new Date().toISOString(), category: "industry", attribution: { name: "AIHOT", url: "https://aihot.news/" } };
 await newsRuntime().store.write(state);
 await db.researchObjectPreference.create({ data: { workspaceId, userId: otherId, kind: "NEWS", objectKey: "foreign-private-preference", followedAt: new Date() } });
});
afterAll(async () => {
 if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
 if (otherId) await db.user.delete({ where: { id: otherId } });
 await rm(root, { recursive: true, force: true }); vi.unstubAllEnvs(); await db.$disconnect();
});
it("denies unauthenticated reads and writes before private state is returned", async () => {
 vi.mocked(getApiWorkspaceContext).mockResolvedValue(null); expect((await GET()).status).toBe(401); expect((await POST(req({ action: "SYNC" }))).status).toBe(401);
});
it("denies another active system admin even within the same workspace on every API", async () => {
 asUser(otherId); expect((await GET()).status).toBe(403); expect((await POST(req({ action: "PAUSE", paused: true }))).status).toBe(403);
 expect((await preference(req({ kind: "NEWS", key: "public", action: "FOLLOW" }))).status).toBe(403);
});
it("returns only the authenticated person's preferences with private no-store caching", async () => {
 asUser(userId); const response = await GET(); expect(response.status).toBe(200); expect(response.headers.get("cache-control")).toBe("private, no-store");
 const body = await response.json(); expect(body.preferences).toEqual([]); expect(body.items).toHaveLength(1);
});
it("persists personal favorite/read-later/read independently without starting a provider", async () => {
 asUser(userId);
 for (const [kind, action] of [["NEWS", "FOLLOW"], ["NEWS_LATER", "FOLLOW"], ["NEWS", "VIEW"]]) expect((await preference(req({ kind, key: "public", action }))).status).toBe(200);
 const preferences = (await (await GET()).json()).preferences; expect(preferences.find((row: {kind: string}) => row.kind === "NEWS")).toMatchObject({ followed: true, read: true });
 expect(preferences.find((row: {kind: string}) => row.kind === "NEWS_LATER")).toMatchObject({ followed: true });
 expect((await POST(req({ action: "SYNC" }))).status).toBe(409);
});
it("rejects foreign origin and unknown item identities; pause is durable", async () => {
 asUser(userId); expect((await preference(req({ kind: "NEWS", key: "public", action: "FOLLOW" }, "https://foreign.invalid"))).status).toBe(403);
 expect((await preference(req({ kind: "NEWS", key: "not-cached", action: "FOLLOW" }))).status).toBe(404);
 expect((await POST(req({ action: "PAUSE", paused: true }))).status).toBe(200); expect(await newsRuntime().store.paused()).toBe(true);
 expect((await POST(req({ action: "DAILY", date: "2026-10-01" }))).status).toBe(404);
});
