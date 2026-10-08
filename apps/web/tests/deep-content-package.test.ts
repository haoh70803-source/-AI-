import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { listPlatformVariants } from "../server/platforms/platform-variant-service";
import { DeepContentContextBuilder } from "../server/deep-content/context";
import { importGPTWebDraft } from "../server/deep-content/gpt-draft-import";
import { getGPTTaskPackage, recordGPTTaskPackageCopied } from "../server/deep-content/gpt-task-package";
import { applyDeepContentPackagePreview, generateDeepContentPackagePreview, getDeepContentPackage, updateDeepContentPackage } from "../server/deep-content/service";
import { deepContentPackageSchema } from "../server/deep-content/schemas";

describe("Deep Content Package and GPT Web handoff", () => {
  const suffix = randomUUID();
  const userAId = `deep-a-${suffix}`;
  const userBId = `deep-b-${suffix}`;
  let workspaceAId = "";
  let workspaceBId = "";
  let projectId = "";
  let projectBId = "";
  let evidenceId = "";
  let sourceId = "";

  function output() {
    return {
      topicPackage: { coreTopic: "为什么可靠创作要先研究", coreQuestion: "研究和最终写作应该如何分工？", candidateTopics: [{ title: "先研究，再写作", angle: "流程分工", targetAudience: "内容团队", conflict: "快速生成和可靠表达", novelty: "用创作包交接", whyWorthDoing: "降低无依据表达", differenceFromSources: "形成新的流程判断" }] },
      viewpointPackage: { mainViewpoint: "研究与最终主笔应该分工。", supportingViewpoints: ["Evidence 先于表达"], counterArguments: ["直接生成更快"], commonBeliefs: ["更强模型不需要研究"], ourJudgement: "速度不能替代事实边界。", deeperImplications: ["内容流程需要交接物"] },
      evidencePackage: { items: [
        { evidenceId, type: "FACT", content: "正式证据：研究在写作之前。", sourceItemId: sourceId, sourceReference: "https://example.test/evidence", supports: "Evidence 先于表达", confidence: 0.9, needsVerification: false, classification: "CONFIRMED" },
        { evidenceId: "invented-evidence-id", type: "DATA", content: "未经证实的 99% 数据。", sourceItemId: "invented-source", sourceReference: null, supports: "夸张数据", confidence: 1, needsVerification: false, classification: "CONFIRMED" },
        { evidenceId: null, type: "IDEA", content: "可以用厨房备料做类比。", sourceItemId: null, sourceReference: null, supports: "表达", confidence: 0.5, needsVerification: false, classification: "AI_SUGGESTION" },
      ] },
      expressionPackage: { hooks: [{ type: "CONTRARIAN", text: "最会写的模型，也不该跳过研究。" }, { type: "QUESTION", text: "为什么内容越生成越空？" }, { type: "CASE", text: "一个常见的失败流程。" }, { type: "DIRECT_JUDGEMENT", text: "先研究，再写作。" }, { type: "BOSS_VIEW", text: "负责人真正要管的是事实边界。" }, { type: "STORY", text: "一次赶稿暴露了流程问题。" }], goldenLines: ["速度不能替代事实边界。"], questions: ["你的流程从哪里开始？"], analogies: ["研究像备料"], conflictLines: ["快与可靠不是同一件事"], transitions: ["问题不在模型，而在流程"], endingIdeas: ["回到事实边界"], ctaIdeas: ["检查你的 Evidence"] },
      structurePackage: { structures: [{ type: "CONTRARIAN", name: "反常识", whySuitable: "快速建立冲突", steps: ["误区", "判断", "方法"] }, { type: "STORY", name: "故事", whySuitable: "通过场景解释", steps: ["场景", "转折", "结论"] }, { type: "VIEWPOINT", name: "观点", whySuitable: "突出立场", steps: ["判断", "论证", "行动"] }], recommendedStructure: "反常识" },
      creatorContribution: { personalViews: ["证据先于观点"], personalExperiences: [], personalCases: [], professionalKnowledge: ["内容流程设计"], positions: ["可靠优先"], preferredExpressions: ["先看证据"], brandPrinciples: ["不虚构"], forbiddenExpressions: ["保证成功"] },
      recommendedDirection: "使用反常识结构完成 60 秒口播。",
      risks: ["不要把效率写成效果承诺"],
      needsConfirmation: ["99% 数据需要确认"],
    } as const;
  }

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: userAId, name: "Deep A", email: `${userAId}@example.test` }, { id: userBId, name: "Deep B", email: `${userBId}@example.test` }] });
    const [workspaceA, workspaceB] = await Promise.all([
      db.workspace.create({ data: { name: "Deep A", slug: `deep-a-${suffix}`, members: { create: { userId: userAId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "Deep B", slug: `deep-b-${suffix}`, members: { create: { userId: userBId, role: "OWNER" } } } }),
    ]);
    workspaceAId = workspaceA.id; workspaceBId = workspaceB.id;
    const profile = await db.creatorProfile.create({ data: { workspaceId: workspaceAId, userId: userAId, displayName: "Deep Creator", positioning: "可靠内容流程", targetAudience: "内容团队", tone: "直接", preferredStyle: "具体", forbiddenStyle: "空泛口号", coreTopics: ["AI 内容"], personalViews: ["证据先于写作"], brandTerms: ["可靠创作"], forbiddenTerms: ["保证成功"], hookPreferences: ["反常识"], structurePreferences: ["观点"], ctaPreferences: ["邀请检查"], examplePhrases: ["先看证据"], notes: "不编造经历" } });
    const source = await db.sourceItem.create({ data: { workspaceId: workspaceAId, createdById: userAId, sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", title: "Deep source", rawText: `SOURCE_CONTEXT_${"A".repeat(500)}` } });
    sourceId = source.id;
    const project = await db.contentProject.create({ data: { workspaceId: workspaceAId, createdById: userAId, creatorProfileId: profile.id, title: "Deep Project", goal: "形成可靠口播", audience: "内容团队", sources: { create: { sourceItemId: source.id, role: "OWN_MATERIAL" } }, motherContent: { create: { workspaceId: workspaceAId, createdById: userAId, title: "旧母稿", body: "旧母稿正文", outline: ["旧结构"] } }, creativeBrief: { create: { workspaceId: workspaceAId, createdById: userAId, topic: "可靠创作", angle: "研究先行", audience: "内容团队", coreMessage: "先研究再写作", keyPoints: ["Evidence"], structure: ["误区", "方法"], tone: "直接", risks: [] } } } });
    projectId = project.id;
    const evidence = await db.evidenceItem.create({ data: { workspaceId: workspaceAId, projectId, sourceItemId: source.id, type: "FACT", claim: "研究在写作之前", excerpt: "正式 Evidence", createdById: userAId } });
    evidenceId = evidence.id;
    await db.platformVariant.create({ data: { workspaceId: workspaceAId, projectId, motherContentId: (await db.motherContent.findUniqueOrThrow({ where: { projectId } })).id, platform: "DOUYIN", title: "旧平台稿", body: "旧平台正文", hashtags: [], mediaPlan: {}, metadata: {}, status: "READY", sourceMotherVersion: 1, createdById: userAId } });
    projectBId = (await db.contentProject.create({ data: { workspaceId: workspaceBId, createdById: userBId, title: "Private Deep Project" } })).id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceAId, workspaceBId] } } });
    await db.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await db.$disconnect();
  });

  it("validates all six modules and rejects incomplete hook coverage", () => {
    expect(deepContentPackageSchema.parse(output())).toMatchObject({ topicPackage: { coreTopic: "为什么可靠创作要先研究" }, structurePackage: { structures: expect.any(Array) } });
    const missingHook = output();
    expect(() => deepContentPackageSchema.parse({ ...missingHook, expressionPackage: { ...missingHook.expressionPackage, hooks: missingHook.expressionPackage.hooks.slice(1) } })).toThrow();
  });

  it("builds budgeted project context with Evidence and CreatorProfile", async () => {
    const built = await new DeepContentContextBuilder({ totalChars: 600, evidenceChars: 180, briefChars: 120, profileChars: 160, perSourceChars: 100, sourceChars: 100, motherChars: 40 }).build({ workspaceId: workspaceAId, userId: userAId, projectId });
    expect(built.context.evidence).toHaveLength(1);
    expect(built.context.creatorProfile).toContain("证据先于写作");
    expect(built.context.sources[0]?.text).toContain("SOURCE_CONTEXT");
    expect(built.contextTruncated).toBe(true);
    await expect(new DeepContentContextBuilder().build({ workspaceId: workspaceAId, userId: userAId, projectId: projectBId })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });

  it("keeps Preview separate, applies safely, and never creates Evidence", async () => {
    const runtime = { provider: new MockLLMProvider(() => output()), providerName: "MOCK", model: "workspace-configured-model" };
    const beforeEvidence = await db.evidenceItem.count({ where: { projectId } });
    const preview = await generateDeepContentPackagePreview({ workspaceId: workspaceAId, userId: userAId, projectId }, { runtime });
    await expect(db.deepContentPackage.count({ where: { projectId } })).resolves.toBe(0);
    const saved = await applyDeepContentPackagePreview({ workspaceId: workspaceAId, userId: userAId, projectId, runId: preview.id });
    expect(saved).toMatchObject({ version: 1, status: "READY" });
    expect(saved.evidencePackage.items[0]).toMatchObject({ evidenceId, classification: "CONFIRMED", needsVerification: false });
    expect(saved.evidencePackage.items[1]).toMatchObject({ evidenceId: null, sourceItemId: null, classification: "NEEDS_VERIFICATION", needsVerification: true });
    expect(saved.evidencePackage.items[2]).toMatchObject({ classification: "AI_SUGGESTION", needsVerification: true });
    await expect(db.evidenceItem.count({ where: { projectId } })).resolves.toBe(beforeEvidence);
    await expect(db.apiUsage.findFirst({ where: { workspaceId: workspaceAId, operation: "GENERATE_DEEP_CONTENT_PACKAGE" } })).resolves.toMatchObject({ success: true });

    const updated = await updateDeepContentPackage({ workspaceId: workspaceAId, userId: userAId, projectId, packageId: saved.id, expectedUpdatedAt: saved.updatedAt.toISOString(), data: { coreTopic: "人工选择的选题", mainViewpoint: "人工确认的主观点", supportingViewpoints: ["人工支撑观点"], personalViews: ["创作者本人观点"], recommendedStructure: "观点", risks: ["人工风险备注"] } });
    expect(updated).toMatchObject({ topicPackage: { coreTopic: "人工选择的选题" }, viewpointPackage: { mainViewpoint: "人工确认的主观点" } });
  });

  it("renders a deterministic GPT task without promoting suggestions to facts", async () => {
    const task = await getGPTTaskPackage({ workspaceId: workspaceAId, userId: userAId, projectId, contentType: "SPOKEN_60" });
    const reliableSection = task.text.split("【可靠 Evidence】")[1]!.split("【创作者自己的观点】")[0]!;
    expect(reliableSection).toContain("正式证据");
    expect(reliableSection).not.toContain("未经证实的 99% 数据");
    expect(reliableSection).not.toContain("厨房备料");
    expect(task.text).toContain("创作建议（不是可靠事实）");
    expect(task.text).toContain("需要核实：未经证实的 99% 数据");
    await recordGPTTaskPackageCopied({ workspaceId: workspaceAId, userId: userAId, projectId, packageId: task.packageId, contentType: "SPOKEN_60", characterCount: task.text.length });
    await expect(db.apiUsage.count({ where: { workspaceId: workspaceAId, operation: { contains: "GPT" } } })).resolves.toBe(0);
  });

  it("imports GPT Web as a new mother version and reuses platform stale detection", async () => {
    await expect(importGPTWebDraft({ workspaceId: workspaceAId, userId: userAId, projectId, title: "GPT 最终稿", body: "GPT Web 人工复制回来的最终成稿。", confirmReplace: false })).rejects.toMatchObject({ code: "GPT_IMPORT_CONFIRMATION_REQUIRED" });
    const imported = await importGPTWebDraft({ workspaceId: workspaceAId, userId: userAId, projectId, title: "GPT 最终稿", body: "GPT Web 人工复制回来的最终成稿。", note: "人工确认版本", confirmReplace: true });
    expect(imported).toMatchObject({ version: 2, origin: "GPT_WEB", originNote: "人工确认版本" });
    await expect(listPlatformVariants({ workspaceId: workspaceAId, userId: userAId, projectId })).resolves.toMatchObject({ motherVersion: 2, staleCount: 1, variants: [{ isStale: true }] });
    const audits = await db.auditLog.findMany({ where: { workspaceId: workspaceAId, action: { in: ["deep_package.generated", "deep_package.updated", "gpt_package.copied", "mother_content.imported_from_gpt_web"] } } });
    expect(audits.map(({ action }) => action)).toEqual(expect.arrayContaining(["deep_package.generated", "deep_package.updated", "gpt_package.copied", "mother_content.imported_from_gpt_web"]));
    expect(JSON.stringify(audits)).not.toContain("GPT Web 人工复制回来的最终成稿");
  });

  it("enforces Workspace isolation", async () => {
    await expect(getDeepContentPackage({ workspaceId: workspaceAId, userId: userAId, projectId: projectBId })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });
});
