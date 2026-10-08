import "server-only";

import { db, type Prisma } from "@content-center/db";
import {
  benchmarkAnalysisOutputSchema,
  benchmarkCreatorProfileInputSchema,
  benchmarkCreatorProfileInputV2Schema,
  benchmarkCreatorProfileInputV3Schema,
  benchmarkCreatorProfileInputV4Schema,
  benchmarkCreatorProfileOutputSchema,
  benchmarkCreatorProfileOutputV2Schema,
  benchmarkCreatorProfileOutputV3Schema,
  benchmarkCreatorProfileOutputV4Schema,
  benchmarkPlaybookInputSchema,
  benchmarkPlaybookOutputSchema,
  materialAnalysisOutputSchema,
  materialDistillationGenerationSchema,
  type BenchmarkAnalysisOutput,
  type BenchmarkCreatorProfileOutput,
  type BenchmarkCreatorProfileOutputV2,
  type BenchmarkCreatorProfileOutputV3,
  type BenchmarkCreatorProfileOutputV4,
  type BenchmarkPlaybookOutput,
} from "@content-center/providers";
import { enqueueBenchmarkCreatorProfileStudy, enqueueBenchmarkPlaybookStudy, enqueueBenchmarkStudy } from "@content-center/worker/queue";
import { z } from "zod";

const sampleId = z.string().trim().min(1).max(200);
export const createBenchmarkStudySchema = z.object({
  sampleIds: z.array(sampleId).min(1).max(10),
}).strict().superRefine((value, context) => {
  if (new Set(value.sampleIds).size !== value.sampleIds.length) context.addIssue({ code: "custom", path: ["sampleIds"], message: "代表内容不能重复。" });
});

export const createBenchmarkPlaybookStudySchema = z.object({
  sampleIds: z.array(sampleId).min(3).max(10),
}).strict().superRefine((value, context) => {
  if (new Set(value.sampleIds).size !== value.sampleIds.length) context.addIssue({ code: "custom", path: ["sampleIds"], message: "代表内容不能重复。" });
});

export const createBenchmarkCreatorProfileStudySchema = z.object({
  sampleIds: z.array(sampleId).min(5).max(10),
}).strict().superRefine((value, context) => {
  if (new Set(value.sampleIds).size !== value.sampleIds.length) context.addIssue({ code: "custom", path: ["sampleIds"], message: "代表内容不能重复。" });
});

export class BenchmarkStudyError extends Error {
  constructor(readonly code: "BENCHMARK_NOT_FOUND" | "BENCHMARK_STUDY_NOT_FOUND" | "BENCHMARK_INVALID_SAMPLES" | "BENCHMARK_SAMPLE_NOT_READY" | "BENCHMARK_DISTILLATION_NOT_READY" | "BENCHMARK_STUDY_IN_PROGRESS" | "BENCHMARK_QUEUE_UNAVAILABLE" | "BENCHMARK_FORBIDDEN", message: string) {
    super(message);
    this.name = "BenchmarkStudyError";
  }
}

export type BenchmarkCandidateDTO = {
  id: string;
  externalId: string;
  title: string;
  url: string;
  coverUrl: string | null;
  publishedAt: string | null;
  observedAt: string;
  sourceItemId: string | null;
  materialAnalysisId: string | null;
  materialAnalysisVersion: number | null;
  materialDistillationId: string | null;
  materialDistillationVersion: number | null;
  ready: boolean;
  playbookReady: boolean;
  hasTranscript?: boolean;
  contentType?: "VIDEO" | "IMAGE" | "ARTICLE" | "UNKNOWN";
};

type BenchmarkStudySampleDTO = {
  id: string;
  sourceItemId: string;
  title: string;
  materialAnalysisId: string | null;
  materialAnalysisVersion: number | null;
  materialDistillationId: string | null;
  materialDistillationVersion: number | null;
};

export type BenchmarkStudyDTO = {
  id: string;
  collectionRunId: string | null;
  benchmarkAccountId: string;
  benchmarkAccountName: string;
  version: number;
  status: "PROCESSING" | "COMPLETED" | "FAILED";
  sampleCount: number;
  insufficientSamples: boolean;
  kind: "ACCOUNT_RESEARCH" | "PLAYBOOKS" | "CREATOR_PROFILE";
  output: BenchmarkAnalysisOutput | BenchmarkPlaybookOutput | BenchmarkCreatorProfileOutput | BenchmarkCreatorProfileOutputV2 | BenchmarkCreatorProfileOutputV3 | BenchmarkCreatorProfileOutputV4 | null;
  aiRunId: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  createdAt: string;
  updatedAt: string;
  samples: BenchmarkStudySampleDTO[];
};

function json(value: unknown): Prisma.InputJsonValue {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function storedStudy(value: Prisma.JsonValue | null) {
  const creatorProfileV4 = benchmarkCreatorProfileOutputV4Schema.safeParse(value);
  if (creatorProfileV4.success) return { kind: "CREATOR_PROFILE" as const, output: creatorProfileV4.data, locks: creatorProfileV4.data.inputs };
  const creatorProfileInputV4 = benchmarkCreatorProfileInputV4Schema.safeParse(value);
  if (creatorProfileInputV4.success) return { kind: "CREATOR_PROFILE" as const, output: null, locks: creatorProfileInputV4.data.distillations };
  const creatorProfileV3 = benchmarkCreatorProfileOutputV3Schema.safeParse(value);
  if (creatorProfileV3.success) return { kind: "CREATOR_PROFILE" as const, output: creatorProfileV3.data, locks: creatorProfileV3.data.inputs };
  const creatorProfileInputV3 = benchmarkCreatorProfileInputV3Schema.safeParse(value);
  if (creatorProfileInputV3.success) return { kind: "CREATOR_PROFILE" as const, output: null, locks: creatorProfileInputV3.data.distillations };
  const creatorProfileV2 = benchmarkCreatorProfileOutputV2Schema.safeParse(value);
  if (creatorProfileV2.success) return { kind: "CREATOR_PROFILE" as const, output: creatorProfileV2.data, locks: creatorProfileV2.data.inputs };
  const creatorProfileInputV2 = benchmarkCreatorProfileInputV2Schema.safeParse(value);
  if (creatorProfileInputV2.success) return { kind: "CREATOR_PROFILE" as const, output: null, locks: creatorProfileInputV2.data.distillations };
  const creatorProfile = benchmarkCreatorProfileOutputSchema.safeParse(value);
  if (creatorProfile.success) return { kind: "CREATOR_PROFILE" as const, output: creatorProfile.data, locks: creatorProfile.data.inputs };
  const creatorProfileInput = benchmarkCreatorProfileInputSchema.safeParse(value);
  if (creatorProfileInput.success) return { kind: "CREATOR_PROFILE" as const, output: null, locks: creatorProfileInput.data.distillations };
  const playbooks = benchmarkPlaybookOutputSchema.safeParse(value);
  if (playbooks.success) return { kind: "PLAYBOOKS" as const, output: playbooks.data, locks: playbooks.data.inputs };
  const playbookInput = benchmarkPlaybookInputSchema.safeParse(value);
  if (playbookInput.success) return { kind: "PLAYBOOKS" as const, output: null, locks: playbookInput.data.distillations };
  const research = benchmarkAnalysisOutputSchema.safeParse(value);
  return { kind: "ACCOUNT_RESEARCH" as const, output: research.success ? research.data : null, locks: [] };
}

function key(platform: string, externalId: string) {
  return `${platform}:${externalId}`;
}

function tagsFromTexts(texts: string[]) {
  const counts = new Map<string, number>();
  for (const text of texts) {
    for (const match of text.matchAll(/#([\p{L}\p{N}_-]{2,20})/gu)) {
      const tag = match[1];
      if (tag) counts.set(tag, (counts.get(tag) ?? 0) + 1);
    }
  }
  return [...counts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN")).slice(0, 10).map(([tag]) => tag);
}

function traceableDistillation(value: { version: number; schemaVersion: string; output: Prisma.JsonValue | null }) {
  if (!Number.isInteger(value.version) || value.version < 1 || value.schemaVersion !== "material-distillation-v2") return null;
  const parsed = materialDistillationGenerationSchema.safeParse(value.output);
  if (!parsed.success) return null;
  const evidence = [...parsed.data.highlights.flatMap((item) => item.evidence), ...(parsed.data.copywriting?.evidence ?? [])];
  return evidence.some(({ sourceRef }) => Boolean(sourceRef)) ? parsed.data : null;
}

async function account(workspaceId: string, benchmarkAccountId: string) {
  const row = await db.benchmarkAccount.findFirst({ where: { id: benchmarkAccountId, workspaceId, enabled: true }, select: { id: true, name: true, platform: true, bio: true } });
  if (!row) throw new BenchmarkStudyError("BENCHMARK_NOT_FOUND", "对标账号不存在。");
  return row;
}

async function assertStudyWriter(workspaceId: string, userId: string) {
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } }, select: { role: true } });
  if (!member || member.role === "VIEWER") throw new BenchmarkStudyError("BENCHMARK_FORBIDDEN", "当前权限不能发起账号研究。");
}

async function validateStudyCollectionRun(tx: Prisma.TransactionClient, input: { workspaceId: string; benchmarkAccountId: string; collectionRunId?: string }, snapshotIds: string[]) {
  if (!input.collectionRunId) return null;
  const run = await tx.benchmarkCollectionRun.findFirst({ where: { id: input.collectionRunId, workspaceId: input.workspaceId, benchmarkAccountId: input.benchmarkAccountId, status: { in: ["COMPLETED", "PARTIAL"] } }, select: { id: true } });
  if (!run) throw new BenchmarkStudyError("BENCHMARK_INVALID_SAMPLES", "所选批次不可用，请刷新后重试。");
  const count = await tx.benchmarkCollectionRunItem.count({ where: { collectionRunId: run.id, snapshotId: { in: snapshotIds }, inRange: true } });
  if (count !== snapshotIds.length) throw new BenchmarkStudyError("BENCHMARK_INVALID_SAMPLES", "研究样本不属于所选采集批次。");
  return run.id;
}

export async function listBenchmarkCandidates(input: { workspaceId: string; benchmarkAccountId: string }) {
  const benchmark = await account(input.workspaceId, input.benchmarkAccountId);
  const snapshots = await db.benchmarkContentSnapshot.findMany({
    where: { workspaceId: input.workspaceId, benchmarkAccountId: benchmark.id },
    orderBy: [{ observedAt: "desc" }, { publishedAt: "desc" }],
    take: 500,
  });
  if (!snapshots.length) return [];
  const sources = await db.sourceItem.findMany({
    where: { workspaceId: input.workspaceId, OR: snapshots.map((item) => ({ sourcePlatform: item.platform, externalId: item.externalId })) },
    select: {
      id: true,
      sourcePlatform: true,
      externalId: true,
      transcript: { select: { fullText: true, updatedAt: true } },
      materialAnalyses: { where: { status: "COMPLETED" }, orderBy: { version: "desc" }, take: 1, select: { id: true, version: true, understanding: true } },
      materialDistillations: { where: { status: "COMPLETED" }, orderBy: { version: "desc" }, take: 20, select: { id: true, version: true, schemaVersion: true, output: true, transcriptUpdatedAtAtDistillation: true } },
    },
  });
  const sourceMap = new Map(sources.map((source) => [key(source.sourcePlatform, source.externalId ?? ""), source]));
  return snapshots.map((snapshot): BenchmarkCandidateDTO => {
    const source = sourceMap.get(key(snapshot.platform, snapshot.externalId));
    const analysis = source?.materialAnalyses[0];
    const parsedAnalysis = analysis ? materialAnalysisOutputSchema.safeParse(analysis.understanding) : null;
    const ready = Boolean(parsedAnalysis?.success && "expression" in parsedAnalysis.data);
    const distillation = source?.materialDistillations.find((item) => item.transcriptUpdatedAtAtDistillation.getTime() === source.transcript?.updatedAt.getTime() && traceableDistillation(item));
    const playbookReady = Boolean(source?.transcript?.fullText.trim() && distillation);
    return {
      id: snapshot.id,
      contentType: (() => {
        const metadata = snapshot.metadata as { contentType?: unknown } | null;
        const value = metadata?.contentType;
        return value === "VIDEO" || value === "IMAGE" || value === "ARTICLE" ? value : "UNKNOWN";
      })(),
      externalId: snapshot.externalId,
      title: snapshot.title,
      url: snapshot.url,
      coverUrl: snapshot.coverUrl,
      publishedAt: snapshot.publishedAt?.toISOString() ?? null,
      observedAt: snapshot.observedAt.toISOString(),
      sourceItemId: source?.id ?? null,
      materialAnalysisId: ready ? analysis?.id ?? null : null,
      materialAnalysisVersion: ready ? analysis?.version ?? null : null,
      materialDistillationId: playbookReady ? distillation?.id ?? null : null,
      materialDistillationVersion: playbookReady ? distillation?.version ?? null : null,
      ready,
      playbookReady,
      hasTranscript: Boolean(source?.transcript?.fullText.trim()),
    };
  });
}

const sampleInclude = {
  sourceItem: { select: { id: true, title: true } },
  materialAnalysis: { select: { id: true, version: true } },
} as const;

type StudyRow = Prisma.BenchmarkStudyGetPayload<{ include: { benchmarkAccount: { select: { id: true; name: true } }; samples: { include: typeof sampleInclude } } }>;

function toDTO(row: StudyRow): BenchmarkStudyDTO {
  const stored = storedStudy(row.output);
  const locks = new Map(stored.locks.map((item) => [item.sampleId, item]));
  return {
    id: row.id,
    collectionRunId: row.collectionRunId,
    benchmarkAccountId: row.benchmarkAccountId,
    benchmarkAccountName: row.benchmarkAccount.name,
    version: row.version,
    status: row.status,
    sampleCount: row.sampleCount,
    insufficientSamples: row.insufficientSamples,
    kind: stored.kind,
    output: stored.output,
    aiRunId: row.aiRunId,
    errorCode: row.errorCode,
    errorMessage: row.errorMessage,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    samples: row.samples.map((sample) => ({ id: sample.id, sourceItemId: sample.sourceItemId, title: sample.sourceItem.title || "未命名内容", materialAnalysisId: sample.materialAnalysis?.id ?? null, materialAnalysisVersion: sample.materialAnalysis?.version ?? null, materialDistillationId: locks.get(sample.id)?.materialDistillationId ?? null, materialDistillationVersion: locks.get(sample.id)?.materialDistillationVersion ?? null })),
  };
}

async function rows(input: { workspaceId: string; benchmarkAccountId: string; take?: number }) {
  await account(input.workspaceId, input.benchmarkAccountId);
  return db.benchmarkStudy.findMany({
    where: { workspaceId: input.workspaceId, benchmarkAccountId: input.benchmarkAccountId },
    orderBy: { version: "desc" },
    take: input.take ?? 20,
    include: { benchmarkAccount: { select: { id: true, name: true } }, samples: { orderBy: { createdAt: "asc" }, include: sampleInclude } },
  });
}

export async function listBenchmarkStudies(input: { workspaceId: string; benchmarkAccountId: string }) {
  return (await rows(input)).map(toDTO);
}

export async function getBenchmarkStudy(input: { workspaceId: string; benchmarkAccountId: string; studyId: string }) {
  const result = await db.benchmarkStudy.findFirst({
    where: { id: input.studyId, workspaceId: input.workspaceId, benchmarkAccountId: input.benchmarkAccountId },
    include: { benchmarkAccount: { select: { id: true, name: true } }, samples: { orderBy: { createdAt: "asc" }, include: sampleInclude } },
  });
  if (!result) throw new BenchmarkStudyError("BENCHMARK_STUDY_NOT_FOUND", "这次账号研究不存在。");
  return toDTO(result);
}

export async function createBenchmarkStudy(input: { workspaceId: string; benchmarkAccountId: string; userId: string; sampleIds: string[]; collectionRunId?: string }) {
  await assertStudyWriter(input.workspaceId, input.userId);
  const parsed = createBenchmarkStudySchema.safeParse({ sampleIds: input.sampleIds });
  if (!parsed.success) throw new BenchmarkStudyError("BENCHMARK_INVALID_SAMPLES", "请选择 1–10 条不重复的代表内容。");
  const benchmark = await account(input.workspaceId, input.benchmarkAccountId);
  let created: { id: string; maxAttempts: number };
  try {
    created = await db.$transaction(async (tx) => {
      const processing = await tx.benchmarkStudy.findFirst({ where: { workspaceId: input.workspaceId, benchmarkAccountId: benchmark.id, status: "PROCESSING" }, select: { id: true } });
      if (processing) throw new BenchmarkStudyError("BENCHMARK_STUDY_IN_PROGRESS", "这个账号已有一项研究正在进行，请稍候。 ");
      const snapshots = await tx.benchmarkContentSnapshot.findMany({ where: { id: { in: parsed.data.sampleIds }, workspaceId: input.workspaceId, benchmarkAccountId: benchmark.id }, select: { id: true, platform: true, externalId: true } });
      if (snapshots.length !== parsed.data.sampleIds.length) throw new BenchmarkStudyError("BENCHMARK_INVALID_SAMPLES", "代表内容已变化，请刷新后重新选择。");
      const collectionRunId = await validateStudyCollectionRun(tx, { ...input, benchmarkAccountId: benchmark.id }, snapshots.map(({ id }) => id));
      const sourceItems = await tx.sourceItem.findMany({ where: { workspaceId: input.workspaceId, OR: snapshots.map((snapshot) => ({ sourcePlatform: snapshot.platform, externalId: snapshot.externalId })) }, select: { id: true, sourcePlatform: true, externalId: true } });
      const sourceMap = new Map(sourceItems.map((source) => [key(source.sourcePlatform, source.externalId ?? ""), source]));
      const candidates = snapshots.map((snapshot) => ({ snapshot, source: sourceMap.get(key(snapshot.platform, snapshot.externalId)) })).filter((item): item is { snapshot: typeof snapshots[number]; source: typeof sourceItems[number] } => Boolean(item.source));
      if (candidates.length !== snapshots.length) throw new BenchmarkStudyError("BENCHMARK_SAMPLE_NOT_READY", "有代表内容还没有收录，请先收录后再研究。");
      const analyses = await tx.materialAnalysis.findMany({ where: { workspaceId: input.workspaceId, sourceItemId: { in: candidates.map((item) => item.source.id) }, status: "COMPLETED" }, orderBy: { version: "desc" }, select: { id: true, sourceItemId: true, version: true, understanding: true } });
      const latest = new Map<string, typeof analyses[number]>();
      for (const analysis of analyses) if (!latest.has(analysis.sourceItemId)) latest.set(analysis.sourceItemId, analysis);
      if (candidates.some((item) => {
        const analysis = latest.get(item.source.id);
        const parsed = analysis ? materialAnalysisOutputSchema.safeParse(analysis.understanding) : null;
        return !parsed?.success || !("expression" in parsed.data);
      })) throw new BenchmarkStudyError("BENCHMARK_SAMPLE_NOT_READY", "有代表内容还没有完成整理，请先去内容库处理后再试。");
      const previous = await tx.benchmarkStudy.findFirst({ where: { benchmarkAccountId: benchmark.id }, orderBy: { version: "desc" }, select: { version: true } });
      const study = await tx.benchmarkStudy.create({ data: { workspaceId: input.workspaceId, benchmarkAccountId: benchmark.id, collectionRunId, createdById: input.userId, version: (previous?.version ?? 0) + 1, status: "PROCESSING", sampleCount: candidates.length, insufficientSamples: candidates.length < 5, samples: { create: candidates.map((item) => ({ sourceItemId: item.source.id, materialAnalysisId: latest.get(item.source.id)!.id, snapshotId: item.snapshot.id })) } } });
      await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "benchmark_study.created", resourceType: "benchmark_study", resourceId: study.id, metadata: json({ benchmarkAccountId: benchmark.id, sampleCount: candidates.length, insufficientSamples: candidates.length < 5 }) } });
      return { id: study.id, maxAttempts: 3 };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof BenchmarkStudyError) throw error;
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "P2002" || code === "P2034") throw new BenchmarkStudyError("BENCHMARK_STUDY_IN_PROGRESS", "这个账号已有一项研究正在进行，请稍候。");
    throw error;
  }
  try {
    await enqueueBenchmarkStudy({ studyId: created.id, workspaceId: input.workspaceId, requestedById: input.userId }, created.maxAttempts);
  } catch {
    await db.benchmarkStudy.update({ where: { id: created.id }, data: { status: "FAILED", errorCode: "BENCHMARK_QUEUE_UNAVAILABLE", errorMessage: "账号研究暂时无法开始。" } });
    throw new BenchmarkStudyError("BENCHMARK_QUEUE_UNAVAILABLE", "账号研究暂时无法开始。");
  }
  return getBenchmarkStudy({ workspaceId: input.workspaceId, benchmarkAccountId: input.benchmarkAccountId, studyId: created.id });
}

export async function createBenchmarkPlaybookStudy(input: { workspaceId: string; benchmarkAccountId: string; userId: string; sampleIds: string[]; collectionRunId?: string }) {
  await assertStudyWriter(input.workspaceId, input.userId);
  const parsed = createBenchmarkPlaybookStudySchema.safeParse({ sampleIds: input.sampleIds });
  if (!parsed.success) throw new BenchmarkStudyError("BENCHMARK_INVALID_SAMPLES", "请选择 3–10 条不重复的代表内容。");
  const benchmark = await account(input.workspaceId, input.benchmarkAccountId);
  let created: { id: string; maxAttempts: number };
  try {
    created = await db.$transaction(async (tx) => {
      const processing = await tx.benchmarkStudy.findFirst({ where: { workspaceId: input.workspaceId, benchmarkAccountId: benchmark.id, status: "PROCESSING" }, select: { id: true } });
      if (processing) throw new BenchmarkStudyError("BENCHMARK_STUDY_IN_PROGRESS", "这个账号已有一项研究正在进行，请稍候。");
      const snapshots = await tx.benchmarkContentSnapshot.findMany({ where: { id: { in: parsed.data.sampleIds }, workspaceId: input.workspaceId, benchmarkAccountId: benchmark.id }, select: { id: true, platform: true, externalId: true } });
      if (snapshots.length !== parsed.data.sampleIds.length) throw new BenchmarkStudyError("BENCHMARK_INVALID_SAMPLES", "代表内容已变化，请刷新后重新选择。");
      const collectionRunId = await validateStudyCollectionRun(tx, { ...input, benchmarkAccountId: benchmark.id }, snapshots.map(({ id }) => id));
      const sourceItems = await tx.sourceItem.findMany({ where: { workspaceId: input.workspaceId, OR: snapshots.map((snapshot) => ({ sourcePlatform: snapshot.platform, externalId: snapshot.externalId })) }, select: { id: true, sourcePlatform: true, externalId: true, transcript: { select: { fullText: true } } } });
      const sourceMap = new Map(sourceItems.map((source) => [key(source.sourcePlatform, source.externalId ?? ""), source]));
      const candidates = snapshots.map((snapshot) => ({ snapshot, source: sourceMap.get(key(snapshot.platform, snapshot.externalId)) })).filter((item): item is { snapshot: typeof snapshots[number]; source: typeof sourceItems[number] } => Boolean(item.source));
      if (candidates.length !== snapshots.length) throw new BenchmarkStudyError("BENCHMARK_SAMPLE_NOT_READY", "有代表内容还没有收录，请先收录后再研究。");
      const sourceItemIds = candidates.map(({ source }) => source.id);
      const [analyses, distillations] = await Promise.all([
        tx.materialAnalysis.findMany({ where: { workspaceId: input.workspaceId, sourceItemId: { in: sourceItemIds }, status: "COMPLETED" }, orderBy: { version: "desc" }, select: { id: true, sourceItemId: true, version: true, understanding: true } }),
        tx.materialDistillation.findMany({ where: { workspaceId: input.workspaceId, sourceItemId: { in: sourceItemIds }, status: "COMPLETED" }, orderBy: { version: "desc" }, select: { id: true, sourceItemId: true, version: true, schemaVersion: true, output: true } }),
      ]);
      const latestAnalysis = new Map<string, typeof analyses[number]>();
      for (const analysis of analyses) {
        const parsedAnalysis = materialAnalysisOutputSchema.safeParse(analysis.understanding);
        if (!latestAnalysis.has(analysis.sourceItemId) && parsedAnalysis.success && "expression" in parsedAnalysis.data) latestAnalysis.set(analysis.sourceItemId, analysis);
      }
      const latestDistillation = new Map<string, typeof distillations[number]>();
      for (const distillation of distillations) if (!latestDistillation.has(distillation.sourceItemId) && traceableDistillation(distillation)) latestDistillation.set(distillation.sourceItemId, distillation);
      if (candidates.some(({ source }) => !source.transcript?.fullText.trim())) throw new BenchmarkStudyError("BENCHMARK_DISTILLATION_NOT_READY", "有代表内容还没有完成精华提炼，请先提炼后再看组合打法。");
      if (candidates.some(({ source }) => {
        const distillation = latestDistillation.get(source.id);
        return !distillation;
      })) throw new BenchmarkStudyError("BENCHMARK_DISTILLATION_NOT_READY", "有代表内容还没有完成精华提炼，请先提炼后再看组合打法。");
      const previous = await tx.benchmarkStudy.findFirst({ where: { benchmarkAccountId: benchmark.id }, orderBy: { version: "desc" }, select: { version: true } });
      const study = await tx.benchmarkStudy.create({ data: { workspaceId: input.workspaceId, benchmarkAccountId: benchmark.id, collectionRunId, createdById: input.userId, version: (previous?.version ?? 0) + 1, status: "PROCESSING", sampleCount: candidates.length, insufficientSamples: false } });
      const samples = [];
      for (const candidate of candidates) {
        samples.push(await tx.benchmarkStudySample.create({ data: { studyId: study.id, sourceItemId: candidate.source.id, materialAnalysisId: latestAnalysis.get(candidate.source.id)?.id ?? null, snapshotId: candidate.snapshot.id } }));
      }
      const manifest = benchmarkPlaybookInputSchema.parse({ kind: "PLAYBOOK_INPUT", schemaVersion: "benchmark-playbook-v1", distillations: samples.map((sample) => {
        const distillation = latestDistillation.get(sample.sourceItemId)!;
        return { sampleId: sample.id, sourceItemId: sample.sourceItemId, materialDistillationId: distillation.id, materialDistillationVersion: distillation.version };
      }) });
      await tx.benchmarkStudy.update({ where: { id: study.id }, data: { output: json(manifest) } });
      await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "benchmark_playbook.created", resourceType: "benchmark_study", resourceId: study.id, metadata: json({ benchmarkAccountId: benchmark.id, sampleCount: candidates.length, materialDistillationIds: manifest.distillations.map(({ materialDistillationId }) => materialDistillationId) }) } });
      return { id: study.id, maxAttempts: 3 };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof BenchmarkStudyError) throw error;
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "P2002" || code === "P2034") throw new BenchmarkStudyError("BENCHMARK_STUDY_IN_PROGRESS", "这个账号已有一项研究正在进行，请稍候。");
    throw error;
  }
  try {
    await enqueueBenchmarkPlaybookStudy({ studyId: created.id, workspaceId: input.workspaceId, requestedById: input.userId }, created.maxAttempts);
  } catch {
    await db.benchmarkStudy.update({ where: { id: created.id }, data: { status: "FAILED", errorCode: "BENCHMARK_QUEUE_UNAVAILABLE", errorMessage: "组合打法研究暂时无法开始。" } });
    throw new BenchmarkStudyError("BENCHMARK_QUEUE_UNAVAILABLE", "组合打法研究暂时无法开始。");
  }
  return getBenchmarkStudy({ workspaceId: input.workspaceId, benchmarkAccountId: input.benchmarkAccountId, studyId: created.id });
}

export async function createBenchmarkCreatorProfileStudy(input: { workspaceId: string; benchmarkAccountId: string; userId: string; sampleIds: string[]; collectionRunId?: string }) {
  await assertStudyWriter(input.workspaceId, input.userId);
  const parsed = createBenchmarkCreatorProfileStudySchema.safeParse({ sampleIds: input.sampleIds });
  if (!parsed.success) throw new BenchmarkStudyError("BENCHMARK_INVALID_SAMPLES", "请选择 5–10 条不重复的代表内容。");
  const benchmark = await account(input.workspaceId, input.benchmarkAccountId);
  let created: { id: string; maxAttempts: number };
  try {
    created = await db.$transaction(async (tx) => {
      const processing = await tx.benchmarkStudy.findFirst({ where: { workspaceId: input.workspaceId, benchmarkAccountId: benchmark.id, status: "PROCESSING" }, select: { id: true } });
      if (processing) throw new BenchmarkStudyError("BENCHMARK_STUDY_IN_PROGRESS", "这个账号已有一项研究正在进行，请稍候。");
      const snapshots = await tx.benchmarkContentSnapshot.findMany({ where: { id: { in: parsed.data.sampleIds }, workspaceId: input.workspaceId, benchmarkAccountId: benchmark.id }, select: { id: true, platform: true, externalId: true, title: true } });
      if (snapshots.length !== parsed.data.sampleIds.length) throw new BenchmarkStudyError("BENCHMARK_INVALID_SAMPLES", "代表内容已变化，请刷新后重新选择。");
      const collectionRunId = await validateStudyCollectionRun(tx, { ...input, benchmarkAccountId: benchmark.id }, snapshots.map(({ id }) => id));
      const sourceItems = await tx.sourceItem.findMany({ where: { workspaceId: input.workspaceId, OR: snapshots.map((snapshot) => ({ sourcePlatform: snapshot.platform, externalId: snapshot.externalId })) }, select: { id: true, sourcePlatform: true, externalId: true, transcript: { select: { fullText: true, updatedAt: true } } } });
      const sourceMap = new Map(sourceItems.map((source) => [key(source.sourcePlatform, source.externalId ?? ""), source]));
      const candidates = snapshots.map((snapshot) => ({ snapshot, source: sourceMap.get(key(snapshot.platform, snapshot.externalId)) })).filter((item): item is { snapshot: typeof snapshots[number]; source: typeof sourceItems[number] } => Boolean(item.source));
      if (candidates.length !== snapshots.length) throw new BenchmarkStudyError("BENCHMARK_SAMPLE_NOT_READY", "有代表内容还没有收录，请先收录后再生成账号画像。");
      if (candidates.some(({ source }) => !source.transcript?.fullText.trim())) throw new BenchmarkStudyError("BENCHMARK_DISTILLATION_NOT_READY", "先选择至少 5 条已经完成精华提炼的代表内容。");
      const sourceItemIds = candidates.map(({ source }) => source.id);
      const [analyses, distillations, completedStudies] = await Promise.all([
        tx.materialAnalysis.findMany({ where: { workspaceId: input.workspaceId, sourceItemId: { in: sourceItemIds }, status: "COMPLETED" }, orderBy: { version: "desc" }, select: { id: true, sourceItemId: true, version: true, understanding: true } }),
        tx.materialDistillation.findMany({ where: { workspaceId: input.workspaceId, sourceItemId: { in: sourceItemIds }, status: "COMPLETED" }, orderBy: { version: "desc" }, select: { id: true, sourceItemId: true, version: true, schemaVersion: true, output: true, transcriptUpdatedAtAtDistillation: true } }),
        tx.benchmarkStudy.findMany({ where: { workspaceId: input.workspaceId, benchmarkAccountId: benchmark.id, status: "COMPLETED" }, orderBy: { version: "desc" }, select: { id: true, version: true, output: true } }),
      ]);
      const latestAnalysis = new Map<string, typeof analyses[number]>();
      for (const analysis of analyses) {
        const result = materialAnalysisOutputSchema.safeParse(analysis.understanding);
        if (!latestAnalysis.has(analysis.sourceItemId) && result.success && "expression" in result.data) latestAnalysis.set(analysis.sourceItemId, analysis);
      }
      const latestDistillation = new Map<string, typeof distillations[number]>();
      for (const distillation of distillations) {
        const transcript = candidates.find(({ source }) => source.id === distillation.sourceItemId)?.source.transcript;
        if (!latestDistillation.has(distillation.sourceItemId) && transcript && distillation.transcriptUpdatedAtAtDistillation.getTime() === transcript.updatedAt.getTime() && traceableDistillation(distillation)) latestDistillation.set(distillation.sourceItemId, distillation);
      }
      if (candidates.some(({ source }) => !latestDistillation.has(source.id))) throw new BenchmarkStudyError("BENCHMARK_DISTILLATION_NOT_READY", "先选择至少 5 条已经完成精华提炼的代表内容。");
      const accountResearch = completedStudies.find(({ output }) => benchmarkAnalysisOutputSchema.safeParse(output).success) ?? null;
      const previousProfileStudy = completedStudies.find(({ output }) => benchmarkCreatorProfileOutputV4Schema.safeParse(output).success || benchmarkCreatorProfileOutputV3Schema.safeParse(output).success || benchmarkCreatorProfileOutputV2Schema.safeParse(output).success || benchmarkCreatorProfileOutputSchema.safeParse(output).success) ?? null;
      const previous = await tx.benchmarkStudy.findFirst({ where: { benchmarkAccountId: benchmark.id }, orderBy: { version: "desc" }, select: { version: true } });
      const study = await tx.benchmarkStudy.create({ data: { workspaceId: input.workspaceId, benchmarkAccountId: benchmark.id, collectionRunId, createdById: input.userId, version: (previous?.version ?? 0) + 1, status: "PROCESSING", sampleCount: candidates.length, insufficientSamples: false } });
      const samples = [];
      for (const candidate of candidates) samples.push(await tx.benchmarkStudySample.create({ data: { studyId: study.id, sourceItemId: candidate.source.id, materialAnalysisId: latestAnalysis.get(candidate.source.id)?.id ?? null, snapshotId: candidate.snapshot.id } }));
      const manifest = benchmarkCreatorProfileInputV4Schema.parse({
        kind: "CREATOR_PROFILE_INPUT",
        schemaVersion: "benchmark-creator-profile-v4",
        account: { name: benchmark.name, platform: benchmark.platform, bio: benchmark.bio, tags: tagsFromTexts([benchmark.bio ?? "", ...snapshots.map(({ title }) => title)]) },
        distillations: samples.map((sample) => { const distillation = latestDistillation.get(sample.sourceItemId)!; return { sampleId: sample.id, sourceItemId: sample.sourceItemId, materialDistillationId: distillation.id, materialDistillationVersion: distillation.version }; }),
        accountResearch: accountResearch ? { studyId: accountResearch.id, version: accountResearch.version } : null,
        priorProfileVersion: previousProfileStudy?.version ?? null,
      });
      await tx.benchmarkStudy.update({ where: { id: study.id }, data: { output: json(manifest) } });
      await tx.auditLog.create({ data: { workspaceId: input.workspaceId, userId: input.userId, action: "benchmark_creator_profile.created", resourceType: "benchmark_study", resourceId: study.id, metadata: json({ benchmarkAccountId: benchmark.id, sampleCount: candidates.length, materialDistillationIds: manifest.distillations.map(({ materialDistillationId }) => materialDistillationId), accountResearchStudyId: manifest.accountResearch?.studyId ?? null, priorProfileVersion: manifest.priorProfileVersion }) } });
      return { id: study.id, maxAttempts: 3 };
    }, { isolationLevel: "Serializable" });
  } catch (error) {
    if (error instanceof BenchmarkStudyError) throw error;
    const code = typeof error === "object" && error && "code" in error ? String(error.code) : "";
    if (code === "P2002" || code === "P2034") throw new BenchmarkStudyError("BENCHMARK_STUDY_IN_PROGRESS", "这个账号已有一项研究正在进行，请稍候。");
    throw error;
  }
  try {
    await enqueueBenchmarkCreatorProfileStudy({ studyId: created.id, workspaceId: input.workspaceId, requestedById: input.userId }, created.maxAttempts);
  } catch {
    await db.benchmarkStudy.update({ where: { id: created.id }, data: { status: "FAILED", errorCode: "BENCHMARK_QUEUE_UNAVAILABLE", errorMessage: "账号画像暂时无法开始。" } });
    throw new BenchmarkStudyError("BENCHMARK_QUEUE_UNAVAILABLE", "账号画像暂时无法开始。");
  }
  return getBenchmarkStudy({ workspaceId: input.workspaceId, benchmarkAccountId: input.benchmarkAccountId, studyId: created.id });
}
