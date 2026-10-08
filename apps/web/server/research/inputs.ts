import "server-only";
import { db } from "@content-center/db";
import type { ResearchBlock, ResearchCoverage, ResearchSource } from "@content-center/core";
import { getMaterialReadableContent } from "../material-detail/readable-content";
import { ResearchError, type ResearchActor } from "./access";
import type { ResearchScope } from "./contracts";
import { buildBenchmarkPerformance } from "../discovery/benchmark-performance";
import { parseTrendStableKey, safeTrendMetrics } from "./trends";

export async function resolveResearchInputs(actor: ResearchActor, question: string, scope: ResearchScope, mode: "DIRECT" | "BREAKDOWN" | "BENCHMARK" | "OPPORTUNITY" = "DIRECT") {
  const sourceRefs: ResearchSource[] = [{ ref: "U1", kind: "USER_INPUT", objectId: "question", title: "本次问题与用户补充", href: null, capturedAt: null, publishedAt: null, eventAt: null, contentOrigin: "USER_PROVIDED", locator: null, excerpt: [question, scope.notes].filter(Boolean).join("\n").slice(0, 20000), version: null }];
  const scopeIds = [...new Set(scope.materialIds)];
  const metadata = scopeIds.length ? await db.sourceItem.findMany({ where: { workspaceId: actor.workspaceId, id: { in: scopeIds }, status: { not: "ARCHIVED" } }, select: { id: true, title: true, sourceType: true, sourceUrl: true, createdAt: true } }) : [];
  if (metadata.length !== scopeIds.length) throw new ResearchError("SOURCE_NOT_FOUND", "部分资料不存在、已归档或不在当前工作空间。", 404);
  const coverage: ResearchCoverage = { requested: scopeIds.length, observed: metadata.length, readable: 0, timed: 0, visual: 0, aiSampleCount: 0, truncated: false, sampling: "SELECTED", timeRange: { from: null, to: null }, gaps: [] };
  const context: Array<{ ref: string; title: string; text: string; origin: string; segments?: unknown }> = [];
  const blocks: ResearchBlock[] = [];
  const readableWorkRefs: string[] = [];
  let remaining = 60000;
  for (const source of metadata) {
    const readable = await getMaterialReadableContent({ ...actor, sourceItemId: source.id });
    const ref = `M${sourceRefs.length}`;
    const text = readable?.contentText ?? "";
    const selected = text.slice(0, Math.min(10000, remaining));
    remaining -= selected.length;
    const timed = Array.isArray(readable?.segments) ? readable.segments.filter(value => value && typeof value === "object" && "startMs" in value && typeof value.startMs === "number") : [];
    sourceRefs.push({ ref, kind: "MATERIAL", objectId: source.id, title: source.title || "未命名资料", href: `/library/${source.id}`, capturedAt: null, publishedAt: null, eventAt: null, contentOrigin: readable?.contentSource === "SOURCE_UNDERSTANDING" ? "AI_READING" : readable?.contentSource === "TRANSCRIPT" ? "MACHINE_TRANSCRIPT" : "ORIGINAL", locator: timed.length ? "文字稿含时间码" : "正文无时间码", excerpt: selected.slice(0, 1200), version: readable?.version ?? null });
    if (text) coverage.readable++;
    else coverage.gaps.push(`${source.title || "未命名资料"} 尚无可读正文，只能确认资料记录存在。`);
    if (selected) { context.push({ ref, title: source.title || "未命名资料", text: selected, origin: readable!.contentSource, segments: timed.slice(0, 100) }); coverage.aiSampleCount++; }
    if (timed.length) coverage.timed++;
    if (selected.length < text.length) coverage.truncated = true;
  }
  const accountIds = [...new Set(scope.benchmarkAccountIds)];
  const accounts = accountIds.length ? await db.benchmarkAccount.findMany({ where: { id: { in: accountIds }, workspaceId: actor.workspaceId, enabled: true }, select: { id: true, name: true, platform: true, lastSyncedAt: true } }) : [];
  if (accounts.length !== accountIds.length) throw new ResearchError("BENCHMARK_NOT_FOUND", "部分对标账号不存在或不在当前工作空间。", 404);
  let benchmarkBudget = 24000;
  const accountWindows: string[] = [];
  const accountSampleKinds: Record<string, "WINDOW" | "HISTORY"> = {};
  for (const account of accounts) {
    const accountRef = `B${sourceRefs.length}`;
    sourceRefs.push({ ref: accountRef, kind: "BENCHMARK_ACCOUNT", objectId: account.id, title: account.name, href: `/research/benchmarks/${account.id}`, capturedAt: account.lastSyncedAt?.toISOString() ?? null, publishedAt: null, eventAt: null, contentOrigin: "ORIGINAL", locator: "已保存的对标账号记录", excerpt: `${account.name} · ${account.platform}`, version: account.lastSyncedAt?.toISOString() ?? null });
    const batch = await db.benchmarkCollectionRun.findFirst({ where: { workspaceId: actor.workspaceId, benchmarkAccountId: account.id, status: { in: ["COMPLETED", "PARTIAL"] } }, orderBy: { createdAt: "desc" }, select: { id: true, status: true, rangeStart: true, rangeEnd: true, inRangeCount: true, seenCount: true } });
    accountSampleKinds[account.id] = batch ? "WINDOW" : "HISTORY";
    accountWindows.push(batch ? `${batch.rangeStart.toISOString()}/${batch.rangeEnd.toISOString()}` : "HISTORY_ONLY");
    const batchItems = batch ? await db.benchmarkCollectionRunItem.findMany({
      where: { collectionRunId: batch.id, inRange: true }, orderBy: [{ publishedAt: "desc" }, { id: "desc" }], take: 12,
      select: { snapshotId: true, titleSnapshot: true, urlSnapshot: true, publishedAt: true, createdAt: true,
        snapshot: { select: { platform: true, externalId: true, observations: { where: { collectionRunId: batch.id }, orderBy: { observedAt: "desc" }, take: 1, select: { observedAt: true, metrics: true } } } } },
    }) : null;
    const sampled = batchItems ? batchItems.map(item => ({ id: item.snapshotId, title: item.titleSnapshot, url: item.urlSnapshot, publishedAt: item.publishedAt, observedAt: item.createdAt, platform: item.snapshot.platform, externalId: item.snapshot.externalId, observations: item.snapshot.observations }))
      : await db.benchmarkContentSnapshot.findMany({ where: { workspaceId: actor.workspaceId, benchmarkAccountId: account.id }, orderBy: [{ publishedAt: "desc" }, { observedAt: "desc" }], take: 12, select: { id: true, title: true, url: true, publishedAt: true, observedAt: true, platform: true, externalId: true, observations: { orderBy: { observedAt: "desc" }, take: 1, select: { observedAt: true, metrics: true } } } });
    const total = batch?.inRangeCount ?? await db.benchmarkContentSnapshot.count({ where: { workspaceId: actor.workspaceId, benchmarkAccountId: account.id } });
    coverage.requested += total; coverage.observed += sampled.length;
    if (batch) { coverage.sampling = "WINDOW"; coverage.timeRange.from = !coverage.timeRange.from || batch.rangeStart.toISOString() < coverage.timeRange.from ? batch.rangeStart.toISOString() : coverage.timeRange.from; coverage.timeRange.to = !coverage.timeRange.to || batch.rangeEnd.toISOString() > coverage.timeRange.to ? batch.rangeEnd.toISOString() : coverage.timeRange.to; }
    else coverage.gaps.push(`${account.name} 没有完成的时间窗口采集，仅使用保存的历史作品快照，不能代表账号全量。`);
    if (batch?.status === "PARTIAL") coverage.gaps.push(`${account.name} 最近采集不完整，结论只能覆盖已取得样本。`);
    if (sampled.length < total) { coverage.truncated = true; coverage.gaps.push(`${account.name} 当前实际读取最近 ${sampled.length}/${total} 条作品，不能推断未读取作品的规律。`); }
    const materialRows = sampled.length ? await db.sourceItem.findMany({ where: { workspaceId: actor.workspaceId, OR: sampled.map(work => ({ sourcePlatform: work.platform, externalId: work.externalId })) }, select: { id: true, sourcePlatform: true, externalId: true } }) : [];
    const materialByWork = new Map(materialRows.map(item => [`${item.sourcePlatform}:${item.externalId}`, item.id]));
    const readableRows = await Promise.all(materialRows.map(row => getMaterialReadableContent({ ...actor, sourceItemId: row.id })));
    const readableById = new Map(readableRows.filter(Boolean).map(item => [item!.sourceItemId, item!]));
    const performance = buildBenchmarkPerformance(sampled.map(work => ({ ...work, metadata: {}, observations: work.observations })));
    const accountWorkRefs: string[] = [];
    for (const work of sampled) {
      const ref = `B${sourceRefs.length}`; accountWorkRefs.push(ref);
      const sourceId = materialByWork.get(`${work.platform}:${work.externalId}`);
      const readable = sourceId ? readableById.get(sourceId) : null;
      const item = performance.items.find(value => value.id === work.id)!;
      const counters = Object.entries(item.counts).flatMap(([name, value]) => value === null ? [] : [`${name}: ${value}`]).join("; ");
      const text = readable?.contentText ?? "";
      const selectedText = text.slice(0, Math.min(1500, benchmarkBudget)); benchmarkBudget -= selectedText.length;
      const metadataText = `${work.title}\n发布时间: ${work.publishedAt?.toISOString() ?? "未知"}\n观察时间: ${item.latestObservedAt ?? work.observedAt.toISOString()}\n${counters || "公开互动计数缺失"}`;
      sourceRefs.push({ ref, kind: "BENCHMARK_WORK", objectId: work.id, title: work.title, href: sourceId ? `/library/${sourceId}` : /^https:\/\//i.test(work.url) ? work.url : null, capturedAt: item.latestObservedAt ?? work.observedAt.toISOString(), publishedAt: work.publishedAt?.toISOString() ?? null, eventAt: null, contentOrigin: readable?.contentSource === "SOURCE_UNDERSTANDING" ? "AI_READING" : readable?.contentSource === "TRANSCRIPT" ? "MACHINE_TRANSCRIPT" : "ORIGINAL", locator: selectedText ? "作品正文与公开观察" : "仅作品元数据与公开观察，无可读正文", excerpt: `${metadataText}\n${selectedText}`.slice(0, 1200), version: readable?.version ?? null });
      context.push({ ref, title: `${account.name} · ${work.title}`, text: `${metadataText}\n${selectedText}`, origin: readable?.contentSource ?? "BENCHMARK_METADATA" });
      coverage.aiSampleCount++;
      if (text) { coverage.readable++; readableWorkRefs.push(ref); }
      if (Array.isArray(readable?.segments) && readable.segments.length) coverage.timed++;
      if (selectedText.length < text.length) coverage.truncated = true;
    }
    blocks.push({ id: `benchmark-${account.id}`, type: "text", title: `${account.name} · 实际研究样本`, provenance: "REAL_DATA", sourceRefs: [accountRef, ...accountWorkRefs], limitation: sampled.length < total ? `仅读取 ${sampled.length}/${total} 条作品。` : null, text: `来源为${batch ? "已保存采集批次的时间窗口" : "历史保存作品快照"}。本次读取 ${sampled.length}/${total} 条作品；其中 ${sampled.filter(work => Boolean(readableById.get(materialByWork.get(`${work.platform}:${work.externalId}`) ?? "")?.contentText)).length} 条有可读正文。${batch ? `采集${batch.status === "PARTIAL" ? "部分完成" : "完成"}。` : ""}单条作品的计数是观察值，不代表转化。` });
    blocks.push({ id: `benchmark-counts-${account.id}`, type: "metrics", title: `${account.name} · 当前样本公开计数`, provenance: "COMPUTED", sourceRefs: accountWorkRefs, limitation: "仅求和实际读取作品的最近观察值，缺失不按零处理；不能跨平台直接比较。", items: performance.totals.map(item => ({ label: ({ likes: "点赞", comments: "评论", favorites: "收藏", shares: "分享" } as Record<string, string>)[item.metric]!, value: item.value, unit: "次", validCount: item.covered, denominator: sampled.length, method: "有效最近观察值求和，缺失值排除" })) });
  }
  if (new Set(accounts.map(account => account.platform)).size > 1) coverage.gaps.push("所选账号跨平台，互动指标口径可能不同，不能直接比较数值大小。");
  if (new Set(accountWindows).size > 1) coverage.gaps.push("账号采集时间范围不同，跨账号比较仅可作为线索，不能声称同期表现差异。");
  for (const key of [...new Set(scope.trendKeys)]) {
    const identity = parseTrendStableKey(key);
    const latest = await db.trendSnapshot.findFirst({ where: { workspaceId: actor.workspaceId, ...identity }, orderBy: [{ observedAt: "desc" }, { id: "desc" }] });
    if (!latest) throw new ResearchError("TREND_NOT_FOUND", "趋势已不存在或不在当前工作空间。", 404);
    const ref = `T${sourceRefs.length}`;
    const metrics = safeTrendMetrics(latest.metrics);
    const known = Object.entries(metrics).flatMap(([name, value]) => value === null ? [] : [`${name}: ${value}`]).join("; ");
    const text = `${latest.title}\n平台 ${latest.platform}，榜单类型 ${latest.trendType}，排名 ${latest.rank ?? "未知"}。来源窗口 ${latest.windowStart.toISOString()} 至 ${latest.windowEnd.toISOString()}；采集于 ${latest.observedAt.toISOString()}。${known || "指标缺失"}`;
    sourceRefs.push({ ref, kind: "TREND", objectId: key, title: latest.title, href: `/research/trends/${key}`, capturedAt: latest.observedAt.toISOString(), publishedAt: null, eventAt: null, contentOrigin: "ORIGINAL", locator: "保存的趋势榜单快照；非代表作品", excerpt: text, version: `${latest.id}:${latest.observedAt.toISOString()}` });
    context.push({ ref, title: latest.title, text, origin: "TREND_SNAPSHOT" });
    coverage.requested++; coverage.observed++; coverage.aiSampleCount++;
    coverage.gaps.push(`${latest.title} 只有榜单快照，当前没有自动检索代表作品或作者；不能由热度推断成功概率。`);
  }
  // Text derived from image understanding is not evidence that this run inspected the image.
  coverage.gaps.push("本次未直接读取视频画面或原图，不能推断镜头、字幕布局或视觉表现。");
  if (!metadata.length && !accounts.length) coverage.gaps.push("本次尚未选择外部资料；回答只依据用户提供的信息，不能作为已核验的外部研究结论。");
  if (coverage.truncated) coverage.gaps.push("正文超过本次读取限额，部分内容被截断。结论仅覆盖实际读取部分。");
  let creatorContext: unknown = null;
  if (scope.useCreatorProfile) {
    const profile = await db.creatorProfile.findUnique({ where: { workspaceId_userId: { workspaceId: actor.workspaceId, userId: actor.userId } }, select: { id: true, positioning: true, targetAudience: true, coreTopics: true, personalViews: true, forbiddenTerms: true, forbiddenStyle: true, updatedAt: true } });
    if (profile) { creatorContext = profile; sourceRefs.push({ ref: "P1", kind: "CREATOR_PROFILE", objectId: profile.id, title: "私人创作者背景", href: null, capturedAt: profile.updatedAt.toISOString(), publishedAt: null, eventAt: null, contentOrigin: "USER_PROVIDED", locator: null, excerpt: "本次按用户选择读取的定位、受众、主题与表达边界。", version: profile.updatedAt.toISOString() }); }
    else coverage.gaps.push("当前没有可用的个人创作者背景。");
  }
  if (mode === "OPPORTUNITY" && scope.useOwnArtifacts) {
    const artifacts = await db.artifact.findMany({ where: { workspaceId: actor.workspaceId, createdById: actor.userId, project: { workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } }, draftBranch: { deletedAt: null } }, orderBy: { updatedAt: "desc" }, take: 20, select: { id: true, title: true, updatedAt: true, projectId: true, draftBranch: { select: { version: true } } } });
    for (const artifact of artifacts) {
      const ref = `A${sourceRefs.length}`;
      const summary = `已保存项目产出标题：${artifact.title}。本次只用于标题层面的去重线索；没有读取正文，也不是已发布作品记录。`;
      sourceRefs.push({ ref, kind: "PROJECT_ARTIFACT", objectId: artifact.id, title: artifact.title, href: `/dashboard?project=${artifact.projectId}&node=artifact:${artifact.id}`, capturedAt: artifact.updatedAt.toISOString(), publishedAt: null, eventAt: null, contentOrigin: "USER_PROVIDED", locator: "已保存产出标题；非发布历史", excerpt: summary, version: String(artifact.draftBranch.version) });
      context.push({ ref, title: artifact.title, text: summary, origin: "SAVED_ARTIFACT_TITLE" });
      coverage.requested++; coverage.observed++; coverage.aiSampleCount++;
    }
    coverage.gaps.push(artifacts.length ? "自己的已保存产出只读取标题作去重线索，没有读取正文或真实发布表现。" : "没有可用的自己创建的已保存产出，无法验证与历史内容是否重复。");
  } else if (mode === "OPPORTUNITY") coverage.gaps.push("本次未读取自己的已保存产出，不能声称已经与历史内容去重。");
  blocks.unshift({ id: "scope", type: "text", title: "本次读取范围", provenance: "REAL_DATA", sourceRefs: sourceRefs.map(source => source.ref), limitation: coverage.gaps.join("\n") || null, text: `本次实际读取 ${coverage.observed}/${coverage.requested} 条对象或作品，其中 ${coverage.readable} 条有可读正文、${coverage.timed} 条有时间码。${accounts.length ? `涉及 ${accounts.length} 个对标账号。` : ""}未直接读取原始画面；结论仅适用于实际样本。` });
  return { sourceRefs, coverage, blocks, context, creatorContext, accountSampleKinds, readableWorkRefs };
}
