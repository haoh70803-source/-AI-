import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { MockLLMProvider } from "@content-center/providers";
import { applyAIResult, discardAIResult, runAIAction } from "../server/ai/ai-run-service";
import { ProjectContextBuilder } from "../server/ai/project-context";
import { selectPromptTemplate } from "../server/ai/prompt-service";
import { getCreatorProfile, saveCreatorProfile } from "../server/creator-profile-service";
import { createProject } from "../server/project-service";
import { listMotherContentVersions, saveMotherContent } from "../server/mother-content-service";

describe("AI creation engine", () => {
  const runId = randomUUID();
  const userAId = `ai-a-${runId}`;
  const userBId = `ai-b-${runId}`;
  let workspaceAId = "";
  let workspaceBId = "";
  let projectId = "";
  let projectBId = "";
  let failureProjectId = "";
  let sourceId = "";

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: userAId, name: "AI User A", email: `${userAId}@example.test` }, { id: userBId, name: "AI User B", email: `${userBId}@example.test` }] });
    const [workspaceA, workspaceB] = await Promise.all([
      db.workspace.create({ data: { name: "AI A", slug: `ai-a-${runId}`, members: { create: { userId: userAId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "AI B", slug: `ai-b-${runId}`, members: { create: { userId: userBId, role: "OWNER" } } } }),
    ]);
    workspaceAId = workspaceA.id; workspaceBId = workspaceB.id;
    await saveCreatorProfile({ workspaceId: workspaceAId, userId: userAId, data: { displayName: "Creator A", positioning: "Practical creator", targetAudience: "Teams", tone: "Direct", preferredStyle: "Concrete", forbiddenStyle: "Empty slogans", coreTopics: ["AI workflow"], personalViews: ["Evidence before opinion"], brandTerms: ["Content Center"], forbiddenTerms: ["guaranteed"], hookPreferences: ["Question"], structurePreferences: ["Problem-solution"], ctaPreferences: ["Ask for feedback"], examplePhrases: ["先看证据"], notes: "" } });
    await saveCreatorProfile({ workspaceId: workspaceBId, userId: userBId, data: { displayName: "Creator B", positioning: "Private", targetAudience: "Private", tone: "Private", preferredStyle: "", forbiddenStyle: "", coreTopics: [], personalViews: [], brandTerms: [], forbiddenTerms: [], hookPreferences: [], structurePreferences: [], ctaPreferences: [], examplePhrases: [], notes: "" } });
    sourceId = (await db.sourceItem.create({ data: { workspaceId: workspaceAId, createdById: userAId, sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", title: "Long source", rawText: "A".repeat(200) } })).id;
    await db.materialAnalysis.create({ data: { workspaceId: workspaceAId, sourceItemId: sourceId, version: 1, status: "COMPLETED", summary: "Material summary", topic: "Reliable creation", tags: [], keywords: [], keyPoints: ["Material key point"], understanding: { whatItSays: { summary: "Material summary", keyPoints: ["Material key point"] }, reusable: [{ content: "Transferable mechanism", whyUseful: "Useful" }], doNotCopy: [{ content: "当天成交13个", reason: "Original author case" }], uncertain: [{ content: "星加克", reason: "Uncertain entity" }] }, origin: "AI", transcriptUpdatedAtAtAnalysis: new Date(), createdById: userAId } });
    projectId = (await createProject({ workspaceId: workspaceAId, userId: userAId, title: "AI Project", goal: "Create a grounded draft", sourceItemId: sourceId })).id;
    failureProjectId = (await createProject({ workspaceId: workspaceAId, userId: userAId, title: "Failed mother project", sourceItemId: sourceId })).id;
    await db.unifiedCreativeAnalysis.create({ data: { workspaceId: workspaceAId, projectId, createdById: userAId, version: 1, status: "COMPLETED", inputFingerprint: `fp-${runId}`, output: { creativeInterpretation: { text: "Unified interpretation", classification: "AI_INTERPRETATION", sourceItemIds: [sourceId] }, groundingGaps: ["Unverified number"] }, provenance: { sourceItemIds: [sourceId] } } });
    projectBId = (await createProject({ workspaceId: workspaceBId, userId: userBId, title: "Private AI Project" })).id;
  });

  afterAll(async () => {
    await db.workspace.deleteMany({ where: { id: { in: [workspaceAId, workspaceBId] } } });
    await db.user.deleteMany({ where: { id: { in: [userAId, userBId] } } });
    await db.$disconnect();
  });

  it("isolates creator profiles and binds a creator profile to new projects", async () => {
    await expect(getCreatorProfile(workspaceAId, userAId)).resolves.toMatchObject({ displayName: "Creator A" });
    await expect(getCreatorProfile(workspaceAId, userBId)).resolves.toBeNull();
    await expect(db.contentProject.findUniqueOrThrow({ where: { id: projectId } })).resolves.toMatchObject({ creatorProfileId: expect.any(String) });
  });

  it("selects the newest Workspace prompt before the system default", async () => {
    const system = await selectPromptTemplate(workspaceAId, "ANALYZE_SOURCES");
    expect(system.workspaceId).toBeNull();
    await db.promptTemplate.create({ data: { workspaceId: workspaceAId, name: "Workspace Analyze v2", type: "ANALYZE_SOURCES", version: 2, systemPrompt: "Workspace system", template: "Workspace {{context}}" } });
    await expect(selectPromptTemplate(workspaceAId, "ANALYZE_SOURCES")).resolves.toMatchObject({ workspaceId: workspaceAId, version: 2 });
  });

  it("selects action-specific context and records truncation", async () => {
    const builder = new ProjectContextBuilder({ perSourceChars: 20, totalSourceChars: 20, totalEvidenceChars: 20 });
    const analyze = await builder.build({ workspaceId: workspaceAId, userId: userAId, projectId, action: "ANALYZE_SOURCES" });
    expect("sources" in analyze.context ? analyze.context.sources?.[0]?.text : undefined).toHaveLength(20);
    expect(analyze.contextTruncated).toBe(true);
    const mother = await builder.build({ workspaceId: workspaceAId, userId: userAId, projectId, action: "GENERATE_MOTHER_CONTENT" });
    const motherUnderstanding = "externalReferences" in mother.context ? mother.context.externalReferences.materials[0]?.materialUnderstanding : null;
    expect(motherUnderstanding).toMatchObject({ reusable: [{ content: "Transferable mechanism" }] });
    expect(JSON.stringify(motherUnderstanding)).toContain("星加克");
    expect(JSON.stringify(motherUnderstanding)).toContain("当天成交13个");
    expect(JSON.stringify(mother.context)).not.toContain("Unified interpretation");
    expect(JSON.stringify(mother.context)).not.toContain("A".repeat(50));
    expect(JSON.stringify(mother.context)).not.toContain("selectedMethods");
    expect(mother.inputSummary).toMatchObject({ materialAnalysisCount: 1, hasUnifiedCreativeAnalysis: false, hasCreatorProfile: true });
    const rewrite = await builder.build({ workspaceId: workspaceAId, userId: userAId, projectId, action: "HUMANIZE" });
    expect("sources" in rewrite.context ? rewrite.context.sources : []).toEqual([]);
    expect("evidence" in rewrite.context ? rewrite.context.evidence : []).toEqual([]);
    await expect(builder.build({ workspaceId: workspaceAId, userId: userAId, projectId: projectBId, action: "ANALYZE_SOURCES" })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
  });

  it("keeps AI output in preview until explicit apply or discard", async () => {
    let motherPrompt = "";
    let motherSystemPrompt = "";
    let motherCalls = 0;
    const fixture = (input: { prompt: string; systemPrompt?: string }) => {
      if (input.prompt.includes("EXTRACT_EVIDENCE")) return { items: [{ type: "FACT", excerpt: "Supported excerpt", claim: "Supported claim", note: "", sourceItemId: sourceId }] };
      if (input.prompt.includes("GENERATE_ANGLES")) return { angles: [{ title: "Evidence-first angle", angle: "Start from a failed shortcut", coreMessage: "Evidence improves originality", whyItWorks: "Concrete", targetAudience: "Teams", recommendedStructure: ["Failure", "Evidence", "Method"], risk: "Avoid absolutes", evidenceIds: [], sourceItemIds: [sourceId] }] };
      if (input.prompt.includes("GENERATE_BRIEF")) return { topic: "AI content workflow", angle: "Evidence first", audience: "Teams", coreMessage: "Build from evidence", keyPoints: ["Collect", "Verify", "Write"], structure: ["Hook", "Method", "CTA"], tone: "Direct", risks: ["No invented facts"], evidenceIds: [], sourceItemIds: [sourceId] };
      if (input.prompt.includes("GENERATE_MOTHER_CONTENT")) { motherCalls += 1; motherPrompt = input.prompt; motherSystemPrompt = input.systemPrompt || ""; return { recommendedAngle: "Evidence before drafting", alternativeAngles: ["Why unsupported drafts fail", "Make evidence useful"], recommendedTitle: "Evidence before drafting", alternativeTitles: ["Why does drafting start with evidence?", "A grounded draft starts here"], openingHook: "Mother body", outline: ["Hook", "Method"], body: "Mother body", evidenceIds: [], sourceItemIds: [sourceId] }; }
      if (input.prompt.includes("HUMANIZE")) return { original: "Mother body", aiVersion: "A more natural mother body" };
      return { topics: ["AI workflow"], coreClaims: [], facts: [], cases: [], questions: [], hooks: [], structures: [], risks: [], reusableInsights: [] };
    };
    const runtime = { provider: new MockLLMProvider(fixture), providerName: "MOCK", model: "mock-llm" };
    const evidenceRun = await runAIAction({ workspaceId: workspaceAId, userId: userAId, projectId, action: "EXTRACT_EVIDENCE" }, { runtime });
    await expect(db.evidenceItem.count({ where: { projectId } })).resolves.toBe(0);
    await applyAIResult({ workspaceId: workspaceAId, userId: userAId, projectId, runId: evidenceRun.id, selectedIndexes: [0] });
    await expect(db.evidenceItem.count({ where: { projectId } })).resolves.toBe(1);
    const angleRun = await runAIAction({ workspaceId: workspaceAId, userId: userAId, projectId, action: "GENERATE_ANGLES" }, { runtime });
    await applyAIResult({ workspaceId: workspaceAId, userId: userAId, projectId, runId: angleRun.id, selectedIndex: 0, expectedVersion: 0 });
    const briefRun = await runAIAction({ workspaceId: workspaceAId, userId: userAId, projectId, action: "GENERATE_BRIEF" }, { runtime });
    await applyAIResult({ workspaceId: workspaceAId, userId: userAId, projectId, runId: briefRun.id, expectedVersion: 1 });
    const motherRun = await runAIAction({ workspaceId: workspaceAId, userId: userAId, projectId, action: "GENERATE_MOTHER_CONTENT" }, { runtime });
    expect(motherCalls).toBe(1);
    await expect(db.methodUsage.count({ where: { aiRunId: motherRun.id } })).resolves.toBe(0);
    expect(motherRun.output).toMatchObject({ recommendedAngle: "Evidence before drafting", alternativeAngles: expect.any(Array), alternativeTitles: expect.any(Array), openingHook: "Mother body", estimatedCharacterCount: 10, estimatedDurationSeconds: 2 });
    expect(motherPrompt).not.toContain("Material summary");
    expect(motherPrompt).toContain("prohibitedReferenceClaims");
    expect(motherPrompt).not.toContain("Unified interpretation");
    expect(motherPrompt).not.toContain("A".repeat(50));
    expect(motherPrompt).toContain("mySupplement");
    expect(motherPrompt).toContain("Never invent the creator's customers");
    expect(motherPrompt).toContain("Never turn a reference author's business");
    expect(motherPrompt).toContain("Exact numbers, amounts, percentages");
    expect(motherPrompt).not.toContain("External writing method");
    expect(motherPrompt).not.toContain("叙事机制指纹");
    expect(motherPrompt).not.toContain("The external writing method, for organization and expression only");
    expect(motherSystemPrompt).toContain("NON-NEGOTIABLE FACT BOUNDARY");
    expect(motherSystemPrompt).toContain("很多人跟我聊");
    expect(motherPrompt).not.toMatch(/contract lifecycle|onboarding|growth|monetization/i);
    await expect(db.aIRun.findUniqueOrThrow({ where: { id: motherRun.id } })).resolves.toMatchObject({ metadata: expect.objectContaining({ resolverDryRun: true, resolverMode: "DETERMINISTIC_DRY_RUN", resolver: expect.objectContaining({ dryRun: true, resolverMode: "DETERMINISTIC_DRY_RUN" }) }) });
    await expect(db.motherContent.findUnique({ where: { projectId } })).resolves.toBeNull();
    await applyAIResult({ workspaceId: workspaceAId, userId: userAId, projectId, runId: motherRun.id, expectedVersion: 0 });
    await saveMotherContent({ workspaceId: workspaceAId, userId: userAId, projectId, data: { title: "Human edited V1", body: "Human work must survive", outline: ["Edited"], expectedVersion: 1 } });
    const replacementRun = await runAIAction({ workspaceId: workspaceAId, userId: userAId, projectId, action: "GENERATE_MOTHER_CONTENT" }, { runtime });
    await expect(applyAIResult({ workspaceId: workspaceAId, userId: userAId, projectId, runId: replacementRun.id, expectedVersion: 2 })).rejects.toMatchObject({ code: "AI_REPLACE_CONFIRMATION_REQUIRED" });
    await applyAIResult({ workspaceId: workspaceAId, userId: userAId, projectId, runId: replacementRun.id, expectedVersion: 2, confirmReplace: true });
    const versions = await listMotherContentVersions({ workspaceId: workspaceAId, userId: userAId, projectId });
    expect(versions).toMatchObject([
      { version: 3, current: true, body: "Mother body" },
      { version: 2, current: false, title: "Human edited V1", body: "Human work must survive" },
      { version: 1, current: false, body: "Mother body" },
    ]);
    await expect(listMotherContentVersions({ workspaceId: workspaceAId, userId: userAId, projectId: projectBId })).rejects.toMatchObject({ code: "PROJECT_NOT_FOUND" });
    const rewriteRun = await runAIAction({ workspaceId: workspaceAId, userId: userAId, projectId, action: "HUMANIZE", selectedText: "Mother body" }, { runtime });
    await applyAIResult({ workspaceId: workspaceAId, userId: userAId, projectId, runId: rewriteRun.id, expectedVersion: 3, selectionStart: 0, selectionEnd: 11, mode: "REPLACE" });
    await expect(db.motherContent.findUniqueOrThrow({ where: { projectId } })).resolves.toMatchObject({ body: "A more natural mother body", version: 4 });
    const analyzeRun = await runAIAction({ workspaceId: workspaceAId, userId: userAId, projectId, action: "ANALYZE_SOURCES" }, { runtime });
    await discardAIResult({ workspaceId: workspaceAId, userId: userAId, projectId, runId: analyzeRun.id });
    await expect(db.aIRun.findUniqueOrThrow({ where: { id: analyzeRun.id } })).resolves.toMatchObject({ discardedAt: expect.any(Date) });
    const audit = await db.auditLog.findMany({ where: { workspaceId: workspaceAId, action: { startsWith: "ai." } }, select: { action: true, metadata: true } });
    expect(audit.map(({ action }) => action)).toEqual(expect.arrayContaining(["ai.run_started", "ai.run_succeeded", "ai.result_applied"]));
    expect(JSON.stringify(audit)).not.toContain("A more natural mother body");
  });

  it("records invalid AI output as failed and never creates fake mother content", async () => {
    const runtime = { provider: new MockLLMProvider(() => ({ recommendedAngle: "Invalid", alternativeAngles: [], recommendedTitle: "Invalid", alternativeTitles: ["A", "B"], openingHook: "Invalid", outline: [], body: "", evidenceIds: [], sourceItemIds: [] })), providerName: "MOCK", model: "mock-llm" };
    await expect(runAIAction({ workspaceId: workspaceAId, userId: userAId, projectId: failureProjectId, action: "GENERATE_MOTHER_CONTENT" }, { runtime })).rejects.toBeTruthy();
    await expect(db.motherContent.findUnique({ where: { projectId: failureProjectId } })).resolves.toBeNull();
    await expect(db.aIRun.findFirst({ where: { projectId: failureProjectId, action: "GENERATE_MOTHER_CONTENT" }, orderBy: { createdAt: "desc" } })).resolves.toMatchObject({ status: "FAILED" });
  });
});
