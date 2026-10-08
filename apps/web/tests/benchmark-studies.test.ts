import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const enqueueBenchmarkStudy = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "queued" }));
const enqueueBenchmarkPlaybookStudy = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "queued-playbooks" }));
const enqueueBenchmarkCreatorProfileStudy = vi.hoisted(() => vi.fn().mockResolvedValue({ id: "queued-profile" }));
vi.mock("@content-center/worker/queue", () => ({ enqueueBenchmarkStudy, enqueueBenchmarkPlaybookStudy, enqueueBenchmarkCreatorProfileStudy }));
import { db } from "@content-center/db";
import { benchmarkCreatorProfileInputV4Schema, benchmarkCreatorProfileOutputV4Schema } from "@content-center/providers";
import { createBenchmarkCreatorProfileStudy, createBenchmarkCreatorProfileStudySchema, createBenchmarkPlaybookStudy, createBenchmarkPlaybookStudySchema, createBenchmarkStudy, createBenchmarkStudySchema, listBenchmarkCandidates, listBenchmarkStudies } from "../server/discovery/benchmark-study-service";
import { createMethodFromBenchmarkStudy, getMethod } from "../server/methods/service";

function understanding(quote: string) {
  const evidence = [{ quote }];
  const section = { summary: "先说问题，再给出处理方式。", evidence };
  return {
    whatItSays: { summary: "比较可核对的表达做法。", keyPoints: ["先说问题"], evidence },
    expression: { audience: section, opening: section, progression: { summary: "从问题进入方法。", steps: ["问题", "方法"], evidence }, support: section, emotionalOrRhetoricalShift: section, ending: section },
    methods: { evidenceStatus: "SINGLE_SOURCE_DRAFT", reason: "仅是单条方法草稿。", items: [{ title: "先说问题", howTo: ["先说问题"], applicable: ["解释复杂问题"], boundaries: ["不要虚构事实"], evidence }] },
    reusable: [], doNotCopy: [], uncertain: [],
  };
}

function studyOutput(sampleIds: string[]) {
  const finding = { name: "先说问题", summary: "多数样本先提出问题。", occurrenceSampleIds: sampleIds.slice(0, 4), exceptionSampleIds: sampleIds.slice(4), evidence: sampleIds.slice(0, 4).map((sampleId, index) => ({ sampleId, quote: `可靠依据 ${index + 1}` })) };
  return {
    topicDirections: [finding], openingPatterns: [finding], structures: [], persuasionMethods: [], expressionHabits: [], endings: [],
    commonMethods: [{ title: "先说问题再给方法", howTo: ["先明确问题"], applicable: ["需要解释时"], boundaries: ["不要照搬来源事实"], occurrenceSampleIds: finding.occurrenceSampleIds, exceptionSampleIds: finding.exceptionSampleIds, evidence: finding.evidence }],
    exceptions: [{ ...finding, name: "不同开头", summary: "两个样本使用了其他开头。" }],
    repeatedCaseNotes: [{ summary: "样本重复同一经历，不能当作多个独立事实来源。", sampleIds: sampleIds.slice(0, 2), evidence: finding.evidence.slice(0, 2) }],
    stableMethodsFound: true, message: "只描述所选样本。",
  };
}

function distillationOutput(quote: string) {
  return { mode: "COMPREHENSIVE", hasLongTermValue: false, message: "可以继续观察。", highlights: [{ type: "copy_structure", quality: "OBSERVE", title: "强判断后解释", essence: "先给判断，再解释原因。", whyWorthAttention: "", howTo: [], applicable: [], boundaries: [], evidence: [{ quote, sourceRef: "T001", kind: "TEXT_BLOCK", index: 0 }] }], copywriting: null };
}

describe("benchmark study request boundary", () => {
  it("accepts one through ten samples and rejects empty, oversized, or duplicate selections", () => {
    expect(createBenchmarkStudySchema.safeParse({ sampleIds: ["sample-1"] }).success).toBe(true);
    expect(createBenchmarkStudySchema.safeParse({ sampleIds: Array.from({ length: 10 }, (_, index) => `sample-${index}`) }).success).toBe(true);
    expect(createBenchmarkStudySchema.safeParse({ sampleIds: [] }).success).toBe(false);
    expect(createBenchmarkStudySchema.safeParse({ sampleIds: Array.from({ length: 11 }, (_, index) => `sample-${index}`) }).success).toBe(false);
    expect(createBenchmarkStudySchema.safeParse({ sampleIds: ["sample-1", "sample-1"] }).success).toBe(false);
    expect(createBenchmarkPlaybookStudySchema.safeParse({ sampleIds: ["sample-1", "sample-2", "sample-3"] }).success).toBe(true);
    expect(createBenchmarkPlaybookStudySchema.safeParse({ sampleIds: ["sample-1", "sample-2"] }).success).toBe(false);
    expect(createBenchmarkCreatorProfileStudySchema.safeParse({ sampleIds: Array.from({ length: 5 }, (_, index) => `sample-${index}`) }).success).toBe(true);
    expect(createBenchmarkCreatorProfileStudySchema.safeParse({ sampleIds: Array.from({ length: 4 }, (_, index) => `sample-${index}`) }).success).toBe(false);
  });
});

describe("benchmark study persistence and provenance", () => {
  const suffix = randomUUID();
  const ownerId = `benchmark-owner-${suffix}`;
  const colleagueId = `benchmark-colleague-${suffix}`;
  let workspaceId = "";
  let benchmarkId = "";
  let otherBenchmarkId = "";
  let m8OnlySnapshotId = "";
  let m8OnlySourceId = "";
  let m4OnlySnapshotId = "";
  let invalidM7SnapshotId = "";
  let invalidM7VersionSnapshotId = "";
  const snapshotIds: string[] = [];
  const sourceIds: string[] = [];

  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: ownerId, name: "Benchmark Owner", email: `${ownerId}@example.test` }, { id: colleagueId, name: "Benchmark Colleague", email: `${colleagueId}@example.test` }] });
    const workspace = await db.workspace.create({ data: { name: "Benchmark Study", slug: `benchmark-study-${suffix}`, members: { create: [{ userId: ownerId, role: "OWNER" }, { userId: colleagueId, role: "EDITOR" }] } } });
    workspaceId = workspace.id;
    const [benchmark, other] = await Promise.all([
      db.benchmarkAccount.create({ data: { workspaceId, platform: "DOUYIN", externalAccountId: `account-${suffix}`, name: "对标账号", createdById: ownerId } }),
      db.benchmarkAccount.create({ data: { workspaceId, platform: "DOUYIN", externalAccountId: `other-${suffix}`, name: "其他账号", createdById: ownerId } }),
    ]);
    benchmarkId = benchmark.id; otherBenchmarkId = other.id;
    for (let index = 0; index < 7; index += 1) {
      const externalId = `benchmark-${suffix}-${index}`;
      const snapshot = await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: index === 6 ? otherBenchmarkId : benchmarkId, platform: "DOUYIN", externalId, title: `代表内容 ${index + 1}`, url: `https://example.test/${externalId}`, metadata: {} } });
      snapshotIds.push(snapshot.id);
      const source = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "VIDEO", sourcePlatform: "DOUYIN", externalId, title: `代表内容 ${index + 1}`, status: "READY", transcript: { create: { workspaceId, provider: "FIXTURE", providerMode: "REAL", fullText: `可靠依据 ${index + 1}`, segments: [] } } } });
      sourceIds.push(source.id);
      if (index < 6) {
        const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } });
        await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: source.id, createdById: ownerId, version: 1, status: "COMPLETED", tags: [], keywords: [], keyPoints: [], understanding: understanding(`可靠依据 ${index + 1}`), transcriptUpdatedAtAtAnalysis: transcript.updatedAt } });
        await db.materialDistillation.create({ data: { workspaceId, sourceItemId: source.id, createdById: ownerId, version: 1, mode: "COMPREHENSIVE", status: "COMPLETED", schemaVersion: "material-distillation-v2", output: distillationOutput(`可靠依据 ${index + 1}`), transcriptUpdatedAtAtDistillation: transcript.updatedAt } });
      }
    }
    const createExtra = async (suffixName: string, title: string) => {
      const externalId = `${suffixName}-${suffix}`;
      const snapshot = await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: benchmarkId, platform: "DOUYIN", externalId, title, url: `https://example.test/${externalId}`, metadata: {} } });
      const source = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "VIDEO", sourcePlatform: "DOUYIN", externalId, title, status: "READY", transcript: { create: { workspaceId, provider: "FIXTURE", providerMode: "REAL", fullText: `${title}真实依据`, segments: [] } } } });
      const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } });
      return { snapshot, source, transcript };
    };
    const m8Only = await createExtra("m8-only", "只有精华提炼");
    m8OnlySnapshotId = m8Only.snapshot.id; m8OnlySourceId = m8Only.source.id;
    await db.materialDistillation.create({ data: { workspaceId, sourceItemId: m8Only.source.id, createdById: ownerId, version: 1, mode: "COMPREHENSIVE", status: "COMPLETED", schemaVersion: "material-distillation-v2", output: distillationOutput("只有精华提炼真实依据"), transcriptUpdatedAtAtDistillation: m8Only.transcript.updatedAt } });
    const m4Only = await createExtra("m4-only", "只有内容拆解");
    m4OnlySnapshotId = m4Only.snapshot.id;
    await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: m4Only.source.id, createdById: ownerId, version: 1, status: "COMPLETED", tags: [], keywords: [], keyPoints: [], understanding: understanding("只有内容拆解真实依据"), transcriptUpdatedAtAtAnalysis: m4Only.transcript.updatedAt } });
    const invalidM7 = await createExtra("invalid-m7", "精华引用无效");
    invalidM7SnapshotId = invalidM7.snapshot.id;
    const invalidOutput = distillationOutput("精华引用无效真实依据");
    delete (invalidOutput.highlights[0]!.evidence[0] as { sourceRef?: string }).sourceRef;
    await db.materialDistillation.create({ data: { workspaceId, sourceItemId: invalidM7.source.id, createdById: ownerId, version: 1, mode: "COMPREHENSIVE", status: "COMPLETED", schemaVersion: "material-distillation-v2", output: invalidOutput, transcriptUpdatedAtAtDistillation: invalidM7.transcript.updatedAt } });
    const invalidM7Version = await createExtra("invalid-m7-version", "精华版本无效");
    invalidM7VersionSnapshotId = invalidM7Version.snapshot.id;
    await db.materialDistillation.create({ data: { workspaceId, sourceItemId: invalidM7Version.source.id, createdById: ownerId, version: 0, mode: "COMPREHENSIVE", status: "COMPLETED", schemaVersion: "material-distillation-v2", output: distillationOutput("精华版本无效真实依据"), transcriptUpdatedAtAtDistillation: invalidM7Version.transcript.updatedAt } });
  });

  afterAll(async () => {
    await db.methodAsset.deleteMany({ where: { workspaceId } });
    await db.benchmarkStudy.deleteMany({ where: { workspaceId } });
    await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, colleagueId] } } });
    await db.$disconnect();
  });

  it("pins six same-account M1 results, preserves history, and saves a private multi-sample method", async () => {
    const candidates = await listBenchmarkCandidates({ workspaceId, benchmarkAccountId: benchmarkId });
    expect(candidates).toHaveLength(10);
    expect(candidates.filter(({ sourceItemId }) => sourceIds.slice(0, 6).includes(sourceItemId ?? "")).every(({ ready }) => ready)).toBe(true);
    const first = await createBenchmarkStudy({ workspaceId, benchmarkAccountId: benchmarkId, userId: ownerId, sampleIds: snapshotIds.slice(0, 6) });
    expect(first).toMatchObject({ version: 1, sampleCount: 6, insufficientSamples: false, status: "PROCESSING" });
    expect(first.samples).toHaveLength(6);
    await expect(createBenchmarkStudy({ workspaceId, benchmarkAccountId: benchmarkId, userId: ownerId, sampleIds: snapshotIds.slice(0, 5) })).rejects.toMatchObject({ code: "BENCHMARK_STUDY_IN_PROGRESS" });

    await db.benchmarkStudy.update({ where: { id: first.id }, data: { status: "COMPLETED", output: studyOutput(first.samples.map(({ id }) => id)) } });
    const method = await createMethodFromBenchmarkStudy({ workspaceId, ownerUserId: ownerId, benchmarkStudyId: first.id, methodIndex: 0 });
    expect(method).toMatchObject({ status: "SAVED", current: { source: { sourceItemId: null, benchmarkStudyId: first.id, benchmarkAccountName: "对标账号", sampleCount: 6 } } });
    const storedVersion = await db.methodVersion.findUniqueOrThrow({ where: { id: method.current.id } });
    expect(storedVersion).toMatchObject({ sourceBenchmarkStudyId: first.id, sourceItemId: null, sourceMaterialAnalysisId: null, sourceTranscriptId: null });
    await expect(getMethod({ workspaceId, ownerUserId: colleagueId, methodId: method.id })).resolves.toBeNull();

    const second = await createBenchmarkStudy({ workspaceId, benchmarkAccountId: benchmarkId, userId: ownerId, sampleIds: snapshotIds.slice(0, 5) });
    await db.benchmarkStudy.update({ where: { id: second.id }, data: { status: "FAILED", errorCode: "FIXTURE_FAILURE", errorMessage: "这次研究没有完成。" } });
    const history = await listBenchmarkStudies({ workspaceId, benchmarkAccountId: benchmarkId });
    expect(history.map(({ status }) => status)).toEqual(["FAILED", "COMPLETED"]);
    expect(history.map(({ version }) => version)).toEqual([2, 1]);
    expect(enqueueBenchmarkStudy).toHaveBeenCalledTimes(2);
  });

  it("rejects another account's sample and Viewer writes", async () => {
    await expect(createBenchmarkStudy({ workspaceId, benchmarkAccountId: benchmarkId, userId: ownerId, sampleIds: [snapshotIds[6]!] })).rejects.toMatchObject({ code: "BENCHMARK_INVALID_SAMPLES" });
    await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: ownerId } }, data: { role: "VIEWER" } });
    await expect(createBenchmarkStudy({ workspaceId, benchmarkAccountId: benchmarkId, userId: ownerId, sampleIds: [snapshotIds[0]!] })).rejects.toMatchObject({ code: "BENCHMARK_FORBIDDEN" });
    await expect(createBenchmarkPlaybookStudy({ workspaceId, benchmarkAccountId: benchmarkId, userId: ownerId, sampleIds: snapshotIds.slice(0, 3) })).rejects.toMatchObject({ code: "BENCHMARK_FORBIDDEN" });
    await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId: ownerId } }, data: { role: "OWNER" } });
  });

  it("keeps M4 and M8 eligibility independent", async () => {
    const candidates = await listBenchmarkCandidates({ workspaceId, benchmarkAccountId: benchmarkId });
    expect(candidates.find(({ sourceItemId }) => sourceItemId === m8OnlySourceId)).toMatchObject({ ready: false, playbookReady: true, materialAnalysisId: null, materialDistillationVersion: 1 });
    expect(candidates.find(({ id }) => id === m4OnlySnapshotId)).toMatchObject({ ready: true, playbookReady: false });
    expect(candidates.find(({ id }) => id === invalidM7SnapshotId)).toMatchObject({ playbookReady: false });
    expect(candidates.find(({ id }) => id === invalidM7VersionSnapshotId)).toMatchObject({ playbookReady: false });
    await expect(createBenchmarkStudy({ workspaceId, benchmarkAccountId: benchmarkId, userId: ownerId, sampleIds: [m8OnlySnapshotId] })).rejects.toMatchObject({ code: "BENCHMARK_SAMPLE_NOT_READY" });
    await expect(createBenchmarkPlaybookStudy({ workspaceId, benchmarkAccountId: benchmarkId, userId: ownerId, sampleIds: [snapshotIds[0]!, snapshotIds[1]!, m4OnlySnapshotId] })).rejects.toMatchObject({ code: "BENCHMARK_DISTILLATION_NOT_READY" });
    await expect(createBenchmarkPlaybookStudy({ workspaceId, benchmarkAccountId: benchmarkId, userId: ownerId, sampleIds: [snapshotIds[0]!, snapshotIds[1]!, invalidM7SnapshotId] })).rejects.toMatchObject({ code: "BENCHMARK_DISTILLATION_NOT_READY" });
    await expect(createBenchmarkPlaybookStudy({ workspaceId, benchmarkAccountId: benchmarkId, userId: ownerId, sampleIds: [snapshotIds[0]!, snapshotIds[1]!, invalidM7VersionSnapshotId] })).rejects.toMatchObject({ code: "BENCHMARK_DISTILLATION_NOT_READY" });
  });

  it("pins exact M7 versions for playbook history and keeps source deletion protected", async () => {
    const candidates = await listBenchmarkCandidates({ workspaceId, benchmarkAccountId: benchmarkId });
    expect(candidates.find(({ sourceItemId }) => sourceItemId === m8OnlySourceId)).toMatchObject({ ready: false, playbookReady: true });
    const study = await createBenchmarkPlaybookStudy({ workspaceId, benchmarkAccountId: benchmarkId, userId: ownerId, sampleIds: [snapshotIds[0]!, snapshotIds[1]!, m8OnlySnapshotId] });
    expect(study).toMatchObject({ kind: "PLAYBOOKS", version: 3, sampleCount: 3, status: "PROCESSING", samples: expect.arrayContaining([expect.objectContaining({ sourceItemId: m8OnlySourceId, materialAnalysisId: null, materialAnalysisVersion: null, materialDistillationVersion: 1 }), expect.objectContaining({ materialAnalysisId: expect.any(String), materialDistillationVersion: 1 })]) });
    const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: sourceIds[0] } });
    await db.materialDistillation.create({ data: { workspaceId, sourceItemId: sourceIds[0]!, createdById: ownerId, version: 2, mode: "COMPREHENSIVE", status: "COMPLETED", schemaVersion: "material-distillation-v2", output: distillationOutput("后来更新的依据"), transcriptUpdatedAtAtDistillation: transcript.updatedAt } });
    const history = await listBenchmarkStudies({ workspaceId, benchmarkAccountId: benchmarkId });
    expect(history[0]).toMatchObject({ id: study.id, kind: "PLAYBOOKS", samples: expect.arrayContaining([expect.objectContaining({ sourceItemId: sourceIds[0], materialDistillationVersion: 1 })]) });
    await expect(db.sourceItem.delete({ where: { id: m8OnlySourceId } })).rejects.toMatchObject({ code: "P2003" });
    await db.sourceItem.update({ where: { id: m8OnlySourceId }, data: { status: "ARCHIVED" } });
    await expect(listBenchmarkStudies({ workspaceId, benchmarkAccountId: benchmarkId })).resolves.toEqual(expect.arrayContaining([expect.objectContaining({ id: study.id })]));
    await db.sourceItem.update({ where: { id: m8OnlySourceId }, data: { status: "READY" } });
    expect(enqueueBenchmarkPlaybookStudy).toHaveBeenCalledTimes(1);
  });

  it("creates versioned creator profiles from five locked M7 results without depending on M8", async () => {
    await db.benchmarkStudy.updateMany({ where: { workspaceId, status: "PROCESSING" }, data: { status: "FAILED", errorCode: "FIXTURE_STOP", errorMessage: "测试结束。" } });
    const m4 = (await listBenchmarkStudies({ workspaceId, benchmarkAccountId: benchmarkId })).find((study) => study.kind === "ACCOUNT_RESEARCH" && study.status === "COMPLETED");
    await expect(createBenchmarkCreatorProfileStudy({ workspaceId, benchmarkAccountId: benchmarkId, userId: ownerId, sampleIds: [snapshotIds[0]!, snapshotIds[1]!, snapshotIds[2]!, snapshotIds[3]!, snapshotIds[6]!] })).rejects.toMatchObject({ code: "BENCHMARK_INVALID_SAMPLES" });
    const first = await createBenchmarkCreatorProfileStudy({ workspaceId, benchmarkAccountId: benchmarkId, userId: ownerId, sampleIds: snapshotIds.slice(0, 5) });
    expect(first).toMatchObject({ kind: "CREATOR_PROFILE", version: 4, sampleCount: 5, status: "PROCESSING", samples: expect.arrayContaining([expect.objectContaining({ sourceItemId: sourceIds[0], materialDistillationVersion: 2 }), expect.objectContaining({ sourceItemId: sourceIds[1], materialDistillationVersion: 1 })]) });
    const stored = await db.benchmarkStudy.findUniqueOrThrow({ where: { id: first.id }, select: { output: true } });
    const manifest = benchmarkCreatorProfileInputV4Schema.parse(stored.output);
    expect(manifest.accountResearch).toEqual(m4 ? { studyId: m4.id, version: m4.version } : null);
    expect(manifest.priorProfileVersion).toBeNull();
    expect(JSON.stringify(manifest)).not.toContain("PLAYBOOKS");
    const completed = benchmarkCreatorProfileOutputV4Schema.parse({ kind: "CREATOR_PROFILE", schemaVersion: "benchmark-creator-profile-v4", message: "Fixture profile", account: manifest.account, inputs: manifest.distillations, accountResearch: manifest.accountResearch, priorProfileVersion: null, videoSignals: manifest.distillations.map((lock, index) => ({ sampleRef: `V00${index + 1}`, sampleId: lock.sampleId, sourceItemId: lock.sourceItemId, primaryTopic: "招生成交", topicSignals: [], styleSignals: [] })), aggregatedSignals: [], cards: [{ code: "PROFILE", status: "OBSERVE", claims: [{ id: "C001", text: "从当前样本看，这是教培经营内容账号。", evidenceRefs: ["E001"], evidence: [{ evidenceRef: "E001", ...manifest.distillations[0]!, itemKind: "HIGHLIGHT", itemKey: "0", sourceRefs: ["T001"] }], derivedFrom: [] }] }] });
    await db.benchmarkStudy.update({ where: { id: first.id }, data: { status: "COMPLETED", output: completed } });
    const second = await createBenchmarkCreatorProfileStudy({ workspaceId, benchmarkAccountId: benchmarkId, userId: ownerId, sampleIds: snapshotIds.slice(0, 5) });
    expect(second).toMatchObject({ kind: "CREATOR_PROFILE", version: 5, status: "PROCESSING" });
    const secondStored = await db.benchmarkStudy.findUniqueOrThrow({ where: { id: second.id }, select: { output: true } });
    const secondManifest = benchmarkCreatorProfileInputV4Schema.parse(secondStored.output);
    expect(secondManifest.priorProfileVersion).toBe(first.version);
    expect(secondManifest).not.toHaveProperty("priorProfile");
    const history = await listBenchmarkStudies({ workspaceId, benchmarkAccountId: benchmarkId });
    expect(history.find(({ id }) => id === first.id)).toMatchObject({ kind: "CREATOR_PROFILE", status: "COMPLETED", output: { message: "Fixture profile" } });
    expect(enqueueBenchmarkCreatorProfileStudy).toHaveBeenCalledTimes(2);
  });
});
