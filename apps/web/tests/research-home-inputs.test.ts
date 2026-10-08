import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { researchHomeInputs } from "../server/research/read-model";
import { trendStableKey } from "../server/research/trends";
import { createResearchSession, reserveResearchRun, getResearchRunStatus } from "../server/research/service";

const suffix = randomUUID();
const userId = "architecture-c-owner-" + suffix;
const viewerId = "architecture-c-viewer-" + suffix;
let workspaceId = "", otherWorkspaceId = "", materialId = "", archivedId = "", foreignMaterialId = "", foreignAccountId = "";
const accounts: string[] = [];
const identity = { provider: "C_FIXTURE", platform: "DOUYIN" as const, trendType: "HOT" as const, externalKey: suffix };
const actor = () => ({ workspaceId, userId });
beforeAll(async () => {
  const target = new URL(process.env.DATABASE_URL!);
  if (process.env.ENVIRONMENT_ID !== "LOCAL_REVIEW" || target.port !== "55436" || target.pathname !== "/content_center_upgrade_review") throw Error("ISOLATED_REVIEW_REQUIRED");
  await db.user.createMany({ data: [{ id: userId, email: userId + "@example.test", name: "C fixture" }, { id: viewerId, email: viewerId + "@example.test", name: "C viewer" }] });
  workspaceId = (await db.workspace.create({ data: { name: "C disposable", slug: "architecture-c-" + suffix, members: { create: [{ userId, role: "OWNER" }, { userId: viewerId, role: "VIEWER" }] } } })).id;
  otherWorkspaceId = (await db.workspace.create({ data: { name: "C other disposable", slug: "architecture-c-other-" + suffix } })).id;
  for (let i = 0; i < 6; i++) {
    accounts.push((await db.benchmarkAccount.create({ data: { workspaceId, createdById: userId, name: "C account " + i, platform: "DOUYIN", externalAccountId: suffix + i, enabled: i !== 5, updatedAt: new Date(2026, 0, i + 1) } })).id);
  }
  foreignAccountId = (await db.benchmarkAccount.create({ data: { workspaceId: otherWorkspaceId, createdById: userId, name: "Foreign account", platform: "DOUYIN", externalAccountId: "foreign-" + suffix } })).id;
  async function material(ws: string, status: "READY" | "ARCHIVED") {
    return (await db.sourceItem.create({ data: { workspaceId: ws, createdById: userId, sourceType: "TEXT", sourcePlatform: "GENERIC", status, title: "C material" } })).id;
  }
  materialId = await material(workspaceId, "READY"); archivedId = await material(workspaceId, "ARCHIVED"); foreignMaterialId = await material(otherWorkspaceId, "READY");
  const windowStart = new Date("2026-01-01"), windowEnd = new Date("2026-01-02");
  for (const [ws, title, observedAt] of [[workspaceId, "old", "2026-01-03"], [workspaceId, "latest", "2026-01-04"], [otherWorkspaceId, "foreign", "2026-01-05"]] as const) {
    await db.trendSnapshot.create({ data: { workspaceId: ws, ...identity, title, metrics: {}, windowStart, windowEnd, observedAt: new Date(observedAt) } });
  }
});
afterAll(async () => {
  await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId].filter(Boolean) } } });
  await db.user.deleteMany({ where: { id: { in: [userId, viewerId] } } });
  await db.$disconnect();
});
it("keeps recent order, selected enabled accounts, latest local trend and material shape", async () => {
  const result = await researchHomeInputs(actor(), { accounts: [accounts[0]! + "," + accounts[1]!, accounts[0]!], trend: trendStableKey(identity), material: materialId });
  expect(result.updatedAccounts.map(a => a.id)).toEqual([accounts[4], accounts[3], accounts[2], accounts[1]!]);
  expect(new Set(result.accounts.map(a => a.id))).toEqual(new Set(accounts.slice(0, 2)));
  expect(result.trend).toEqual({ key: trendStableKey(identity), title: "latest" });
  expect(result.selectedMaterial).toEqual({ id: materialId, title: "C material", sourceType: "TEXT" });
});
it("rejects cross-space, disabled/archived selection and invalid or over-limit links", async () => {
  const result = await researchHomeInputs(actor(), { accounts: [foreignAccountId, accounts[5]!], material: foreignMaterialId, trend: "invalid" });
  expect(result.accounts).toEqual([]); expect(result.selectedMaterial).toBeNull(); expect(result.trend).toBeNull();
  expect((await researchHomeInputs(actor(), { accounts: accounts.slice(0, 4), material: archivedId })).accounts).toEqual([]);
  expect((await researchHomeInputs(actor(), { material: archivedId })).selectedMaterial).toBeNull();
});
it("allows viewer reads but rejects no membership and disabled member/user/workspace", async () => {
  expect((await researchHomeInputs({ workspaceId, userId: viewerId }, {})).updatedAccounts).toHaveLength(4);
  await expect(researchHomeInputs({ workspaceId: otherWorkspaceId, userId }, {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { disabledAt: new Date() } });
  await expect(researchHomeInputs(actor(), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { disabledAt: null } });
  await db.user.update({ where: { id: userId }, data: { disabledAt: new Date() } });
  await expect(researchHomeInputs(actor(), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  await db.user.update({ where: { id: userId }, data: { disabledAt: null } });
  await db.workspace.update({ where: { id: workspaceId }, data: { disabledAt: new Date() } });
  await expect(researchHomeInputs(actor(), {})).rejects.toMatchObject({ code: "FORBIDDEN" });
  await db.workspace.update({ where: { id: workspaceId }, data: { disabledAt: null } });
});

it("settles lost queued dispatch without replay; only a new explicit request makes the next version", async () => {
  const session = await createResearchSession(actor(), { title: "C lost after fixture", entryTemplate: "DIRECT", requestKey: randomUUID() });
  const request = { question: "C diagnostic question", requestKey: randomUUID(), scope: {} };
  const reserved = await reserveResearchRun(actor(), session.id, request);
  expect(reserved.created).toBe(true);
  await db.researchRun.update({ where: { id: reserved.run.id }, data: { createdAt: new Date(Date.now() - 16 * 60_000) } });
  expect((await getResearchRunStatus(actor(), session.id, reserved.run.id)).status).toBe("FAILED");
  expect((await db.researchRun.findUniqueOrThrow({ where: { id: reserved.run.id } })).status).toBe("FAILED");
  const replay = await reserveResearchRun(actor(), session.id, request);
  expect(replay.created).toBe(false); expect(replay.run.id).toBe(reserved.run.id); expect(replay.run.status).toBe("FAILED");
  const retry = await reserveResearchRun(actor(), session.id, { ...request, requestKey: randomUUID() });
  expect(retry.created).toBe(true); expect(retry.run.version).toBe(2);
  expect((await db.researchRun.findUniqueOrThrow({ where: { id: reserved.run.id } })).errorCode).toBe("INTERRUPTED");
});
it("diagnoses interrupted running state without automatic provider replay", async () => {
  const session = await createResearchSession(actor(), { title: "C running interruption fixture", entryTemplate: "DIRECT", requestKey: randomUUID() });
  const reserved = await reserveResearchRun(actor(), session.id, { question: "C interrupted diagnostic", requestKey: randomUUID(), scope: {} });
  await db.researchRun.update({ where: { id: reserved.run.id }, data: { status: "RUNNING", startedAt: new Date(), createdAt: new Date(Date.now() - 16 * 60_000) } });
  expect((await getResearchRunStatus(actor(), session.id, reserved.run.id)).status).toBe("RUNNING");
  const persisted = await db.researchRun.findUniqueOrThrow({ where: { id: reserved.run.id } });
  expect(persisted.status).toBe("RUNNING"); expect(persisted.finishedAt).toBeNull();
  expect(await db.apiUsage.count({ where: { workspaceId } })).toBe(0);
});
