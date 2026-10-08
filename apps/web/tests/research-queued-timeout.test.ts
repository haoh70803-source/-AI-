import { randomUUID } from "node:crypto";
import { setTimeout as delay } from "node:timers/promises";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ actor: vi.fn(), after: vi.fn() }));
vi.mock("next/server", () => ({ after: mocks.after }));
vi.mock("../server/research/api", () => ({
  researchApiActor: mocks.actor,
  researchApiError: (error: { code?: string; status?: number }) => Response.json({ error: error.code }, { status: error.status ?? 500 }),
}));
import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { createResearchSession, reserveResearchRun, getResearchRunStatus, getResearchSession, executeResearchRun, researchRunExpired, RESEARCH_LEASE_MS } from "../server/research/service";
import { POST } from "../app/api/research/sessions/[id]/runs/route";

describe("R1 scoped unstarted queued timeout (review only)", () => {
  const suffix = randomUUID();
  const userId = "architecture-r1-owner-" + suffix;
  const otherId = "architecture-r1-other-" + suffix;
  let workspaceId = "", otherWorkspaceId = "";
  const actor = () => ({ workspaceId, userId });
  beforeAll(async () => {
    const url = new URL(process.env.DATABASE_URL!);
    if (process.env.ENVIRONMENT_ID !== "LOCAL_REVIEW" || url.port !== "55436" || url.pathname !== "/content_center_upgrade_review" || process.env.LOCAL_REVIEW_OFFLINE !== "true") throw Error("ISOLATED_REVIEW_REQUIRED");
    await db.user.createMany({ data: [{ id: userId, name: "R1 fixture", email: userId + "@example.test" }, { id: otherId, name: "R1 other", email: otherId + "@example.test" }] });
    workspaceId = (await db.workspace.create({ data: { name: "R1 disposable", slug: "architecture-r1-" + suffix, members: { create: [{ userId, role: "OWNER" }, { userId: otherId, role: "EDITOR" }] } } })).id;
    otherWorkspaceId = (await db.workspace.create({ data: { name: "R1 other", slug: "architecture-r1-other-" + suffix, members: { create: { userId, role: "OWNER" } } } })).id;
  });
  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId].filter(Boolean) } } });
    await db.user.deleteMany({ where: { id: { in: [userId, otherId] } } });
    await db.$disconnect();
  });
  beforeEach(() => { mocks.actor.mockReset().mockResolvedValue(actor()); mocks.after.mockReset(); });
  async function seed(ago = RESEARCH_LEASE_MS + 60_000) {
    const session = await createResearchSession(actor(), { title: "R1", entryTemplate: "DIRECT", requestKey: randomUUID() });
    const input = { question: "R1 diagnostic question", requestKey: randomUUID(), scope: {} };
    const result = await reserveResearchRun(actor(), session.id, input);
    await db.researchRun.update({ where: { id: result.run.id }, data: { createdAt: new Date(Date.now() - ago) } });
    return { session, input, id: result.run.id };
  }
  const row = (id: string) => db.researchRun.findUniqueOrThrow({ where: { id } });
  const request = (input: unknown) => new Request("http://localhost:3020/api/research/runs", { method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(input) });

  it("persists expired queued failure on status read while preserving identity/version and never invoking a provider", async () => {
    const f = await seed(); const before = await row(f.id);
    expect((await getResearchRunStatus(actor(), f.session.id, f.id)).status).toBe("FAILED");
    const after = await row(f.id);
    expect(after).toMatchObject({ id: before.id, requestKey: before.requestKey, version: before.version, question: before.question, inputScope: before.inputScope, status: "FAILED", stage: "FAILED", errorCode: "INTERRUPTED", startedAt: null, aiRunId: null });
    expect(after.finishedAt).not.toBeNull();
    let calls = 0;
    const provider = new MockLLMProvider(() => { calls++; throw Error("R1 must not invoke"); });
    await executeResearchRun(actor(), f.session.id, f.id, { runtime: { provider, providerName: "FIXTURE", model: "r1-fixture", mode: "FIXTURE" } });
    expect(calls).toBe(0);
    expect(await db.apiUsage.count({ where: { workspaceId } })).toBe(0);
  });
  it("settles only the requested session and leaves fresh queued work unchanged", async () => {
    const old = await seed(), unrelated = await seed(), fresh = await seed(RESEARCH_LEASE_MS - 60_000);
    expect((await getResearchSession(actor(), old.session.id)).runs[0]?.status).toBe("FAILED");
    expect((await row(unrelated.id)).status).toBe("QUEUED");
    const before = await row(fresh.id);
    expect((await getResearchRunStatus(actor(), fresh.session.id, fresh.id)).status).toBe("QUEUED");
    expect(await row(fresh.id)).toEqual(before);
  });
  it.each(["RUNNING", "COMPLETED", "FAILED"] as const)("never settles %s or replays its same request", async status => {
    const f = await seed();
    const before = await db.researchRun.update({ where: { id: f.id }, data: { status, startedAt: status === "RUNNING" ? new Date() : null, finishedAt: status === "RUNNING" ? null : new Date(), errorMessage: status === "FAILED" ? "existing failure" : null } });
    const result = await getResearchRunStatus(actor(), f.session.id, f.id);
    expect(result.status).toBe(status);
    if (status === "RUNNING") expect(result.errorMessage).toContain("避免重复调用");
    const replay = await reserveResearchRun(actor(), f.session.id, f.input);
    expect(replay.created).toBe(false); expect(replay.run.status).toBe(status);
    expect(await row(f.id)).toEqual(before);
  });
  it("does not treat inconsistent queued execution markers as not-started", async () => {
    for (const marker of ["startedAt", "finishedAt", "aiRunId"] as const) {
      const f = await seed();
      if (marker === "aiRunId") {
        const ai = await db.aIRun.create({ data: { workspaceId, userId, action: "ANALYZE_SOURCES", provider: "R1_FIXTURE", model: "fixture", promptVersion: 1, inputSummary: {} } });
        await db.researchRun.update({ where: { id: f.id }, data: { aiRunId: ai.id } });
      } else await db.researchRun.update({ where: { id: f.id }, data: { [marker]: new Date() } });
      const before = await row(f.id);
      expect(researchRunExpired(before)).toBe(false);
      expect((await getResearchRunStatus(actor(), f.session.id, f.id)).status).toBe("QUEUED");
      expect(await row(f.id)).toEqual(before);
    }
  });
  it("same-key HTTP replay reports the original failed row and schedules nothing; explicit new key schedules one new version", async () => {
    const f = await seed();
    const replay = await POST(request(f.input), { params: Promise.resolve({ id: f.session.id }) });
    expect(replay.status).toBe(202);
    expect(await replay.json()).toMatchObject({ id: f.id, status: "FAILED", created: false });
    expect(mocks.after).not.toHaveBeenCalled();
    const retry = await POST(request({ ...f.input, requestKey: randomUUID() }), { params: Promise.resolve({ id: f.session.id }) });
    expect(retry.status).toBe(202);
    expect(await retry.json()).toMatchObject({ status: "QUEUED", created: true });
    expect(mocks.after).toHaveBeenCalledTimes(1); // callback is deliberately not run
    expect(await db.researchRun.count({ where: { sessionId: f.session.id } })).toBe(2);
    expect((await row(f.id)).version).toBe(1);
  });
  it("rejects new requests while an old running result is uncertain and leaves it untouched", async () => {
    const f = await seed();
    const before = await db.researchRun.update({ where: { id: f.id }, data: { status: "RUNNING", startedAt: new Date() } });
    await expect(reserveResearchRun(actor(), f.session.id, { ...f.input, requestKey: randomUUID() })).rejects.toMatchObject({ code: "RUN_ACTIVE" });
    expect(await row(f.id)).toEqual(before);
    expect(await db.researchRun.count({ where: { sessionId: f.session.id } })).toBe(1);
  });
  it("rejects private-session and workspace substitution before any settlement", async () => {
    const f = await seed(), before = await row(f.id);
    await expect(getResearchRunStatus({ workspaceId, userId: otherId }, f.session.id, f.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    await expect(getResearchRunStatus({ workspaceId: otherWorkspaceId, userId }, f.session.id, f.id)).rejects.toMatchObject({ code: "NOT_FOUND" });
    expect(await row(f.id)).toEqual(before);
  });
  it("rejects disabled member, user and workspace before any settlement", async () => {
    const f = await seed(), before = await row(f.id);
    for (const target of ["member", "user", "workspace"]) {
      if (target === "member") await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { disabledAt: new Date() } });
      if (target === "user") await db.user.update({ where: { id: userId }, data: { disabledAt: new Date() } });
      if (target === "workspace") await db.workspace.update({ where: { id: workspaceId }, data: { disabledAt: new Date() } });
      await expect(getResearchRunStatus(actor(), f.session.id, f.id)).rejects.toMatchObject({ code: "FORBIDDEN" });
      expect(await row(f.id)).toEqual(before);
      if (target === "member") await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { disabledAt: null } });
      if (target === "user") await db.user.update({ where: { id: userId }, data: { disabledAt: null } });
      if (target === "workspace") await db.workspace.update({ where: { id: workspaceId }, data: { disabledAt: null } });
    }
  });
  it("atomic settlement rechecks queued state after a concurrent claim holds the real row lock", async () => {
    const f = await seed(); let pending: ReturnType<typeof getResearchRunStatus> | undefined;
    await db.$transaction(async tx => {
      await tx.$queryRaw`SELECT "id" FROM "ResearchRun" WHERE "id" = ${f.id} FOR UPDATE`;
      pending = getResearchRunStatus(actor(), f.session.id, f.id);
      await delay(100);
      await tx.researchRun.updateMany({ where: { id: f.id, status: "QUEUED", startedAt: null }, data: { status: "RUNNING", startedAt: new Date(), stage: "READING" } });
    }, { timeout: 10000 });
    expect((await pending)?.status).toBe("RUNNING");
    expect((await row(f.id)).finishedAt).toBeNull();
  });
  it("concurrent status/replay requests settle once and cannot create a replacement", async () => {
    const f = await seed();
    const [status, replay, session] = await Promise.all([getResearchRunStatus(actor(), f.session.id, f.id), reserveResearchRun(actor(), f.session.id, f.input), getResearchSession(actor(), f.session.id)]);
    expect(status.status).toBe("FAILED"); expect(replay.created).toBe(false); expect(replay.run.id).toBe(f.id);
    expect(session.runs[0]?.status).toBe("FAILED");
    expect(await db.researchRun.count({ where: { sessionId: f.session.id } })).toBe(1);
    expect(await db.apiUsage.count({ where: { workspaceId } })).toBe(0);
  });

});
