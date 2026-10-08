import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { getCreatorMethodsOverview } from "../server/creator-methods/service";
import {
  createDefaultContentMethodDraft,
  deleteDefaultContentMethod,
  getDefaultContentMethod,
  publishDefaultContentMethod,
  saveDefaultContentMethodDraft,
} from "../server/default-content-method/service";
import { defaultContentMethodMinimumItems, defaultContentMethodSectionCodes } from "../server/default-content-method/schemas";
import { getMethod, listMethods, updateMethodContent, updateMethodStatus } from "../server/methods/service";
import { getProjectMethodState, setProjectMethodSelections } from "../server/project-methods/service";

describe("workspace default content method foundation", () => {
  const suffix = randomUUID();
  const ownerId = `default-method-owner-${suffix}`;
  const otherId = `default-method-other-${suffix}`;
  let workspaceId = "";
  let otherWorkspaceId = "";
  let projectId = "";
  let privateMethodVersionId = "";

  const sections = (suffixText = "V1") => defaultContentMethodSectionCodes.map((code) => ({ code, items: Array.from({ length: defaultContentMethodMinimumItems[code] }, (_, index) => ({ text: `${code} 指南 ${suffixText} ${index + 1}`, sourceRefs: [{ type: "OWN_EXPERIENCE" as const, referenceId: `source-${code}-${index}`, label: `内部经验 ${code}` }] })) }));

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: ownerId, name: "Default Method Owner", email: `${ownerId}@example.test` }, { id: otherId, name: "Other Default Owner", email: `${otherId}@example.test` }] });
    const [workspace, other] = await Promise.all([
      db.workspace.create({ data: { name: "Default Method", slug: `default-method-${suffix}`, members: { create: { userId: ownerId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "Other Default Method", slug: `other-default-method-${suffix}`, members: { create: { userId: otherId, role: "OWNER" } } } }),
    ]);
    workspaceId = workspace.id; otherWorkspaceId = other.id;
    projectId = (await db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "默认方法隔离项目" } })).id;
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "TEXT", sourcePlatform: "GENERIC", title: "私人方法来源", rawText: "真实来源", status: "READY", transcript: { create: { workspaceId, provider: "MANUAL", providerMode: "REAL", fullText: "真实来源", segments: [] } } } });
    const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } });
    const analysis = await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: source.id, createdById: ownerId, version: 1, status: "COMPLETED", tags: [], keywords: [], keyPoints: [], understanding: {}, transcriptUpdatedAtAtAnalysis: transcript.updatedAt } });
    const asset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: ownerId, status: "SAVED" } });
    privateMethodVersionId = (await db.methodVersion.create({ data: { assetId: asset.id, version: 1, title: "私人方法", steps: ["私人步骤"], applicableScenarios: ["私人场景"], boundaries: ["私人边界"], sourceItemId: source.id, sourceMaterialAnalysisId: analysis.id, sourceTranscriptId: transcript.id, sourceTranscriptUpdatedAt: transcript.updatedAt, evidence: [{ quote: "真实来源" }], editedById: ownerId } })).id;
  });

  afterAll(async () => {
    await db.projectMethodSelection.deleteMany({ where: { projectId } });
    await db.methodAsset.deleteMany({ where: { workspaceId: { in: [workspaceId, otherWorkspaceId] } } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, otherId] } } });
    await db.$disconnect();
  });

  it("starts empty and creates only one workspace draft with seven ordered sections", async () => {
    await expect(getDefaultContentMethod({ workspaceId })).resolves.toMatchObject({ assetId: null, current: null, draft: null, history: [] });
    const first = await createDefaultContentMethodDraft({ workspaceId, userId: ownerId, origin: "HUMAN" });
    const repeated = await createDefaultContentMethodDraft({ workspaceId, userId: ownerId, origin: "HUMAN" });
    expect(first).toMatchObject({ current: null, draft: { version: 1, status: "DRAFT" } });
    expect(first.draft?.sections.map(({ code }) => code)).toEqual(defaultContentMethodSectionCodes);
    expect(repeated.assetId).toBe(first.assetId);
    expect(await db.methodAsset.count({ where: { workspaceId } })).toBe(2);
  });

  it("keeps the draft out of private methods and Studio selection", async () => {
    const current = await getDefaultContentMethod({ workspaceId });
    expect((await listMethods({ workspaceId, ownerUserId: ownerId })).map(({ current }) => current.title)).toEqual(["私人方法"]);
    expect((await getCreatorMethodsOverview({ workspaceId, ownerUserId: ownerId })).all.map(({ current }) => current.title)).toEqual(["私人方法"]);
    const state = await getProjectMethodState({ workspaceId, userId: ownerId, projectId });
    expect(state.available.map(({ methodVersionId }) => methodVersionId)).toEqual([privateMethodVersionId]);
    await expect(setProjectMethodSelections({ workspaceId, userId: ownerId, projectId, methodVersionIds: [current.draft!.id] })).rejects.toMatchObject({ code: "METHOD_SELECTION_FORBIDDEN" });
  });

  it("publishes V1 only after a human action and keeps published versions immutable", async () => {
    const draft = await getDefaultContentMethod({ workspaceId });
    await saveDefaultContentMethodDraft({ workspaceId, userId: ownerId, version: 1, sections: sections(), origin: "HUMAN" });
    await expect(publishDefaultContentMethod({ workspaceId, userId: ownerId, version: 1, actor: "AI" })).rejects.toMatchObject({ code: "DEFAULT_METHOD_FORBIDDEN" });
    const published = await publishDefaultContentMethod({ workspaceId, userId: ownerId, version: 1, actor: "HUMAN" });
    expect(published).toMatchObject({ assetId: draft.assetId, current: { version: 1, status: "PUBLISHED" }, draft: null, history: [{ version: 1 }] });
    await expect(saveDefaultContentMethodDraft({ workspaceId, userId: ownerId, version: 1, sections: sections("覆盖"), origin: "HUMAN" })).rejects.toMatchObject({ code: "DEFAULT_METHOD_CONFLICT" });
    await expect(deleteDefaultContentMethod({ workspaceId, userId: ownerId })).rejects.toMatchObject({ code: "DEFAULT_METHOD_ACTIVE" });
  });

  it("creates V2 as a draft without changing V1, then publishes while retaining history", async () => {
    const draft = await createDefaultContentMethodDraft({ workspaceId, userId: ownerId, origin: "HUMAN" });
    expect(draft).toMatchObject({ current: { version: 1 }, draft: { version: 2, status: "DRAFT", createdFromVersion: 1 } });
    expect(draft.draft?.sections[0]?.items[0]?.text).toBe("AUDIENCE 指南 V1 1");
    await saveDefaultContentMethodDraft({ workspaceId, userId: ownerId, version: 2, sections: sections("V2"), origin: "HUMAN" });
    const published = await publishDefaultContentMethod({ workspaceId, userId: ownerId, version: 2, actor: "HUMAN" });
    expect(published).toMatchObject({ current: { version: 2 }, draft: null, history: [{ version: 2 }, { version: 1 }] });
    expect(published.history[1]?.sections[0]?.items[0]?.text).toBe("AUDIENCE 指南 V1 1");
  });

  it("allows an AI-origin draft but never lets AI publish it", async () => {
    const state = await createDefaultContentMethodDraft({ workspaceId, userId: ownerId, origin: "AI_SUGGESTION" });
    expect(state).toMatchObject({ current: { version: 2 }, draft: { version: 3, origin: "AI_SUGGESTION" } });
    await saveDefaultContentMethodDraft({ workspaceId, userId: ownerId, version: 3, sections: sections("AI draft"), origin: "AI_SUGGESTION" });
    await expect(publishDefaultContentMethod({ workspaceId, userId: ownerId, version: 3, actor: "AI" })).rejects.toMatchObject({ code: "DEFAULT_METHOD_FORBIDDEN" });
    await expect(getDefaultContentMethod({ workspaceId })).resolves.toMatchObject({ current: { version: 2 }, draft: { version: 3 } });
  });

  it("isolates workspaces and never mistakes a private method for the company default", async () => {
    await expect(getDefaultContentMethod({ workspaceId: otherWorkspaceId })).resolves.toMatchObject({ assetId: null, current: null });
    await expect(getMethod({ workspaceId, ownerUserId: ownerId, methodId: (await getDefaultContentMethod({ workspaceId })).assetId! })).resolves.toBeNull();
    const privateMethod = await getMethod({ workspaceId, ownerUserId: ownerId, methodId: (await listMethods({ workspaceId, ownerUserId: ownerId }))[0]!.id });
    expect(privateMethod?.current.title).toBe("私人方法");
    await expect(updateMethodContent({ workspaceId, ownerUserId: ownerId, methodId: (await getDefaultContentMethod({ workspaceId })).assetId!, expectedVersion: 3, title: "错误覆盖", steps: ["错误"], applicableScenarios: ["错误"], boundaries: ["错误"] })).rejects.toMatchObject({ code: "METHOD_INVALID" });
    await expect(updateMethodStatus({ workspaceId, ownerUserId: ownerId, methodId: (await getDefaultContentMethod({ workspaceId })).assetId!, status: "DISABLED" })).rejects.toMatchObject({ code: "METHOD_INVALID" });
  });

  it("uses the current method-center language and hides engineering codes", async () => {
    const component = await readFile(new URL("../components/projects/default-content-method.tsx", import.meta.url), "utf8");
    const page = await readFile(new URL("../app/(app)/projects/methods/page.tsx", import.meta.url), "utf8");
    for (const text of ["鑫世界默认创作方法", "当前使用", "我们主要给谁做内容", "什么样的选题优先做", "开头怎么进入", "正文怎么讲", "案例和数据怎么用", "怎么收尾", "哪些事情不要做", "查看依据", "历史记录", "开始设置", "开始调整", "设为当前使用", "重新整理"]) expect(`${component}${page}`).toContain(text);
    expect(component).toContain("previous.find((item) => item.text === text)?.sourceRefs ?? []");
    for (const text of [">MethodVersion<", ">SourceRef<", ">EvidenceRef<", ">Schema<", ">Provider<", ">Signal<", ">Claim<", ">WorkspaceId<"]) expect(component).not.toContain(text);
  });
});
