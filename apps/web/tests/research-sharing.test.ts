import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { getArtifactForUser } from "../server/artifacts/service";
import { ArtifactContextAdapter } from "../server/artifacts/context-adapter";
import { getResearchResult, researchResultLibrary } from "../server/research/read-model";
import { buildResearchSharePreview, shareResearchRunToProject } from "../server/research/sharing";

describe("explicit Research result handoff", () => {
  const suffix = randomUUID(); const owner = `share-owner-${suffix}`; const editor = `share-editor-${suffix}`; const viewer = `share-viewer-${suffix}`;
  let workspaceId = ""; let projectId = ""; let runId = "";
  const actor = () => ({ workspaceId, userId: owner });
  beforeAll(async () => {
    await db.user.createMany({ data: [owner, editor, viewer].map(id => ({ id, name: id, email: `${id}@example.test` })) });
    workspaceId = (await db.workspace.create({ data: { name: "Research share", slug: `research-share-${suffix}`, members: { create: [{ userId: owner, role: "OWNER" }, { userId: editor, role: "EDITOR" }, { userId: viewer, role: "VIEWER" }] } } })).id;
    projectId = (await db.contentProject.create({ data: { workspaceId, createdById: owner, title: "Target project" } })).id;
    const session = await db.researchSession.create({ data: { workspaceId, createdById: owner, title: "Private notes", entryTemplate: "DIRECT", requestKey: randomUUID(), projectId } });
    const sources = [
      { ref: "U1", kind: "USER_INPUT", objectId: "question", title: "Private input", href: null, capturedAt: null, publishedAt: null, eventAt: null, contentOrigin: "USER_PROVIDED", locator: null, excerpt: "SECRET_USER_NOTE", version: null },
      { ref: "M1", kind: "MATERIAL", objectId: "material", title: "Public source", href: "/library/material", capturedAt: null, publishedAt: null, eventAt: null, contentOrigin: "ORIGINAL", locator: null, excerpt: "Actual public excerpt", version: null },
      { ref: "P1", kind: "CREATOR_PROFILE", objectId: "profile", title: "Private profile", href: null, capturedAt: null, publishedAt: null, eventAt: null, contentOrigin: "USER_PROVIDED", locator: null, excerpt: "SECRET_PROFILE", version: null },
    ];
    const blocks = [
      { id: "public", type: "text", title: "Supported finding", provenance: "AI_INTERPRETATION", sourceRefs: ["M1"], limitation: "One source", text: "SHARED_FINDING" },
      { id: "private", type: "text", title: "Personal idea", provenance: "AI_INTERPRETATION", sourceRefs: ["P1"], limitation: "Private", text: "SECRET_PROFILE_STRATEGY" },
      { id: "sources", type: "sources", title: "Sources", provenance: "REAL_DATA", sourceRefs: ["U1", "M1", "P1"], limitation: null, refs: sources },
    ];
    runId = (await db.researchRun.create({ data: { workspaceId, sessionId: session.id, requestedById: owner, question: "Selected research", requestKey: randomUUID(), requestHash: "hash", version: 1, status: "COMPLETED", stage: "COMPLETED", savedAt: new Date(), inputScope: { materialIds: [], benchmarkAccountIds: [], trendKeys: [], notes: "SECRET_USER_NOTE", useCreatorProfile: true }, blocks, sourceRefs: sources } })).id;
  });
  afterAll(async () => { if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } }); await db.user.deleteMany({ where: { id: { in: [owner, editor, viewer] } } }); await db.$disconnect(); });
  it("previews only selected external evidence and omits private profile and notes", async () => {
    const result = await getResearchResult(actor(), runId);
    const preview = buildResearchSharePreview(result.resultTitle || result.question, result.blocks);
    expect(preview).toMatchObject({ blockCount: 1, sourceCount: 1 });
    expect(preview.body).toContain("SHARED_FINDING");
    expect(preview.body).toContain("Actual public excerpt");
    expect(preview.body).not.toMatch(/SECRET_PROFILE|SECRET_USER_NOTE/);
    const library = await researchResultLibrary(actor(), {});
    expect(library.items.find(item => item.id === runId)).toMatchObject({ summary: "SHARED_FINDING", sourceCount: 1, sampleCount: null, sharedCount: 0 });
    expect((await researchResultLibrary({ workspaceId, userId: editor }, {})).items).toEqual([]);
  });
  it("creates one durable Artifact for concurrent explicit shares while keeping the session private", async () => {
    const results = await Promise.all([shareResearchRunToProject(actor(), runId, projectId), shareResearchRunToProject(actor(), runId, projectId)]);
    expect(results[0].artifactId).toBe(results[1].artifactId);
    expect((await researchResultLibrary(actor(), {})).items.find(item => item.id === runId)?.sharedCount).toBe(1);
    expect(await db.artifact.count({ where: { projectId, sourceResearchRunId: runId } })).toBe(1);
    expect((await getArtifactForUser({ workspaceId, userId: viewer, projectId, artifactId: results[0].artifactId })).content).toContain("SHARED_FINDING");
    expect((await new ArtifactContextAdapter().resolve({ workspaceId, userId: owner, projectId, artifactId: results[0].artifactId })).item.content).toContain("SHARED_FINDING");
    await expect(getResearchResult({ workspaceId, userId: editor }, runId)).rejects.toMatchObject({ status: 404 });
    await expect(shareResearchRunToProject({ workspaceId, userId: editor }, runId, projectId)).rejects.toMatchObject({ code: "RESULT_NOT_FOUND" });
    await expect(shareResearchRunToProject({ workspaceId, userId: viewer }, runId, projectId)).rejects.toMatchObject({ status: 403 });
  });
});
