import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { importWorkflowSkill, deleteMethod, createMethodFromAnalysis, createMethodSchema, getMethod, updateMethodContent, updateMethodSchema, updateMethodStatus } from "../server/methods/service";

describe("my methods", () => {
  const suffix = randomUUID();
  const userAId = `methods-a-${suffix}`;
  const userBId = `methods-b-${suffix}`;
  let workspaceAId = "";
  let workspaceBId = "";
  let sourceId = "";
  let transcriptId = "";
  let analysisId = "";

  const quote = "先说清问题，再给出自己的处理方式。";
  const evidence = [{ quote, segmentIndex: 0, startMs: 1_000, endMs: 4_000 }];
  const understanding = {
    whatItSays: { summary: "先确认问题，再给出处理方式。", keyPoints: ["问题", "方法"], evidence },
    expression: {
      audience: { summary: "面向需要解决问题的人。", evidence: [{ quote }] },
      opening: { summary: "先说问题。", evidence: [{ quote }] },
      progression: { summary: "从问题推进到方法。", steps: ["问题", "方法"], evidence: [{ quote }] },
      support: { summary: "用具体处理方式支撑。", evidence: [{ quote }] },
      emotionalOrRhetoricalShift: { summary: "从焦虑转向行动。", evidence: [{ quote }] },
      ending: { summary: "落到行动。", evidence: [{ quote }] },
    },
    methods: { evidenceStatus: "SINGLE_SOURCE_DRAFT" as const, reason: "只有一条素材，先试用。", items: [{ title: "先说问题，再给方法", howTo: ["先说清问题，再给出处理方式。"], applicable: ["需要解释问题时"], boundaries: ["不能当作稳定规律。"], evidence }] },
    reusable: [{ content: "先说问题", whyUseful: "降低理解门槛。" }],
    doNotCopy: [],
    uncertain: [],
  };

  it("imports, versions and deletes raw Markdown with workspace and owner isolation", async () => {
    const raw = "# 自由 Skill\n\n先判断任务，再写一段短文。";
    const method = await importWorkflowSkill({ workspaceId: workspaceAId, ownerUserId: userAId, markdown: raw });
    expect(method.current.workflowContract?.rawMarkdown).toBe(raw);
    await expect(deleteMethod({ workspaceId: workspaceBId, ownerUserId: userBId, methodId: method.id })).rejects.toMatchObject({ code: "METHOD_NOT_FOUND" });
    const changed = await updateMethodContent({ workspaceId: workspaceAId, ownerUserId: userAId, methodId: method.id, expectedVersion: 1, title: "新名称", steps: method.current.steps, applicableScenarios: method.current.applicableScenarios, boundaries: method.current.boundaries, markdown: raw + "\n不要虚构。" });
    expect(changed.current.workflowContract?.rawMarkdown).toContain("不要虚构。");
    expect(changed.history.find(v => v.version === 1)?.workflowContract?.rawMarkdown).toBe(raw);
    await deleteMethod({ workspaceId: workspaceAId, ownerUserId: userAId, methodId: method.id });
    expect(await getMethod({ workspaceId: workspaceAId, ownerUserId: userAId, methodId: method.id })).toBeNull();
  });

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: userAId, name: "Methods A", email: `${userAId}@example.test` }, { id: userBId, name: "Methods B", email: `${userBId}@example.test` }] });
    const [workspaceA, workspaceB] = await Promise.all([
      db.workspace.create({ data: { name: "Methods A", slug: `methods-a-${suffix}`, members: { create: { userId: userAId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "Methods B", slug: `methods-b-${suffix}`, members: { create: { userId: userBId, role: "OWNER" } } } }),
    ]);
    workspaceAId = workspaceA.id; workspaceBId = workspaceB.id;
    const source = await db.sourceItem.create({ data: { workspaceId: workspaceAId, createdById: userAId, sourceType: "VIDEO", sourcePlatform: "DOUYIN", title: "方法来源", status: "READY", transcript: { create: { workspaceId: workspaceAId, provider: "LOCAL_FUNASR", providerMode: "REAL", fullText: quote, segments: [{ startMs: 1_000, endMs: 4_000, text: quote }] } } } });
    sourceId = source.id;
    const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: sourceId } });
    transcriptId = transcript.id;
    const analysis = await db.materialAnalysis.create({ data: { workspaceId: workspaceAId, sourceItemId: sourceId, createdById: userAId, version: 1, status: "COMPLETED", summary: understanding.whatItSays.summary, keyPoints: understanding.whatItSays.keyPoints, tags: [], keywords: [], understanding, transcriptUpdatedAtAtAnalysis: transcript.updatedAt } });
    analysisId = analysis.id;
  });

  afterAll(async () => {
    await db.methodAsset.deleteMany({ where: { workspaceId: { in: [workspaceAId, workspaceBId] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceAId, workspaceBId] } } });
    await db.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await db.$disconnect();
  });

  const content = { title: "先说问题，再给方法", steps: ["先说清问题", "再给出方法"], applicableScenarios: ["需要解释问题时"], boundaries: ["不能当作稳定规律"] };

  it("rejects client-supplied source and ownership fields", () => {
    expect(createMethodSchema.safeParse({ materialAnalysisId: analysisId, methodIndex: 0, ...content, workspaceId: workspaceAId, ownerUserId: userAId, evidence: [] }).success).toBe(false);
    expect(updateMethodSchema.safeParse({ ...content, expectedVersion: 1, sourceItemId: sourceId, sourceTranscriptId: transcriptId }).success).toBe(false);
  });

  it("saves a calibrated M1 method with private ownership and provenance", async () => {
    const method = await createMethodFromAnalysis({ workspaceId: workspaceAId, ownerUserId: userAId, materialAnalysisId: analysisId, methodIndex: 0, ...content });
    expect(method).toMatchObject({ status: "SAVED", current: { version: 1, title: content.title, source: { sourceItemId: sourceId, materialAnalysisId: analysisId, transcriptId } } });
    expect(method.current.evidence).toEqual([{ quote, segmentIndex: 0, startMs: 1_000, endMs: 4_000 }]);
    await expect(getMethod({ workspaceId: workspaceAId, ownerUserId: userBId, methodId: method.id })).resolves.toBeNull();
    await expect(getMethod({ workspaceId: workspaceBId, ownerUserId: userBId, methodId: method.id })).resolves.toBeNull();
  });

  it("rejects insufficient evidence and non-member owners", async () => {
    const sparse = await db.materialAnalysis.create({ data: { workspaceId: workspaceAId, sourceItemId: sourceId, createdById: userAId, version: 2, status: "COMPLETED", tags: [], keywords: [], keyPoints: [], summary: "依据不足", understanding: { ...understanding, methods: { evidenceStatus: "INSUFFICIENT", reason: "依据不足", items: [] } }, transcriptUpdatedAtAtAnalysis: new Date() } });
    await expect(createMethodFromAnalysis({ workspaceId: workspaceAId, ownerUserId: userAId, materialAnalysisId: sparse.id, methodIndex: 0, ...content })).rejects.toMatchObject({ code: "METHOD_INVALID" });
    await expect(createMethodFromAnalysis({ workspaceId: workspaceAId, ownerUserId: userBId, materialAnalysisId: analysisId, methodIndex: 0, ...content })).rejects.toMatchObject({ code: "METHOD_INVALID" });
  });

  it("creates a new version for edits, protects concurrent saves, and keeps provenance", async () => {
    const method = await createMethodFromAnalysis({ workspaceId: workspaceAId, ownerUserId: userAId, materialAnalysisId: analysisId, methodIndex: 0, ...content });
    const changed = { ...content, title: "先说问题，再给自己的方案", steps: ["说清问题", "补充自己的方案"] };
    const edited = await updateMethodContent({ workspaceId: workspaceAId, ownerUserId: userAId, methodId: method.id, expectedVersion: 1, ...changed });
    expect(edited.current).toMatchObject({ version: 2, title: changed.title, source: { sourceItemId: sourceId, materialAnalysisId: analysisId, transcriptId } });
    expect(edited.history).toHaveLength(2);
    const results = await Promise.allSettled([
      updateMethodContent({ workspaceId: workspaceAId, ownerUserId: userAId, methodId: method.id, expectedVersion: 2, ...content }),
      updateMethodContent({ workspaceId: workspaceAId, ownerUserId: userAId, methodId: method.id, expectedVersion: 2, ...content }),
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected")[0]).toMatchObject({ reason: { code: "METHOD_VERSION_CONFLICT" } });
  });

  it("changes status without creating a version and detects source transcript updates", async () => {
    const method = await createMethodFromAnalysis({ workspaceId: workspaceAId, ownerUserId: userAId, materialAnalysisId: analysisId, methodIndex: 0, ...content });
    const trial = await updateMethodStatus({ workspaceId: workspaceAId, ownerUserId: userAId, methodId: method.id, status: "TRIAL" });
    expect(trial.status).toBe("TRIAL");
    expect(trial.current.version).toBe(1);
    await db.transcript.update({ where: { id: transcriptId }, data: { fullText: `${quote} 后来补充了新内容。` } });
    const refreshed = await getMethod({ workspaceId: workspaceAId, ownerUserId: userAId, methodId: method.id });
    expect(refreshed?.current.source.stale).toBe(true);
    expect(refreshed?.status).toBe("TRIAL");
  });

  it("does not let a VIEWER write an owned method", async () => {
    const method = await createMethodFromAnalysis({ workspaceId: workspaceAId, ownerUserId: userAId, materialAnalysisId: analysisId, methodIndex: 0, ...content });
    const membership = await db.workspaceMember.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId: workspaceAId, userId: userAId } } });
    await db.workspaceMember.update({ where: { id: membership.id }, data: { role: "VIEWER" } });
    await expect(updateMethodStatus({ workspaceId: workspaceAId, ownerUserId: userAId, methodId: method.id, status: "CORE" })).rejects.toMatchObject({ code: "METHOD_INVALID" });
    await expect(updateMethodContent({ workspaceId: workspaceAId, ownerUserId: userAId, methodId: method.id, expectedVersion: 1, ...content })).rejects.toMatchObject({ code: "METHOD_INVALID" });
    await db.workspaceMember.update({ where: { id: membership.id }, data: { role: "OWNER" } });
  });
});
