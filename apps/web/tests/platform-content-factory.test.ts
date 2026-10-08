import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { saveMotherContent } from "../server/mother-content-service";
import { buildPlatformContext } from "../server/platforms/platform-context";
import { DouyinPlatformAdapter, WeChatMomentsPlatformAdapter, WechatChannelsPlatformAdapter, WechatOfficialPlatformAdapter, XiaohongshuPlatformAdapter } from "../server/platforms/adapters";
import { selectPlatformTemplate } from "../server/platforms/platform-template-service";
import { applyPlatformPreview, generatePlatformPreviews, listPlatformVariants } from "../server/platforms/platform-variant-service";

const outputs = {
  DOUYIN: { hook: "先别急着让 AI 写", title: "可靠创作先做什么", body: "先整理证据，再重建表达。", hashtags: ["AI创作"], mediaPlan: { duration: 60, shotSuggestions: ["正面口播"] } },
  XIAOHONGSHU: { titles: ["AI 写作别跳过这一步", "内容可靠的起点", "先证据后写作"], body: "先整理证据。\n\n再重建表达。", hashtags: ["AI创作"], coverTitles: ["先证据 后写作"], mediaPlan: { imageIdeas: ["流程图"] } },
  WECHAT_MOMENTS: { variants: [{ type: "SHORT", body: "先证据，再写。" }, { type: "VIEWPOINT", body: "我越来越确定，证据应该先于写作。" }, { type: "STORY", body: "上次赶稿时，我先整理了证据。" }] },
  WECHAT_CHANNELS: { title: "AI 创作的可靠起点", hook: "很多人第一步就错了", body: "先整理证据，再开始表达。", description: "一条证据优先的创作方法", hashtags: ["AI创作"] },
  WECHAT_OFFICIAL: { title: "可靠 AI 创作，从证据开始", summary: "母稿形成前先组织证据", body: "导语\n\n证据是表达的边界。\n\n结尾", outline: ["导语", "证据边界", "结尾"] },
} as const;

function fixture(input: { prompt: string }) {
  const platform = Object.keys(outputs).find((key) => input.prompt.includes(`Target: ${key}`)) as keyof typeof outputs | undefined;
  if (!platform) throw new Error("Unknown platform fixture");
  return outputs[platform];
}

describe("multi-platform content factory", () => {
  const suffix = randomUUID();
  const userAId = `platform-a-${suffix}`;
  const userBId = `platform-b-${suffix}`;
  let workspaceAId = "";
  let workspaceBId = "";
  let projectId = "";
  let projectBId = "";
  const runtime = { provider: new MockLLMProvider(fixture), providerName: "MOCK", model: "mock-platform" };

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: userAId, name: "Platform A", email: `${userAId}@example.test` }, { id: userBId, name: "Platform B", email: `${userBId}@example.test` }] });
    const [workspaceA, workspaceB] = await Promise.all([
      db.workspace.create({ data: { name: "Platform A", slug: `platform-a-${suffix}`, members: { create: { userId: userAId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "Platform B", slug: `platform-b-${suffix}`, members: { create: { userId: userBId, role: "OWNER" } } } }),
    ]);
    workspaceAId = workspaceA.id; workspaceBId = workspaceB.id;
    const profile = await db.creatorProfile.create({ data: { workspaceId: workspaceAId, userId: userAId, displayName: "Creator A", positioning: "Evidence-first creator", targetAudience: "Content teams", tone: "Direct", preferredStyle: "Concrete", forbiddenStyle: "Empty slogans", coreTopics: [], personalViews: ["Evidence before writing"], brandTerms: [], forbiddenTerms: [], hookPreferences: [], structurePreferences: [], ctaPreferences: [], examplePhrases: [] } });
    const source = await db.sourceItem.create({ data: { workspaceId: workspaceAId, createdById: userAId, sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", title: "Private raw source", rawText: "SOURCE_TRANSCRIPT_MUST_NOT_ENTER_PLATFORM_CONTEXT" } });
const project = await db.contentProject.create({ data: { workspaceId: workspaceAId, createdById: userAId, creatorProfileId: profile.id, title: "Platform Project", sources: { create: { sourceItemId: source.id } }, motherContent: { create: { workspaceId: workspaceAId, createdById: userAId, title: "Mother", body: "Approved mother content says evidence comes before writing.", outline: ["Problem", "Method"], confirmedVersion: 1 } }, creativeBrief: { create: { workspaceId: workspaceAId, createdById: userAId, topic: "Reliable AI content", angle: "Evidence first", audience: "Content teams", coreMessage: "Evidence before writing", keyPoints: ["Collect evidence"], structure: ["Problem", "Method"], tone: "Direct", risks: [] } } } });
    projectId = project.id;
    projectBId = (await db.contentProject.create({ data: { workspaceId: workspaceBId, createdById: userBId, title: "Private Platform Project", motherContent: { create: { workspaceId: workspaceBId, createdById: userBId, title: "Private", body: "Private mother content", outline: [] } } } })).id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceAId, workspaceBId] } } });
    await db.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await db.$disconnect();
  });

  it("validates and normalizes all five adapter output schemas", () => {
    const douyin = new DouyinPlatformAdapter(); const xhs = new XiaohongshuPlatformAdapter(); const moments = new WeChatMomentsPlatformAdapter(); const channels = new WechatChannelsPlatformAdapter(); const official = new WechatOfficialPlatformAdapter();
    expect(douyin.normalize(douyin.validate(outputs.DOUYIN))).toMatchObject({ title: outputs.DOUYIN.title, body: outputs.DOUYIN.body });
    expect(xhs.normalize(xhs.validate(outputs.XIAOHONGSHU), { style: "VIEWPOINT" })).toMatchObject({ title: outputs.XIAOHONGSHU.titles[0], metadata: { titles: outputs.XIAOHONGSHU.titles } });
    expect(moments.normalize(moments.validate(outputs.WECHAT_MOMENTS), {})).toMatchObject({ body: outputs.WECHAT_MOMENTS.variants[1].body, metadata: { selectedType: "VIEWPOINT" } });
    expect(channels.normalize(channels.validate(outputs.WECHAT_CHANNELS))).toMatchObject({ summary: outputs.WECHAT_CHANNELS.description });
    expect(official.normalize(official.validate(outputs.WECHAT_OFFICIAL))).toMatchObject({ metadata: { outline: outputs.WECHAT_OFFICIAL.outline } });
    expect(() => new DouyinPlatformAdapter().validate({ ...outputs.DOUYIN, body: "" })).toThrow();
  });

  it("keeps raw platform JSON fields out of the employee editor", async () => {
    const component = await readFile(new URL("../components/projects/platform-content-factory.tsx", import.meta.url), "utf8");
    for (const label of ["平台扩展字段", "拍摄 / 配图计划 JSON", "候选标题 / 版本 / 大纲 JSON"]) expect(component).not.toContain(label);
    expect(component).toContain("mediaPlan: JSON.stringify");
    expect(component).toContain("metadata: JSON.stringify");
  });

  it("selects a Workspace platform template before the system default", async () => {
    await expect(selectPlatformTemplate(workspaceAId, "DOUYIN")).resolves.toMatchObject({ workspaceId: null, version: 1 });
    await db.platformTemplate.create({ data: { workspaceId: workspaceAId, platform: "DOUYIN", name: "Workspace Douyin v2", version: 2, systemPrompt: "Workspace rules", template: "Workspace {{context}}" } });
    await expect(selectPlatformTemplate(workspaceAId, "DOUYIN")).resolves.toMatchObject({ workspaceId: workspaceAId, version: 2 });
  });

  it("inherits CreatorProfile without loading Source transcripts", async () => {
    const context = await buildPlatformContext({ workspaceId: workspaceAId, userId: userAId, projectId, parameters: { duration: 60 } });
    expect(context.built.creatorProfile).toMatchObject({ displayName: "Creator A", personalViews: ["Evidence before writing"] });
    expect(JSON.stringify(context.built)).not.toContain("SOURCE_TRANSCRIPT_MUST_NOT_ENTER_PLATFORM_CONTEXT");
  });

  it("keeps Preview separate, applies variants, detects stale, and isolates regeneration", async () => {
    const douyinPreview = await generatePlatformPreviews({ workspaceId: workspaceAId, userId: userAId, projectId, platforms: ["DOUYIN"], parameters: { DOUYIN: { duration: 60 } } }, { runtime });
    await expect(db.platformVariant.count({ where: { projectId } })).resolves.toBe(0);
    const douyin = await applyPlatformPreview({ workspaceId: workspaceAId, userId: userAId, projectId, platform: "DOUYIN", runId: douyinPreview.runs[0]!.id, expectedVersion: 0 });
    expect(douyin).toMatchObject({ platform: "DOUYIN", sourceMotherVersion: 1, isStale: false, status: "READY" });
    const mother = await db.motherContent.findUniqueOrThrow({ where: { projectId } });
    await saveMotherContent({ workspaceId: workspaceAId, userId: userAId, projectId, data: { title: mother.title, body: `${mother.body} Updated.`, outline: ["Problem", "Method"], expectedVersion: 1 } });
    await expect(listPlatformVariants({ workspaceId: workspaceAId, userId: userAId, projectId })).resolves.toMatchObject({ staleCount: 1, variants: [{ platform: "DOUYIN", isStale: true }] });
    await expect(generatePlatformPreviews({ workspaceId: workspaceAId, userId: userAId, projectId, platforms: ["XIAOHONGSHU"] }, { runtime })).rejects.toMatchObject({ code: "MOTHER_CONFIRMATION_REQUIRED" });
    await db.motherContent.update({ where: { projectId }, data: { confirmedVersion: 2 } });

    const xhsPreview = await generatePlatformPreviews({ workspaceId: workspaceAId, userId: userAId, projectId, platforms: ["XIAOHONGSHU"] }, { runtime });
    const xhs = await applyPlatformPreview({ workspaceId: workspaceAId, userId: userAId, projectId, platform: "XIAOHONGSHU", runId: xhsPreview.runs[0]!.id, expectedVersion: 0 });
    const xhsSnapshot = await db.platformVariant.findUniqueOrThrow({ where: { id: xhs.id } });
    const regenerated = await generatePlatformPreviews({ workspaceId: workspaceAId, userId: userAId, projectId, platforms: ["DOUYIN"] }, { runtime });
    await applyPlatformPreview({ workspaceId: workspaceAId, userId: userAId, projectId, platform: "DOUYIN", runId: regenerated.runs[0]!.id, expectedVersion: 1 });
    await expect(db.platformVariant.findUniqueOrThrow({ where: { id: xhs.id } })).resolves.toMatchObject({ version: xhsSnapshot.version, body: xhsSnapshot.body });
    await expect(db.apiUsage.findMany({ where: { workspaceId: workspaceAId, operation: { startsWith: "ADAPT_" } } })).resolves.toHaveLength(3);
    const audits = await db.auditLog.findMany({ where: { workspaceId: workspaceAId, action: { startsWith: "platform_variant." } } });
    expect(audits.map(({ action }) => action)).toEqual(expect.arrayContaining(["platform_variant.generated", "platform_variant.regenerated"]));
    expect(JSON.stringify(audits)).not.toContain(outputs.DOUYIN.body);
  });

  it("enforces Workspace isolation", async () => {
    await expect(listPlatformVariants({ workspaceId: workspaceAId, userId: userAId, projectId: projectBId })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });
});
