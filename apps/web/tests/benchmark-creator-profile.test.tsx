import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import { db } from "@content-center/db";
import { benchmarkAnalysisOutputSchema, benchmarkCreatorProfileOutputSchema, benchmarkCreatorProfileOutputV3Schema, benchmarkCreatorProfileOutputV4Schema, benchmarkPlaybookInputSchema, benchmarkPlaybookOutputSchema, materialDistillationGenerationSchema } from "@content-center/providers";
import { getBenchmarkCreatorDetail } from "../server/discovery/benchmark-creator-read-model";
import { listBenchmarkStudies } from "../server/discovery/benchmark-study-service";

const suffix = randomUUID();
const ownerId = `creator-profile-${suffix}`;
const otherOwnerId = `creator-profile-other-${suffix}`;
let workspaceId = "";
let otherWorkspaceId = "";
let benchmarkId = "";
let emptyBenchmarkId = "";

function evidence(quote: string) {
  return [{ quote, sourceRef: "T001", kind: "TEXT_BLOCK" as const, index: 0 }];
}

function discoveryOutput(quote: string, title: string) {
  return materialDistillationGenerationSchema.parse({ mode: "COMPREHENSIVE", hasLongTermValue: true, message: "已整理。", highlights: [{ type: "method", quality: "WORTH_KEEPING", title, essence: "先用真实内容说明判断，再进入具体做法。", whyWorthAttention: "", howTo: [], applicable: [], boundaries: [], evidence: evidence(quote) }], copywriting: null });
}

function copywritingOutput(quote: string) {
  return materialDistillationGenerationSchema.parse({
    mode: "COPYWRITING", hasLongTermValue: true, message: "已整理文案。", highlights: [],
    copywriting: { coreProposition: "把判断说清楚", angle: "从员工熟悉的问题切入", openingLogic: "开头直接提出判断", progression: ["提出判断", "解释原因", "给出行动"], skeleton: [], evidenceFunction: "使用一个真实例子说明", reusableStrategies: ["先判断再解释"], doNotCopy: ["不要照搬来源经历"], secondEditDirections: ["换成自己的事实"], rewriteSkeleton: [], evidence: evidence(quote) },
  });
}

describe("benchmark creator profile read model", () => {
  beforeAll(async () => {
    await db.user.createMany({ data: [{ id: ownerId, name: "Profile Owner", email: `${ownerId}@example.test` }, { id: otherOwnerId, name: "Other Owner", email: `${otherOwnerId}@example.test` }] });
    const [workspace, otherWorkspace] = await Promise.all([
      db.workspace.create({ data: { name: "Creator Profile", slug: `creator-profile-${suffix}`, members: { create: { userId: ownerId, role: "OWNER" } } } }),
      db.workspace.create({ data: { name: "Other Profile", slug: `creator-profile-other-${suffix}`, members: { create: { userId: otherOwnerId, role: "OWNER" } } } }),
    ]);
    workspaceId = workspace.id; otherWorkspaceId = otherWorkspace.id;
    const [benchmark, emptyBenchmark] = await Promise.all([
      db.benchmarkAccount.create({ data: { workspaceId, platform: "DOUYIN", externalAccountId: `creator-${suffix}`, name: "真实研究博主", bio: "分享可以核对的内容经验", avatarUrl: "https://example.test/avatar.jpg", createdById: ownerId } }),
      db.benchmarkAccount.create({ data: { workspaceId, platform: "DOUYIN", externalAccountId: `empty-${suffix}`, name: "还没有资料的博主", createdById: ownerId } }),
    ]);
    benchmarkId = benchmark.id; emptyBenchmarkId = emptyBenchmark.id;

    const snapshots: Array<{ id: string; externalId: string }> = [];
    for (let index = 0; index < 20; index += 1) snapshots.push(await db.benchmarkContentSnapshot.create({ data: { workspaceId, benchmarkAccountId: benchmarkId, platform: "DOUYIN", externalId: `profile-work-${suffix}-${index}`, title: `账号内容 ${index + 1} #教培运营 ${index < 8 ? "#短视频招生" : ""}`, url: `https://example.test/work-${index}`, coverUrl: index < 4 ? `https://example.test/cover-${index}.jpg` : null, metadata: {} } }));

    const sources = [];
    const distillations: Array<{ id: string }> = [];
    for (let index = 0; index < 6; index += 1) {
      const quote = `可核对来源 ${index + 1}`;
      const source = await db.sourceItem.create({ data: { workspaceId, createdById: ownerId, sourceType: "VIDEO", sourcePlatform: "DOUYIN", externalId: snapshots[index]!.externalId, title: `代表视频 ${index + 1}`, status: "READY", ...(index < 5 ? { transcript: { create: { workspaceId, provider: "FIXTURE", providerMode: "REAL", fullText: quote, segments: [] } } } : {}) } });
      sources.push(source);
      if (index < 5) {
        const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } });
        distillations.push(await db.materialDistillation.create({ data: { workspaceId, sourceItemId: source.id, createdById: ownerId, version: 1, mode: index === 1 ? "COPYWRITING" : "COMPREHENSIVE", status: "COMPLETED", schemaVersion: "material-distillation-v2", output: index === 1 ? copywritingOutput(quote) : discoveryOutput(quote, `精华 ${index + 1}`), transcriptUpdatedAtAtDistillation: transcript.updatedAt } }));
      }
    }

    const research = await db.benchmarkStudy.create({ data: { workspaceId, benchmarkAccountId: benchmarkId, createdById: ownerId, version: 1, status: "COMPLETED", sampleCount: 2, insufficientSamples: true, samples: { create: [{ sourceItemId: sources[0]!.id, snapshotId: snapshots[0]!.id }, { sourceItemId: sources[1]!.id, snapshotId: snapshots[1]!.id }] } }, include: { samples: true } });
    const researchEvidence = research.samples.map((sample, index) => ({ sampleId: sample.id, quote: `可核对来源 ${index + 1}` }));
    const finding = { name: "先给判断", summary: "两条内容都先说明判断，再解释原因。", occurrenceSampleIds: research.samples.map(({ id }) => id), exceptionSampleIds: [], evidence: researchEvidence };
    await db.benchmarkStudy.update({ where: { id: research.id }, data: { output: benchmarkAnalysisOutputSchema.parse({ topicDirections: [finding], openingPatterns: [finding], structures: [], persuasionMethods: [], expressionHabits: [], endings: [], commonMethods: [], exceptions: [], repeatedCaseNotes: [], stableMethodsFound: false, message: "只描述所选内容。" }) } });

    const playbook = await db.benchmarkStudy.create({ data: { workspaceId, benchmarkAccountId: benchmarkId, createdById: ownerId, version: 2, status: "COMPLETED", sampleCount: 3, insufficientSamples: false, samples: { create: sources.slice(0, 3).map((source, index) => ({ sourceItemId: source.id, snapshotId: snapshots[index]!.id })) } }, include: { samples: true } });
    const locks = playbook.samples.map((sample, index) => ({ sampleId: sample.id, sourceItemId: sample.sourceItemId, materialDistillationId: distillations[index]!.id, materialDistillationVersion: 1 }));
    await db.benchmarkStudy.update({ where: { id: playbook.id }, data: { output: benchmarkPlaybookOutputSchema.parse({ kind: "PLAYBOOKS", schemaVersion: "benchmark-playbook-v1", message: "找到一套常见搭配。", inputs: locks, playbooks: [{ name: "判断后进入行动", maturity: "OBSERVE", elements: ["明确判断", "具体行动"], flow: "先说明判断，再解释并给行动。", useCase: "需要把观点说清楚时。", exceptions: "不是每条内容都这样组织。", doNotCopy: "不要照搬来源事实。", supportSampleIds: playbook.samples.slice(0, 2).map(({ id }) => id), exceptionSampleIds: [playbook.samples[2]!.id], evidence: locks.slice(0, 2).map((lock, index) => ({ evidenceRef: `V00${index + 1}-H01`, ...lock, itemKind: "HIGHLIGHT", itemKey: "0", sourceRefs: ["T001"] })) }] }) } });
    const failed = await db.benchmarkStudy.create({ data: { workspaceId, benchmarkAccountId: benchmarkId, createdById: ownerId, version: 3, status: "FAILED", sampleCount: 3, insufficientSamples: false, errorCode: "LLM_INVALID_RESPONSE", samples: { create: sources.slice(0, 3).map((source, index) => ({ sourceItemId: source.id, snapshotId: snapshots[index]!.id })) } }, include: { samples: true } });
    await db.benchmarkStudy.update({ where: { id: failed.id }, data: { output: benchmarkPlaybookInputSchema.parse({ kind: "PLAYBOOK_INPUT", schemaVersion: "benchmark-playbook-v1", distillations: failed.samples.map((sample, index) => ({ sampleId: sample.id, sourceItemId: sample.sourceItemId, materialDistillationId: distillations[index]!.id, materialDistillationVersion: 1 })) }) } });

    const creatorProfile = await db.benchmarkStudy.create({ data: { workspaceId, benchmarkAccountId: benchmarkId, createdById: ownerId, version: 4, status: "COMPLETED", sampleCount: 5, insufficientSamples: false, samples: { create: sources.slice(0, 5).map((source, index) => ({ sourceItemId: source.id, snapshotId: snapshots[index]!.id })) } }, include: { samples: true } });
    const creatorLocks = creatorProfile.samples.map((sample, index) => ({ sampleId: sample.id, sourceItemId: sample.sourceItemId, materialDistillationId: distillations[index]!.id, materialDistillationVersion: 1 }));
    const creatorEvidence = (sampleIndex: number, evidenceRef: string) => ({ evidenceRef, ...creatorLocks[sampleIndex]!, itemKind: "HIGHLIGHT" as const, itemKey: "0", sourceRefs: ["T001"] });
    await db.benchmarkStudy.update({ where: { id: creatorProfile.id }, data: { output: benchmarkCreatorProfileOutputSchema.parse({ kind: "CREATOR_PROFILE", schemaVersion: "benchmark-creator-profile-v1", message: "已形成两项账号画像观察。", account: { name: "真实研究博主", platform: "DOUYIN", bio: "分享可以核对的内容经验", tags: ["教培运营"] }, inputs: creatorLocks, accountResearch: { studyId: research.id, version: research.version }, sections: [{ code: "POSITIONING", text: "主要讨论可以核对的教培内容经验。", evidenceRefs: ["E001"], evidence: [creatorEvidence(0, "E001")] }, { code: "THEME", text: "多条内容反复讨论先给判断再解释。", evidenceRefs: ["E001", "E002"], evidence: [creatorEvidence(0, "E001"), creatorEvidence(1, "E002")] }] }) } });

    const creatorProfileV3 = await db.benchmarkStudy.create({ data: { workspaceId, benchmarkAccountId: benchmarkId, createdById: ownerId, version: 5, status: "COMPLETED", sampleCount: 5, insufficientSamples: false, samples: { create: sources.slice(0, 5).map((source, index) => ({ sourceItemId: source.id, snapshotId: snapshots[index]!.id })) } }, include: { samples: true } });
    const creatorLocksV3 = creatorProfileV3.samples.map((sample, index) => ({ sampleId: sample.id, sourceItemId: sample.sourceItemId, materialDistillationId: distillations[index]!.id, materialDistillationVersion: 1 }));
    const creatorEvidenceV3 = (sampleIndex: number, evidenceRef: string) => ({ evidenceRef, ...creatorLocksV3[sampleIndex]!, itemKind: "HIGHLIGHT" as const, itemKey: "0", sourceRefs: ["T001"] });
    await db.benchmarkStudy.update({ where: { id: creatorProfileV3.id }, data: { output: benchmarkCreatorProfileOutputV3Schema.parse({ kind: "CREATOR_PROFILE", schemaVersion: "benchmark-creator-profile-v3", message: "已形成一张 claim 画像卡。", account: { name: "真实研究博主", platform: "DOUYIN", bio: "分享可以核对的内容经验", tags: ["教培运营"] }, inputs: creatorLocksV3, accountResearch: { studyId: research.id, version: research.version }, priorProfileVersion: 4, cards: [{ code: "TOPIC_STYLE", status: "OBSERVE", claims: [{ id: "C001", text: "当前样本从具体问题进入判断。", evidenceRefs: ["E001", "E002"], evidence: [creatorEvidenceV3(0, "E001"), creatorEvidenceV3(1, "E002")], derivedFrom: [] }] }] }) } });

    const creatorProfileV4 = await db.benchmarkStudy.create({ data: { workspaceId, benchmarkAccountId: benchmarkId, createdById: ownerId, version: 6, status: "COMPLETED", sampleCount: 5, insufficientSamples: false, samples: { create: sources.slice(0, 5).map((source, index) => ({ sourceItemId: source.id, snapshotId: snapshots[index]!.id })) } }, include: { samples: true } });
    const creatorLocksV4 = creatorProfileV4.samples.map((sample, index) => ({ sampleId: sample.id, sourceItemId: sample.sourceItemId, materialDistillationId: distillations[index]!.id, materialDistillationVersion: 1 }));
    const creatorEvidenceV4 = (sampleIndex: number, evidenceRef: string) => ({ evidenceRef, ...creatorLocksV4[sampleIndex]!, itemKind: "HIGHLIGHT" as const, itemKey: "0", sourceRefs: ["T001"] });
    await db.benchmarkStudy.update({ where: { id: creatorProfileV4.id }, data: { output: benchmarkCreatorProfileOutputV4Schema.parse({ kind: "CREATOR_PROFILE", schemaVersion: "benchmark-creator-profile-v4", message: "已从单视频信号形成画像。", account: { name: "真实研究博主", platform: "DOUYIN", bio: "面向教培机构老板和校区管理者", tags: ["教培运营"] }, inputs: creatorLocksV4, accountResearch: { studyId: research.id, version: research.version }, priorProfileVersion: 5, videoSignals: creatorLocksV4.map((lock, index) => ({ sampleRef: `V00${index + 1}`, sampleId: lock.sampleId, sourceItemId: lock.sourceItemId, primaryTopic: "招生成交", topicSignals: [], styleSignals: [] })), aggregatedSignals: [], cards: [{ code: "TOPIC_STYLE", status: "OBSERVE", claims: [{ id: "C001", text: "当前研究的视频里，多次从具体问题切入。", evidenceRefs: ["E001", "E002"], evidence: [creatorEvidenceV4(0, "E001"), creatorEvidenceV4(1, "E002")], derivedFrom: [] }] }] }) } });

    await db.methodAsset.create({ data: { workspaceId, ownerUserId: ownerId, status: "SAVED", versions: { create: { version: 1, title: "已经留下的方法", steps: ["先判断"], applicableScenarios: ["解释问题"], boundaries: ["不照搬事实"], sourceMaterialDistillationId: distillations[0]!.id, evidence: evidence("可核对来源 1"), editedById: ownerId } } } });

    const otherAccount = await db.benchmarkAccount.create({ data: { workspaceId: otherWorkspaceId, platform: "DOUYIN", externalAccountId: `other-${suffix}`, name: "其他空间博主", createdById: otherOwnerId } });
    await db.benchmarkContentSnapshot.create({ data: { workspaceId: otherWorkspaceId, benchmarkAccountId: otherAccount.id, platform: "DOUYIN", externalId: `other-work-${suffix}`, title: "不应泄漏的内容", url: "https://example.test/other", metadata: {} } });
  });

  afterAll(async () => {
    await db.methodAsset.deleteMany({ where: { workspaceId } });
    await db.benchmarkStudy.deleteMany({ where: { workspaceId } });
    await db.workspace.deleteMany({ where: { id: { in: [workspaceId, otherWorkspaceId] } } });
    await db.user.deleteMany({ where: { id: { in: [ownerId, otherOwnerId] } } });
    await db.$disconnect();
  });

  it("summarizes real existing sources, research, optional patterns, and saved methods", async () => {
    const profile = await getBenchmarkCreatorDetail({ workspaceId, benchmarkAccountId: benchmarkId, ownerUserId: ownerId });
    expect(profile).toMatchObject({ account: { name: "真实研究博主", tags: ["教培运营", "短视频招生"] }, stats: { discovered: 20, collected: 6, studied: 5, distilled: 5, copywriting: 1 } });
    expect(profile?.representativeSources).toHaveLength(6);
    expect(profile?.representativeSources.find(({ title }) => title === "代表视频 6")).toMatchObject({ hasTranscript: false, hasDistillation: false });
    expect(profile?.highlights.map(({ title }) => title).sort()).toEqual(["精华 1", "精华 3", "精华 4", "精华 5"]);
    expect(profile?.highlights.every(({ sourceItemId }) => Boolean(sourceItemId))).toBe(true);
    expect(profile?.copywriting).toEqual([expect.objectContaining({ sourceTitle: "代表视频 2", core: "把判断说清楚" })]);
    expect(profile?.accountResearch).toMatchObject({ sampleCount: 2, groups: [expect.objectContaining({ title: "常见主题" }), expect.objectContaining({ title: "常用开头" })] });
    expect(profile?.playbooks).toEqual([expect.objectContaining({ name: "判断后进入行动", maturity: "OBSERVE", sources: expect.arrayContaining([expect.objectContaining({ title: "代表视频 1" })]) })]);
    expect(profile?.creatorProfile).toMatchObject({ version: 6, message: "已从单视频信号形成画像。", sections: [expect.objectContaining({ code: "PROFILE", status: "CLEAR", text: "• 从当前研究内容看，这个账号主要面向教培机构老板和校区管理者，内容主要涉及招生等教培经营问题。" }), expect.objectContaining({ code: "TOPIC_STYLE", status: "OBSERVE", text: "• 当前研究的视频里，多次从具体问题切入。", sources: [expect.objectContaining({ title: "代表视频 1" }), expect.objectContaining({ title: "代表视频 2" })] })] });
    const history = await listBenchmarkStudies({ workspaceId, benchmarkAccountId: benchmarkId });
    expect(history.find(({ version }) => version === 4)?.output).toMatchObject({ schemaVersion: "benchmark-creator-profile-v1" });
    expect(history.find(({ version }) => version === 5)?.output).toMatchObject({ schemaVersion: "benchmark-creator-profile-v3" });
    expect(profile?.savedMethods).toEqual([expect.objectContaining({ title: "已经留下的方法", status: "SAVED" })]);
    expect(JSON.stringify(profile)).not.toContain("不应泄漏的内容");
    await expect(getBenchmarkCreatorDetail({ workspaceId: otherWorkspaceId, benchmarkAccountId: benchmarkId, ownerUserId: otherOwnerId })).resolves.toBeNull();
  });

  it("uses employee language and links sources back to the existing material detail", async () => {
    const source = await readFile(new URL("../components/discovery/benchmark-creator-profile.tsx", import.meta.url), "utf8");
    for (const text of ["概览", "代表内容", "怎么做内容", "我们能学什么", "观点与精华", "AI 账号画像", "生成账号画像", "更新画像", "他大概是一个什么类型的博主", "他最近主要在拍什么", "他经常怎么选题", "他通常怎么讲、怎么证明", "他反复在讲什么", "哪些不要直接照搬", "比较明确", "目前观察到", "当前研究内容还不足以判断", "视频怎么写", "账号研究", "常见内容组合", "我们已经留下了什么", "查看资料", "查看依据", "查看完整资料"]) expect(source).toContain(text);
    expect(source).toContain("href={`/library/${source.id}`}");
    expect(source).toContain('role="dialog"');
    expect(source).toContain('role="tablist"');
    expect(source).toContain("profile.representativeSources.slice(0, 4)");
    expect(source).toContain("profile.highlights.slice(0, 3)");
    expect(source).toContain('data-selected={selected === highlight ? "true" : "false"}');
    for (const term of [">M1<", ">M4<", ">M7<", ">M8<", "BenchmarkStudy", "MaterialDistillation", "SourceRef", ">Schema<", ">Provider<", ">Worker<", ">AIRun<", ">JSON<", "Version Lock"]) expect(source).not.toContain(term);
  });

  it("keeps the heavy research tools behind the research tab and defaults to the profile", async () => {
    const source = await readFile(new URL("../components/discovery/benchmark-workspace.tsx", import.meta.url), "utf8");
    expect(source).toContain('useState<BenchmarkView>("OVERVIEW")');
    expect(source).toContain('view === "METHOD"');
    expect(source).toContain('view === "LEARN"');
    expect(source).toContain('view === "CONTENT"');
    expect(source).toContain('view === "RESEARCH"');
    expect(source).toContain("<RepresentativeContent");
    expect(source).toContain("<StudyHistory");
    expect(source).toContain('study.kind === "PLAYBOOKS" && study.status === "FAILED"');
    for (const text of ["benchmark-research-workspace", "搜索代表内容", "为什么选这些？", "清空选择", "实验性内容模式研究", "查看更早的", "benchmark-account-works"]) expect(source).toContain(text);
    expect(source).toContain("studies.slice(0, 3)");
  });

  it("keeps the creator page usable when every optional research area is empty", async () => {
    const profile = await getBenchmarkCreatorDetail({ workspaceId, benchmarkAccountId: emptyBenchmarkId, ownerUserId: ownerId });
    if (!profile) throw new Error("empty profile missing");
    expect(profile).toMatchObject({ stats: { discovered: 0, collected: 0, studied: 0, distilled: 0, copywriting: 0 }, representativeSources: [], highlights: [], copywriting: [], accountResearch: null, playbooks: [], creatorProfile: null, savedMethods: [] });
    const source = await readFile(new URL("../components/discovery/benchmark-creator-profile.tsx", import.meta.url), "utf8");
    for (const text of ["还没有收录这个博主的代表内容。", "这些内容还没有完成精华提炼。", "还没有完成账号层研究。", "暂时还没有形成可靠判断", "还没有从这个博主的内容中保存创作方法。"]) expect(source).toContain(text);
  });
});
