import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { saveBrief } from "../server/brief-service";
import { appendConfirmedCreatorFacts, classifyCreatorContext, extractExplicitOwnFacts } from "../server/ai/creation-context";
import { ProjectContextBuilder } from "../server/ai/project-context";
import { recommendStudioQuickActions } from "../server/ai/schemas";

describe("unified Studio creation context", () => {
  const suffix = randomUUID();
  const userId = `creation-context-${suffix}`;
  const otherUserId = `creation-context-other-${suffix}`;
  let workspaceId = "";
  let otherWorkspaceId = "";
  let projectId = "";

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: userId, name: "创作者", email: `${userId}@example.test` }, { id: otherUserId, name: "其他创作者", email: `${otherUserId}@example.test` }] });
    const [workspace, other] = await Promise.all([
      db.workspace.create({ data: { name: "Creation Context", slug: `creation-context-${suffix}`, members: { create: { userId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "Creation Context Other", slug: `creation-context-other-${suffix}`, members: { create: { userId: otherUserId, role: "OWNER" } } } }),
    ]);
    workspaceId = workspace.id;
    otherWorkspaceId = other.id;
    const profile = await db.creatorProfile.create({ data: { workspaceId, userId, displayName: "创作者", positioning: "长期从事教培经营", targetAudience: "教培老板", tone: "直接", preferredStyle: "具体", forbiddenStyle: "夸张承诺", coreTopics: ["招生经营"], personalViews: ["先看经营问题"], brandTerms: [], forbiddenTerms: [], hookPreferences: ["直接判断"], structurePreferences: [], ctaPreferences: [], examplePhrases: [], notes: "我感觉以后可能更关注直播。" } });
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "TEXT", sourcePlatform: "GENERIC", title: "外部参考", rawText: "第三方客户提高了成交率。", status: "READY", transcript: { create: { workspaceId, provider: "MANUAL", providerMode: "REAL", fullText: "第三方客户提高了成交率。", segments: [] } } } });
    const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } });
    await db.materialDistillation.create({ data: { workspaceId, sourceItemId: source.id, createdById: userId, version: 1, mode: "COMPREHENSIVE", status: "COMPLETED", schemaVersion: "material-distillation-v2", output: { highlights: [{ title: "外部做法", sourceRefs: ["T001"] }] }, transcriptUpdatedAtAtDistillation: transcript.updatedAt } });
    projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, creatorProfileId: profile.id, title: "统一上下文创作", goal: "形成可信口播", audience: "教培老板", sources: { create: { sourceItemId: source.id, role: "REFERENCE" } }, creativeBrief: { create: { workspaceId, topic: "教培经营", angle: "直接表达", audience: "教培老板", coreMessage: "先讲清经营问题", background: "我以前做过校区运营。", keyPoints: [], structure: [], tone: "直接", risks: [], createdById: userId } }, motherContent: { create: { workspaceId, title: "现有稿", body: "我以前做过校区运营。这里先讲经营问题。", outline: [], createdById: userId } }, evidenceItems: { create: [{ workspaceId, type: "CASE", claim: "这个客户是我们去年合作的。", createdById: userId }, { workspaceId, sourceItemId: source.id, type: "DATA", claim: "第三方客户提高了成交率。", createdById: userId }] } } })).id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [userId, otherUserId] } } });
    await db.$disconnect();
  });

  it("separates confirmed profile facts, current understanding, pending information, own facts, methods, and external references", async () => {
    const built = await new ProjectContextBuilder().build({ workspaceId, userId, projectId, action: "GENERATE_MOTHER_CONTENT", externalReferences: [{ id: "M9-1", title: "对标画像", content: "外部账号认为先讲工具；我们当前观点是先看经营问题。" }] });
    const context = built.context as Record<string, any>;
    expect(context.creatorProfile.confirmedFacts).toContain("长期从事教培经营");
    expect(context.creatorProfile.currentUnderstanding).toEqual(expect.arrayContaining(["直接", "先看经营问题"]));
    expect(context.creatorProfile.pendingInformation).toContain("我感觉以后可能更关注直播。");
    expect(built.ownFacts).toEqual(expect.arrayContaining([
      expect.objectContaining({ text: "我以前做过校区运营。", source: "MY_SUPPLEMENT" }),
      expect.objectContaining({ text: "这个客户是我们去年合作的。", source: "PROJECT_EVIDENCE" }),
    ]));
    expect(context.currentDraft.trustedFacts).toContain("我以前做过校区运营。");
    expect(context.externalReferences.materials[0].materialDistillation).toMatchObject({ version: 1, schemaVersion: "material-distillation-v2" });
    expect(context.externalReferences.evidence[0].content).toContain("第三方客户提高了成交率");
    expect(context.externalReferences.additional[0]).toMatchObject({ id: "M9-1", attribution: "EXTERNAL" });
    expect(context.externalReferences.additional[0].content).toContain("先讲工具");
    expect(context.confirmedFacts.join(" ")).not.toContain("第三方客户提高了成交率");
    await expect(new ProjectContextBuilder().build({ workspaceId: otherWorkspaceId, userId: otherUserId, projectId, action: "GENERATE_MOTHER_CONTENT" })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });

  it("accumulates only explicit employee facts into the existing profile without duplicates", async () => {
    const before = await db.creativeBrief.findUniqueOrThrow({ where: { projectId } });
    await saveBrief({ workspaceId, userId, projectId, data: { topic: before.topic, angle: before.angle, audience: before.audience, coreMessage: before.coreMessage, background: "我以前做过三年校区运营。\n我现在主要负责招生。\n我觉得以后可能做直播。", keyPoints: [], structure: [], tone: before.tone, risks: [], expectedVersion: before.version } });
    const notes = (await db.creatorProfile.findUniqueOrThrow({ where: { workspaceId_userId: { workspaceId, userId } } })).notes;
    expect(notes).toContain("【已确认事实】我以前做过三年校区运营。");
    expect(notes).toContain("【已确认事实】我现在主要负责招生。");
    expect(notes).not.toContain("【已确认事实】我觉得以后可能做直播。");
    expect(appendConfirmedCreatorFacts(notes, ["我现在主要负责招生。"]).match(/我现在主要负责招生/g)).toHaveLength(1);
  });

  it("keeps profile states and deterministic action recommendations small and model-free", () => {
    expect(extractExplicitOwnFacts("我以前做过三年校区运营。\n我感觉客户都喜欢直播。" )).toEqual(["我以前做过三年校区运营。"]);
    expect(classifyCreatorContext({ displayName: "我", positioning: "长期从事教培经营", targetAudience: "校长", tone: "直接", preferredStyle: "具体", forbiddenStyle: "", coreTopics: [], personalViews: [], brandTerms: [], forbiddenTerms: [], hookPreferences: [], structurePreferences: [], ctaPreferences: [], examplePhrases: [], notes: "我感觉以后可能更关注直播。" })).toMatchObject({ confirmedFacts: ["长期从事教培经营"], pendingInformation: ["我感觉以后可能更关注直播。"] });
    expect(recommendStudioQuickActions({ hasTopic: false, hasDraft: false, hasOwnEvidence: false })).toHaveLength(5);
    const withoutEvidence = recommendStudioQuickActions({ hasTopic: true, hasDraft: true, hasOwnEvidence: false });
    expect(withoutEvidence).toHaveLength(6);
    expect(withoutEvidence.map(({ label }) => label)).toEqual(expect.arrayContaining(["先写观点版", "换个不用数据的角度", "检查事实风险"]));
    expect(recommendStudioQuickActions({ hasTopic: true, hasDraft: true, hasOwnEvidence: true })).toHaveLength(6);
  });
});
