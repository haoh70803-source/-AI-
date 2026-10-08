import "server-only";

import { db } from "@content-center/db";
import { benchmarkAnalysisOutputSchema, benchmarkCreatorProfileOutputSchema, benchmarkCreatorProfileOutputV2Schema, benchmarkCreatorProfileOutputV3Schema, benchmarkCreatorProfileOutputV4Schema, benchmarkPlaybookOutputSchema, buildDeterministicCreatorProfileSummary, materialDistillationGenerationSchema, type BenchmarkCreatorProfileCardCode, type BenchmarkCreatorProfileSectionCode } from "@content-center/providers";
import { listBenchmarkStudies } from "./benchmark-study-service";
import { buildBenchmarkPerformance, type BenchmarkPerformance } from "./benchmark-performance";
import { materialAnalysisOutputSchema } from "@content-center/providers";
import { publicWorkReviewSchema, type PublicWorkReview } from "./public-work-review";
import { buildBenchmarkCohortRadar, type BenchmarkRadarInput, type BenchmarkRadarSample } from "./benchmark-cohort";

const key = (platform: string, externalId: string) => `${platform}:${externalId}`;

export type BenchmarkCreatorDetailDTO = {
  collectionRun?: null | { id: string; status: string; rangeStart: string; rangeEnd: string; pageCount: number; seenCount: number; inRangeCount: number; undatedCount: number; stopReason: string | null; profileStale: boolean };
  radarComparison?: null | ReturnType<typeof buildBenchmarkCohortRadar> & { reason?: string };
  publicReviews?: PublicWorkReview[];
  profileDisplay?: { followers: string; likes: string; works: string; observedAt: string; coverage: string } | null;
  performance?: BenchmarkPerformance;
  topicDistribution?: Array<{ topic: string; count: number; sources: Array<{ id: string; title: string }> }>;
  account: { id: string; name: string; platform: string; avatarUrl: string | null; bio: string | null; originalUrl?: string | null; researchCategory?: string | null; lastSyncedAt: string | null; tags: string[] };
  stats: { discovered: number; collected: number; studied: number; distilled: number; copywriting: number };
  representativeSources: Array<{ id: string; title: string; coverUrl: string | null; hasTranscript: boolean; hasDistillation: boolean; hasCopywriting: boolean }>;
  highlights: Array<{ title: string; explanation: string; quality: "WORTH_KEEPING" | "OBSERVE" | "CASE_ONLY" | "DO_NOT_KEEP"; sourceItemId: string; sourceTitle: string }>;
  copywriting: Array<{ sourceItemId: string; sourceTitle: string; core: string; opening: string; progression: string[]; reusable: string[]; avoid: string[] }>;
  accountResearch: null | { sampleCount: number; groups: Array<{ title: string; items: Array<{ name: string; summary: string; sources: Array<{ id: string; title: string }> }> }> };
  playbooks: Array<{ name: string; maturity: "OBSERVE" | "STABLE"; elements: string[]; flow: string; useCase: string; sources: Array<{ id: string; title: string }> }>;
  creatorProfile: null | { studyId: string; version: number; schemaVersion: "benchmark-creator-profile-v1" | "benchmark-creator-profile-v2" | "benchmark-creator-profile-v3" | "benchmark-creator-profile-v4"; createdAt: string; message: string; sections: Array<{ code: BenchmarkCreatorProfileSectionCode | BenchmarkCreatorProfileCardCode; status: "CLEAR" | "OBSERVE" | null; text: string; sources: Array<{ id: string; title: string }> }> };
  savedMethods: Array<{ id: string; title: string; status: "SAVED" | "TRIAL" | "CORE" | "DISABLED" }>;
};

export async function getBenchmarkCreatorDetail(input: { workspaceId: string; benchmarkAccountId: string; ownerUserId: string; collectionRunId?: string }): Promise<BenchmarkCreatorDetailDTO | null> {
  const account = await db.benchmarkAccount.findFirst({
    where: { id: input.benchmarkAccountId, workspaceId: input.workspaceId, enabled: true },
    select: { id: true, name: true, platform: true, avatarUrl: true, bio: true, originalUrl: true, researchCategory: true, lastSyncedAt: true },
  });
  if (!account) return null;

  const collectionRun = input.collectionRunId
    ? await db.benchmarkCollectionRun.findFirst({ where: { id: input.collectionRunId, workspaceId: input.workspaceId, benchmarkAccountId: account.id } })
    : await db.benchmarkCollectionRun.findFirst({ where: { workspaceId: input.workspaceId, benchmarkAccountId: account.id, status: { in: ["COMPLETED", "PARTIAL"] } }, orderBy: { createdAt: "desc" } });
  if (input.collectionRunId && !collectionRun) return null;

  type ReportSnapshot = { id: string; platform: typeof account.platform; externalId: string; title: string; coverUrl: string | null; url: string; metadata: unknown; publishedAt: Date | null; observedAt: Date; observations: Array<{ observedAt: Date; metrics: unknown }> };
  const snapshots: ReportSnapshot[] = collectionRun
    ? (await db.benchmarkCollectionRunItem.findMany({
        where: { collectionRunId: collectionRun.id, inRange: true },
        orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
        select: { snapshotId: true, titleSnapshot: true, urlSnapshot: true, coverUrlSnapshot: true, metadataSnapshot: true, publishedAt: true, createdAt: true, snapshot: { select: { platform: true, externalId: true, observations: { where: { collectionRunId: collectionRun.id }, orderBy: { observedAt: "desc" }, take: 1, select: { observedAt: true, metrics: true } } } } },
      })).map((item) => ({ id: item.snapshotId, platform: item.snapshot.platform, externalId: item.snapshot.externalId, title: item.titleSnapshot, url: item.urlSnapshot, coverUrl: item.coverUrlSnapshot, metadata: item.metadataSnapshot, publishedAt: item.publishedAt, observedAt: item.createdAt, observations: item.snapshot.observations }))
    : await db.benchmarkContentSnapshot.findMany({
        where: { workspaceId: input.workspaceId, benchmarkAccountId: account.id },
        orderBy: [{ observedAt: "desc" }, { publishedAt: "desc" }],
        select: { id: true, platform: true, externalId: true, title: true, coverUrl: true, url: true, metadata: true, publishedAt: true, observedAt: true, observations: { orderBy: { observedAt: "desc" }, take: 2, select: { observedAt: true, metrics: true } } },
      });

  const [studies, methodRows] = await Promise.all([
    listBenchmarkStudies({ workspaceId: input.workspaceId, benchmarkAccountId: account.id }),
    db.methodAsset.findMany({
      where: { workspaceId: input.workspaceId, ownerUserId: input.ownerUserId, status: { not: "DISABLED" } },
      orderBy: { updatedAt: "desc" },
      select: {
        id: true,
        status: true,
        versions: {
          orderBy: { version: "desc" },
          take: 1,
          select: {
            title: true,
            sourceItem: { select: { sourcePlatform: true, externalId: true } },
            sourceMaterialDistillation: { select: { sourceItem: { select: { sourcePlatform: true, externalId: true } } } },
            sourceBenchmarkStudy: { select: { benchmarkAccountId: true } },
          },
        },
      },
    }),
  ]);

  let radarComparison: BenchmarkCreatorDetailDTO["radarComparison"] = null;
  if (collectionRun?.status === "COMPLETED" && account.researchCategory) {
    const peers = await db.benchmarkAccount.findMany({ where: { workspaceId: input.workspaceId, enabled: true, platform: account.platform, researchCategory: account.researchCategory, id: { not: account.id } }, select: { id: true } });
    const peerRuns = peers.length ? await db.benchmarkCollectionRun.findMany({
      where: { workspaceId: input.workspaceId, benchmarkAccountId: { in: peers.map(({ id }) => id) }, status: "COMPLETED", rangeStart: collectionRun.rangeStart, rangeEnd: collectionRun.rangeEnd },
      orderBy: { createdAt: "desc" },
      distinct: ["benchmarkAccountId"],
      select: { id: true, benchmarkAccountId: true },
    }) : [];
    const peerItems = await Promise.all(peerRuns.map((peer) => db.benchmarkCollectionRunItem.findMany({
      where: { collectionRunId: peer.id, inRange: true },
      select: { metadataSnapshot: true, snapshot: { select: { observations: { where: { collectionRunId: peer.id }, take: 1, select: { metrics: true } } } } },
    })));
    const radarSamples = (items: Array<{ metadata: unknown; observations: Array<{ metrics: unknown }> }>): BenchmarkRadarSample[] => items.map(({ metadata, observations }) => {
      const stored = metadata && typeof metadata === "object" && !Array.isArray(metadata) ? metadata as Record<string, unknown> : {};
      const observation = observations[0]?.metrics;
      const counts = observation && typeof observation === "object" && !Array.isArray(observation) ? observation as Record<string, unknown> : {};
      const ms = typeof stored.durationMs === "number" && Number.isFinite(stored.durationMs) ? stored.durationMs : null;
      return { likes: typeof counts.likes === "number" ? counts.likes : null, comments: typeof counts.comments === "number" ? counts.comments : null, shares: typeof counts.shares === "number" ? counts.shares : null, favorites: typeof counts.favorites === "number" ? counts.favorites : null, durationMs: ms };
    });
    const targetInput: BenchmarkRadarInput = { accountId: account.id, samples: radarSamples(snapshots.map((snapshot) => ({ metadata: snapshot.metadata, observations: snapshot.observations }))) };
    const peerInputs: BenchmarkRadarInput[] = peerRuns.map((peer, index) => ({ accountId: peer.benchmarkAccountId, samples: radarSamples((peerItems[index] ?? []).map((item) => ({ metadata: item.metadataSnapshot, observations: item.snapshot.observations }))) }));
    radarComparison = { ...buildBenchmarkCohortRadar(targetInput, peerInputs), ...(peerRuns.length < 3 ? { reason: "需要至少 3 个已完成同平台、同分类、同日期范围的对标账号批次。" } : {}) };
  } else if (collectionRun) {
    radarComparison = { axes: [], compared: false, peerAccountCount: 0, reason: collectionRun.status !== "COMPLETED" ? "当前批次覆盖不完整，不生成同类比较。" : "账号未设置研究分类，暂不匹配同类账号。" };
  }

  const snapshotKeys = new Set(snapshots.map((snapshot) => key(snapshot.platform, snapshot.externalId)));
  const tagCounts = new Map<string, number>();
  for (const text of [account.bio ?? "", ...snapshots.map(({ title }) => title)]) {
    for (const match of text.matchAll(/#([\p{L}\p{N}_-]{2,20})/gu)) {
      const tag = match[1];
      if (tag) tagCounts.set(tag, (tagCounts.get(tag) ?? 0) + 1);
    }
  }
  const tags = [...tagCounts.entries()].sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0], "zh-CN")).slice(0, 5).map(([tag]) => tag);
  const sources = snapshots.length ? await db.sourceItem.findMany({
    where: { workspaceId: input.workspaceId, OR: snapshots.map((snapshot) => ({ sourcePlatform: snapshot.platform, externalId: snapshot.externalId })) },
    select: {
      id: true,
      title: true,
      thumbnailUrl: true,
      sourcePlatform: true,
      externalId: true,
      transcript: { select: { updatedAt: true } },
      materialAnalyses: { where: { status: "COMPLETED" }, orderBy: { version: "desc" }, take: 1, select: { understanding: true, transcriptUpdatedAtAtAnalysis: true } },
      materialDistillations: {
        where: { status: "COMPLETED" },
        orderBy: { version: "desc" },
        take: 20,
        select: { id: true, version: true, schemaVersion: true, output: true, transcriptUpdatedAtAtDistillation: true },
      },
    },
  }) : [];
  const sourceMap = new Map(sources.map((source) => [key(source.sourcePlatform, source.externalId ?? ""), source]));
  const parsedBySource = new Map<string, ReturnType<typeof materialDistillationGenerationSchema.parse>>();
  for (const source of sources) {
    if (!source.transcript) continue;
    const current = source.materialDistillations.find((distillation) => {
      if (distillation.schemaVersion !== "material-distillation-v2" || distillation.transcriptUpdatedAtAtDistillation.getTime() !== source.transcript?.updatedAt.getTime()) return false;
      const parsed = materialDistillationGenerationSchema.safeParse(distillation.output);
      if (!parsed.success) return false;
      const evidence = [...parsed.data.highlights.flatMap((highlight) => highlight.evidence), ...(parsed.data.copywriting?.evidence ?? [])];
      if (!evidence.some(({ sourceRef }) => Boolean(sourceRef))) return false;
      parsedBySource.set(source.id, parsed.data);
      return true;
    });
    if (!current) parsedBySource.delete(source.id);
  }

  const representativeSources = snapshots.flatMap((snapshot) => {
    const source = sourceMap.get(key(snapshot.platform, snapshot.externalId));
    if (!source) return [];
    const output = parsedBySource.get(source.id);
    return [{ id: source.id, title: source.title || snapshot.title || "未命名内容", coverUrl: snapshot.coverUrl ?? source.thumbnailUrl, hasTranscript: Boolean(source.transcript), hasDistillation: Boolean(output), hasCopywriting: Boolean(output?.copywriting) }];
  }).slice(0, 8);

  const highlights = representativeSources.flatMap((source) => (parsedBySource.get(source.id)?.highlights ?? []).map((highlight) => ({ title: highlight.title, explanation: highlight.essence, quality: highlight.quality, sourceItemId: source.id, sourceTitle: source.title }))).slice(0, 12);
  const copywriting = representativeSources.flatMap((source) => {
    const result = parsedBySource.get(source.id)?.copywriting;
    if (result) return [{ sourceItemId: source.id, sourceTitle: source.title, core: result.coreProposition, opening: result.openingLogic, progression: result.progression, reusable: result.reusableStrategies, avoid: result.doNotCopy }];
    // A valid existing single-source analysis already contains a concrete writing breakdown.
    // Do not hide it just because the separate distillation has no copywriting block.
    const row = sources.find((item) => item.id === source.id);
    const analysis = row?.materialAnalyses[0];
    if (!analysis || !row?.transcript || analysis.transcriptUpdatedAtAtAnalysis.getTime() !== row.transcript.updatedAt.getTime()) return [];
    const parsed = materialAnalysisOutputSchema.safeParse(analysis.understanding);
    if (!parsed.success || !("expression" in parsed.data)) return [];
    return [{ sourceItemId: source.id, sourceTitle: source.title, core: parsed.data.whatItSays.summary, opening: parsed.data.expression.opening.summary,
      progression: parsed.data.expression.progression.steps, reusable: [parsed.data.expression.support.summary], avoid: parsed.data.doNotCopy.map((item) => `${item.content}：${item.reason}`) }];
  }).slice(0, 6);

  const completedStudies = studies.filter(({ status, collectionRunId }) => status === "COMPLETED" && (collectionRun ? collectionRunId === collectionRun.id : collectionRunId === null));
  const studiedSourceIds = new Set(completedStudies.flatMap((study) => study.samples.map(({ sourceItemId }) => sourceItemId)));
  const research = completedStudies.find((study) => study.kind === "ACCOUNT_RESEARCH" && study.output && !("kind" in study.output));
  const parsedResearch = research ? benchmarkAnalysisOutputSchema.safeParse(research.output) : null;
  const researchGroups = parsedResearch?.success ? [
    ["常见主题", parsedResearch.data.topicDirections], ["常用开头", parsedResearch.data.openingPatterns], ["常见结构", parsedResearch.data.structures],
    ["论据与说服", parsedResearch.data.persuasionMethods], ["表达特点", parsedResearch.data.expressionHabits], ["常见收尾", parsedResearch.data.endings],
  ].flatMap(([title, findings]) => Array.isArray(findings) && findings.length ? [{ title: title as string, items: findings.slice(0, 4).map((finding) => ({ name: finding.name, summary: finding.summary, sources: finding.occurrenceSampleIds.flatMap((sampleId) => { const sample = research?.samples.find(({ id }) => id === sampleId); return sample ? [{ id: sample.sourceItemId, title: sample.title }] : []; }) })) }] : []) : [];

  const playbookStudy = completedStudies.find((study) => study.kind === "PLAYBOOKS" && study.output && "kind" in study.output && study.output.kind === "PLAYBOOKS" && study.output.playbooks.length > 0);
  const parsedPlaybooks = playbookStudy ? benchmarkPlaybookOutputSchema.safeParse(playbookStudy.output) : null;
  const playbooks = parsedPlaybooks?.success ? parsedPlaybooks.data.playbooks.map((playbook) => ({
    name: playbook.name,
    maturity: playbook.maturity,
    elements: playbook.elements,
    flow: playbook.flow,
    useCase: playbook.useCase,
    sources: playbook.supportSampleIds.flatMap((sampleId) => { const sample = playbookStudy?.samples.find(({ id }) => id === sampleId); return sample ? [{ id: sample.sourceItemId, title: sample.title }] : []; }),
  })) : [];

  const creatorProfileStudy = completedStudies.find((study) => study.kind === "CREATOR_PROFILE" && study.output && "kind" in study.output && study.output.kind === "CREATOR_PROFILE");
  const parsedCreatorProfileV4 = creatorProfileStudy ? benchmarkCreatorProfileOutputV4Schema.safeParse(creatorProfileStudy.output) : null;
  const parsedCreatorProfileV3 = creatorProfileStudy && !parsedCreatorProfileV4?.success ? benchmarkCreatorProfileOutputV3Schema.safeParse(creatorProfileStudy.output) : null;
  const parsedCreatorProfileV2 = creatorProfileStudy && !parsedCreatorProfileV4?.success && !parsedCreatorProfileV3?.success ? benchmarkCreatorProfileOutputV2Schema.safeParse(creatorProfileStudy.output) : null;
  const parsedCreatorProfileV1 = creatorProfileStudy && !parsedCreatorProfileV4?.success && !parsedCreatorProfileV3?.success && !parsedCreatorProfileV2?.success ? benchmarkCreatorProfileOutputSchema.safeParse(creatorProfileStudy.output) : null;
  const v4Profile = parsedCreatorProfileV4?.success ? buildDeterministicCreatorProfileSummary(parsedCreatorProfileV4.data.account, parsedCreatorProfileV4.data.videoSignals.map(({ primaryTopic }) => primaryTopic)) : null;
  const v4Cards = parsedCreatorProfileV4?.success && v4Profile && !parsedCreatorProfileV4.data.cards.some(({ code }) => code === "PROFILE") ? [{ code: "PROFILE" as const, status: v4Profile.status, claims: [{ text: v4Profile.text, evidence: parsedCreatorProfileV4.data.videoSignals.flatMap((video) => [...video.topicSignals, ...video.styleSignals].flatMap(({ evidence }) => evidence)) }] }, ...parsedCreatorProfileV4.data.cards] : parsedCreatorProfileV4?.success ? parsedCreatorProfileV4.data.cards : null;
  const claimProfile = parsedCreatorProfileV4?.success ? { message: parsedCreatorProfileV4.data.message, cards: v4Cards ?? [] } : parsedCreatorProfileV3?.success ? parsedCreatorProfileV3.data : null;
  const parsedProfile = claimProfile
    ? { message: claimProfile.message, sections: claimProfile.cards.map((card) => ({ code: card.code, status: card.status, text: card.claims.map(({ text }) => `• ${text}`).join("\n"), evidence: card.claims.flatMap(({ evidence }) => evidence) })) }
    : parsedCreatorProfileV2?.success ? { message: parsedCreatorProfileV2.data.message, sections: parsedCreatorProfileV2.data.cards }
      : parsedCreatorProfileV1?.success ? { message: parsedCreatorProfileV1.data.message, sections: parsedCreatorProfileV1.data.sections.map((section) => ({ ...section, status: null })) } : null;
  const creatorProfile = parsedProfile && creatorProfileStudy ? {
    studyId: creatorProfileStudy.id,
    version: creatorProfileStudy.version,
    schemaVersion: parsedCreatorProfileV4?.success ? "benchmark-creator-profile-v4" as const : parsedCreatorProfileV3?.success ? "benchmark-creator-profile-v3" as const : parsedCreatorProfileV2?.success ? "benchmark-creator-profile-v2" as const : "benchmark-creator-profile-v1" as const,
    createdAt: creatorProfileStudy.createdAt,
    message: parsedProfile.message,
    sections: parsedProfile.sections.map((section) => ({
      code: section.code,
      status: section.status,
      text: section.text,
      sources: [...new Set(section.evidence.map(({ sourceItemId }) => sourceItemId))].flatMap((sourceItemId) => {
        const sample = creatorProfileStudy.samples.find((item) => item.sourceItemId === sourceItemId);
        return sample ? [{ id: sample.sourceItemId, title: sample.title }] : [];
      }),
    })),
  } : null;

  const savedMethods = methodRows.flatMap((method) => {
    const current = method.versions[0];
    if (!current) return [];
    const source = current.sourceItem ?? current.sourceMaterialDistillation?.sourceItem;
    const belongs = current.sourceBenchmarkStudy?.benchmarkAccountId === account.id || Boolean(source?.externalId && snapshotKeys.has(key(source.sourcePlatform, source.externalId)));
    return belongs ? [{ id: method.id, title: current.title, status: method.status }] : [];
  }).slice(0, 8);
  const pinnedAccount = collectionRun?.profileSnapshot as { name?: unknown; avatarUrl?: unknown; bio?: unknown; originalUrl?: unknown } | null;
  const reportAccount = pinnedAccount ? {
    ...account,
    ...(typeof pinnedAccount.name === "string" ? { name: pinnedAccount.name } : {}),
    ...(typeof pinnedAccount.avatarUrl === "string" || pinnedAccount.avatarUrl === null ? { avatarUrl: pinnedAccount.avatarUrl } : {}),
    ...(typeof pinnedAccount.bio === "string" || pinnedAccount.bio === null ? { bio: pinnedAccount.bio } : {}),
    ...(typeof pinnedAccount.originalUrl === "string" || pinnedAccount.originalUrl === null ? { originalUrl: pinnedAccount.originalUrl } : {}),
  } : account;

  return {
    collectionRun: collectionRun ? {
      id: collectionRun.id,
      status: collectionRun.status,
      rangeStart: collectionRun.rangeStart.toISOString(),
      rangeEnd: collectionRun.rangeEnd.toISOString(),
      pageCount: collectionRun.pageCount,
      seenCount: collectionRun.seenCount,
      inRangeCount: collectionRun.inRangeCount,
      undatedCount: collectionRun.undatedCount,
      stopReason: collectionRun.stopReason,
      profileStale: Boolean((collectionRun.profileSnapshot as { stale?: unknown } | null)?.stale),
    } : null,
    radarComparison,
    profileDisplay: (() => {
      const pinned = collectionRun?.profileSnapshot as { followers?: unknown; likes?: unknown; works?: unknown; observedAt?: unknown; source?: unknown } | null;
      if (pinned && typeof pinned.observedAt === "string") {
        const compact = (value: unknown) => typeof value === "number" && Number.isFinite(value) ? value >= 100_000 ? `${(value / 10_000).toFixed(1)}万` : Math.round(value).toLocaleString("zh-CN") : "未提供";
        return { followers: compact(pinned.followers), likes: compact(pinned.likes), works: compact(pinned.works), observedAt: pinned.observedAt, coverage: typeof pinned.source === "string" ? pinned.source : "本次快照" };
      }
      if (collectionRun) return null;
      for (const snapshot of snapshots) {
        const metadata = snapshot.metadata as { accountProfileObservation?: unknown } | null;
        const candidate = metadata?.accountProfileObservation;
        if (!candidate || typeof candidate !== "object") continue;
        const value = candidate as Record<string, unknown>;
        if (typeof value.followers === "string" && typeof value.likes === "string" && typeof value.works === "string" && typeof value.observedAt === "string" && typeof value.coverage === "string") return { followers: value.followers, likes: value.likes, works: value.works, observedAt: value.observedAt, coverage: value.coverage };
      }
      return null;
    })(),
    publicReviews: snapshots.flatMap((snapshot) => {
      const parsed = publicWorkReviewSchema.safeParse((snapshot.metadata as { publicReview?: unknown } | null)?.publicReview);
      return parsed.success ? [{ ...parsed.data, workId: snapshot.id, title: snapshot.title, url: snapshot.url }] : [];
    }),
    topicDistribution: parsedCreatorProfileV4?.success && creatorProfileStudy ? [...new Set(parsedCreatorProfileV4.data.videoSignals.map((signal) => signal.primaryTopic))].map((topic) => {
      const signals = parsedCreatorProfileV4.data.videoSignals.filter((signal) => signal.primaryTopic === topic);
      return { topic, count: signals.length, sources: signals.flatMap((signal) => {
        const sample = creatorProfileStudy.samples.find((item) => item.sourceItemId === signal.sourceItemId);
        return sample ? [{ id: sample.sourceItemId, title: sample.title }] : [];
      }) };
    }).sort((a, b) => b.count - a.count || a.topic.localeCompare(b.topic, "zh-CN")) : [],
    performance: buildBenchmarkPerformance(snapshots),
    account: { ...reportAccount, lastSyncedAt: account.lastSyncedAt?.toISOString() ?? null, tags },
    stats: { discovered: snapshots.length, collected: sources.length, studied: studiedSourceIds.size, distilled: parsedBySource.size, copywriting: copywriting.length },
    representativeSources,
    highlights,
    copywriting,
    accountResearch: parsedResearch?.success && research ? { sampleCount: research.sampleCount, groups: researchGroups } : null,
    playbooks,
    creatorProfile,
    savedMethods,
  };
}
