import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const now = new Date("2026-10-10T00:00:00Z");
  const suggestions = [{ id: "other-suggestion", workspaceId: "w", ownerUserId: "other", sourceBenchmarkStudyId: "study", type: "OPENING", title: "个人写法", status: "PENDING", steps: [], applicableScenarios: [], boundaries: [], sourceRefs: [], sampleCount: 1, stability: "LIMITED", evidence: [], rationale: "研究", savedMethodAssetId: null }];
  const objects = [{ id: "own", workspaceId: "w", createdById: "u", title: "我的资料", description: "自己的上下文", status: "READY", updatedAt: now }, { id: "other", workspaceId: "w", createdById: "other", title: "同事私有资料", description: "私人上下文", status: "READY", updatedAt: now }, { id: "foreign", workspaceId: "foreign", createdById: "u", title: "外空间资料", status: "READY", updatedAt: now }];
  const state = { disabled: false };
  const filter = (rows: typeof objects, where: Record<string, unknown>) => rows.filter(row => row.workspaceId === where.workspaceId && (!where.createdById || row.createdById === where.createdById));
  const data = { output: { commonMethods: [{ title: "个人写法", howTo: ["先判断"], applicable: [], boundaries: [], occurrenceSampleIds: ["sample"], exceptionSampleIds: [], evidence: [{ quote: "依据" }] }] }, id: "study", version: 1, sampleCount: 1, benchmarkAccountId: "account", samples: [{ id: "sample", sourceItemId: "source" }] };
  const matchSuggestion = (where: Record<string, unknown>) => suggestions.filter(row => row.workspaceId === where.workspaceId && (!where.ownerUserId || row.ownerUserId === where.ownerUserId) && (!where.id || row.id === where.id));
  const db = {
    workspaceMember: { findUnique: vi.fn(async () => ({ role: "EDITOR" })), findFirst: vi.fn(async () => state.disabled ? null : ({ role: "EDITOR" })) },
    creatorProfile: { findUnique: vi.fn(async () => null) },
    benchmarkContentSnapshot: { findMany: vi.fn(async () => []) },
    contentIdea: { findMany: vi.fn(async ({ where }) => filter(objects, where)) },
    contentProject: { findMany: vi.fn(async ({ where }) => filter(objects, where)) },
    sourceItem: { findMany: vi.fn(async ({ where }) => filter(objects, where)) },
    methodSuggestion: { findMany: vi.fn(async ({ where }) => matchSuggestion(where)), findFirst: vi.fn(async ({ where }) => matchSuggestion(where)[0] ?? null), findUnique: vi.fn(async () => suggestions[0]), update: vi.fn(async () => ({})), create: vi.fn(async () => ({})) },
    benchmarkStudy: { findFirst: vi.fn(async () => data) },
    auditLog: { create: vi.fn(async () => ({})) },
    $transaction: vi.fn(async (operations: unknown[]) => Promise.all(operations)),
  };
  return { db, state, data, suggestions };
});
vi.mock("server-only", () => ({}));
vi.mock("@content-center/db", () => ({ db: mocks.db }));
vi.mock("@content-center/providers", () => ({ benchmarkAnalysisOutputSchema: { safeParse: (output: unknown) => ({ success: true, data: output }) } }));
vi.mock("../server/ai/control/ai-control-service", () => ({ AIControlService: class {} }));
vi.mock("../server/creator-profile-service", () => ({ normalizeCreatorProfileInput: vi.fn() }));
vi.mock("../server/methods/service", () => ({ createMethodFromBenchmarkStudy: vi.fn() }));
vi.mock("../server/discovery/trends/read-model", () => ({ listTrendOpportunities: vi.fn(async () => []) }));

import { buildRecommendationContext } from "../server/discovery/recommendations/context-builder";
import { decideMethodSuggestion, generateMethodSuggestions, listMethodSuggestions } from "../server/learning-suggestions/service";

beforeEach(() => { vi.clearAllMocks(); mocks.state.disabled = false; mocks.suggestions[0]!.ownerUserId = "other"; });
const actor = { workspaceId: "w", userId: "u" };

describe("personal recommendation boundaries", () => {
  it("does not feed other users' project, idea, or source context to the caller", async () => {
    const result = await buildRecommendationContext(actor);
    expect(JSON.stringify(result)).not.toContain("同事私有资料");
    expect(JSON.stringify(result)).not.toContain("外空间资料");
    expect(result.recentProjects.map(row => row.id)).toEqual(["own"]);
    expect(result.recentIdeas.map(row => row.id)).toEqual(["own"]);
  });
  it("rejects disabled members before reading private context", async () => {
    mocks.state.disabled = true;
    await expect(buildRecommendationContext(actor)).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db.sourceItem.findMany).not.toHaveBeenCalled();
  });
});

describe("MethodSuggestion ownership", () => {
  it("does not list another user's private suggestions in the same workspace", async () => {
    expect(await listMethodSuggestions({ ...actor, benchmarkAccountId: "account" })).toEqual([]);
  });
  it("cannot reject another user's private suggestion by guessing its id", async () => {
    await expect(decideMethodSuggestion({ ...actor, suggestionId: "other-suggestion", decision: "REJECT" })).rejects.toBeDefined();
    expect(mocks.db.methodSuggestion.update).not.toHaveBeenCalled();
  });
  it("keeps the owner's listing and decision available", async () => {
    mocks.suggestions[0]!.ownerUserId = "u";
    expect(await listMethodSuggestions({ ...actor, benchmarkAccountId: "account" })).toHaveLength(1);
    await expect(decideMethodSuggestion({ ...actor, suggestionId: "other-suggestion", decision: "REJECT" })).resolves.toEqual({ status: "REJECTED" });
  });
  it("rejects disabled members before listing suggestions", async () => {
    mocks.state.disabled = true;
    await expect(listMethodSuggestions({ ...actor, benchmarkAccountId: "account" })).rejects.toMatchObject({ code: "FORBIDDEN" });
    expect(mocks.db.methodSuggestion.findMany).not.toHaveBeenCalled();
  });
  it("another user's previous suggestion does not suppress my explicit research derivation", async () => {
    const controlService = { execute: vi.fn(async () => ({ output: { suggestions: [{ sourceMethodIndex: 0, type: "OPENING", rationale: "依据" }] } })) };
    const result = await generateMethodSuggestions({ ...actor, benchmarkAccountId: "account", benchmarkStudyId: "study" }, { controlService: controlService as never });
    expect(result.created).toBe(1);
    expect(mocks.db.methodSuggestion.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ ownerUserId: "u", workspaceId: "w" }) }));
  });
});
