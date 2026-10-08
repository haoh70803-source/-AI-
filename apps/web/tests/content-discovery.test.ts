import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));
const { enqueueContentIngestMock } = vi.hoisted(() => ({enqueueContentIngestMock: vi.fn().mockResolvedValue(undefined)}));
vi.mock("@content-center/worker/queue", () => ({ enqueueContentIngest: enqueueContentIngestMock }));
vi.mock("@content-center/worker/queue-producer", () => ({ enqueueContentIngest: enqueueContentIngestMock }));

import { db } from "@content-center/db";
import { enqueueContentIngest } from "@content-center/worker/queue";
import { readSourceMetadataEnvelope } from "@content-center/providers";
import {
  addBenchmark,
  addIdeaReference,
  collectExternalContent,
  createIdea,
  createProjectFromExternalContent,
  disableBenchmark,
  DiscoveryServiceError,
  getIdea,
  listBenchmarks,
  startIdeaProject,
} from "../server/discovery/service";
import type { ExternalContentInput } from "../server/discovery/schemas";

describe("Content Discovery service", () => {
  const runId = randomUUID();
  const ownerId = `discovery-owner-${runId}`;
  const otherOwnerId = `discovery-other-${runId}`;
  let workspaceId = "";
  let otherWorkspaceId = "";

  const content = (externalId: string, title = "AI 获客的真实案例"): ExternalContentInput => ({
    externalId,
    platform: "DOUYIN",
    contentType: "VIDEO",
    title,
    description: "来自内容发现的参考摘要",
    authorId: "author-1",
    authorName: "商业创作者",
    authorAvatarUrl: null,
    coverUrl: "https://example.test/cover.jpg",
    originalUrl: `https://www.douyin.com/video/${externalId}`,
    publishedAt: "2026-09-01T00:00:00.000Z",
    metrics: { views: null, likes: 88, comments: null, shares: null, favorites: null },
    durationMs: 30_000,
    sourceProvider: "REDFOX",
  });

  beforeAll(async () => {
    await db.user.createMany({
      data: [
        { id: ownerId, name: "Discovery Owner", email: `${ownerId}@example.test` },
        { id: otherOwnerId, name: "Other Discovery Owner", email: `${otherOwnerId}@example.test` },
      ],
    });
    const [workspace, otherWorkspace] = await Promise.all([
      db.workspace.create({ data: { name: "Discovery Test", slug: `discovery-${runId}`, members: { create: { userId: ownerId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "Other Discovery Test", slug: `discovery-other-${runId}`, members: { create: { userId: otherOwnerId, role: "OWNER" } } } }),
    ]);
    workspaceId = workspace.id;
    otherWorkspaceId = otherWorkspace.id;
    await db.integrationConfig.createMany({
      data: [
        { workspaceId, provider: "REDFOX", status: "CONFIGURED", configured: true, publicConfig: { baseUrl: "https://example.invalid" } },
        { workspaceId: otherWorkspaceId, provider: "REDFOX", status: "CONFIGURED", configured: true, publicConfig: { baseUrl: "https://example.invalid" } },
      ],
    });
  });

  beforeEach(() => {
    vi.mocked(enqueueContentIngest).mockClear();
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, otherOwnerId] } } });
    await db.$disconnect();
  });

  it("deduplicates benchmark accounts and keeps them Workspace-scoped", async () => {
    const account = {
      externalId: "benchmark-1",
      platform: "DOUYIN" as const,
      name: "标杆账号",
      avatarUrl: null,
      bio: "只分享可验证的内容方法",
      followers: 1200,
      likes: null,
      originalUrl: "https://www.douyin.com/user/benchmark-1",
      sourceProvider: "REDFOX" as const,
    };
    const created = await addBenchmark({ workspaceId, userId: ownerId, account });
    expect(created).toMatchObject({ platform: "DOUYIN", externalAccountId: "benchmark-1", enabled: true });
    await expect(addBenchmark({ workspaceId, userId: ownerId, account })).rejects.toMatchObject({ code: "DISCOVERY_DUPLICATE" });
    await expect(listBenchmarks(workspaceId)).resolves.toHaveLength(1);
    await expect(listBenchmarks(otherWorkspaceId)).resolves.toHaveLength(0);
    await expect(disableBenchmark({ workspaceId: otherWorkspaceId, userId: otherOwnerId, benchmarkId: created.id })).rejects.toMatchObject({ code: "DISCOVERY_NOT_FOUND" });
  });

  it("creates a lightweight idea reference without creating or downloading a SourceItem", async () => {
    const beforeSources = await db.sourceItem.count({ where: { workspaceId } });
    const idea = await createIdea({ workspaceId, userId: ownerId, title: "为什么企业用了 AI 反而更忙？", reference: content("idea-lightweight") });
    const stored = await getIdea(workspaceId, idea.id);
    expect(stored?.references).toHaveLength(1);
    expect(stored?.references[0]).toMatchObject({ externalId: "idea-lightweight", sourceItemId: null });
    await expect(db.sourceItem.count({ where: { workspaceId } })).resolves.toBe(beforeSources);
    await expect(db.ingestJob.count({ where: { workspaceId } })).resolves.toBe(0);
    expect(enqueueContentIngest).not.toHaveBeenCalled();
    await expect(addIdeaReference({ workspaceId, userId: ownerId, ideaId: idea.id, reference: content("idea-lightweight") })).rejects.toMatchObject({ code: "DISCOVERY_DUPLICATE" });
    await expect(getIdea(otherWorkspaceId, idea.id)).resolves.toBeNull();
  });

  it("collects through the existing ingest queue once and links matching idea references", async () => {
    const external = content("collect-once");
    const idea = await createIdea({ workspaceId, userId: ownerId, title: "收录去重测试", reference: external });
    const first = await collectExternalContent({ workspaceId, userId: ownerId, content: external });
    const second = await collectExternalContent({ workspaceId, userId: ownerId, content: external });
    expect(first.created).toBe(true);
    expect(second).toMatchObject({ created: false, sourceItem: { id: first.sourceItem.id } });
    expect(enqueueContentIngest).toHaveBeenCalledTimes(1);
    await expect(db.sourceItem.count({ where: { workspaceId, sourcePlatform: "DOUYIN", externalId: "collect-once" } })).resolves.toBe(1);
    await expect(db.ingestJob.count({ where: { workspaceId, sourceItemId: first.sourceItem.id } })).resolves.toBe(1);
    await expect(db.contentIdeaReference.findFirstOrThrow({ where: { ideaId: idea.id, externalId: "collect-once" } })).resolves.toMatchObject({ sourceItemId: first.sourceItem.id });
    const stored = await db.sourceItem.findUniqueOrThrow({ where: { id: first.sourceItem.id } });
    expect(readSourceMetadataEnvelope(stored.metadata)?.external).toMatchObject({
      externalId: "collect-once",
      publishedAt: "2026-09-01T00:00:00.000Z",
      durationMs: 30_000,
      metrics: { likes: 88, views: null, comments: null, shares: null, favorites: null },
    });
  });

  it("creates a project with a REFERENCE source from an external result", async () => {
    const result = await createProjectFromExternalContent({ workspaceId, userId: ownerId, content: content("project-reference", "一键开始创作") });
    await expect(db.projectSource.findUniqueOrThrow({
      where: { projectId_sourceItemId: { projectId: result.project.id, sourceItemId: result.sourceItem.id } },
    })).resolves.toMatchObject({ role: "REFERENCE" });
    await expect(db.contentProject.findFirst({ where: { id: result.project.id, workspaceId: otherWorkspaceId } })).resolves.toBeNull();
  });

  it("requires confirmation before collecting missing idea references, then starts one project", async () => {
    const idea = await createIdea({ workspaceId, userId: ownerId, title: "需要明确确认的选题", reference: content("idea-confirm") });
    await expect(startIdeaProject({ workspaceId, userId: ownerId, ideaId: idea.id, collectMissing: false })).rejects.toBeInstanceOf(DiscoveryServiceError);
    await expect(db.contentProject.count({ where: { workspaceId, title: "需要明确确认的选题" } })).resolves.toBe(0);

    const started = await startIdeaProject({ workspaceId, userId: ownerId, ideaId: idea.id, collectMissing: true });
    const repeated = await startIdeaProject({ workspaceId, userId: ownerId, ideaId: idea.id, collectMissing: false });
    expect(started.existing).toBe(false);
    expect(repeated).toEqual({ projectId: started.projectId, existing: true });
    await expect(db.contentIdea.findUniqueOrThrow({ where: { id: idea.id } })).resolves.toMatchObject({ status: "IN_PROGRESS", projectId: started.projectId });
    await expect(db.projectSource.count({ where: { projectId: started.projectId, role: "REFERENCE" } })).resolves.toBe(1);
  });
});
