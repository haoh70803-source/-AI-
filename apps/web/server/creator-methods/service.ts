import "server-only";

import { db, type Prisma } from "@content-center/db";
import { listMethods, type MethodDTO } from "../methods/service";

const WINDOW_DAYS = 30;
const GENERATION_STATUSES = ["SUCCEEDED", "FAILED"] as const;

export type CreatorMethodUseDTO = {
  methodVersionId: string;
  methodVersion: number;
  projectId: string;
  projectTitle: string;
  status: "SUCCEEDED" | "FAILED";
  createdAt: string;
};

export type CreatorMethodDTO = MethodDTO & {
  attemptCount: number;
  attempts: number;
  successfulCount: number;
  failedCount: number;
  latestUsedAt: string | null;
  latestProject: { id: string; title: string } | null;
  latestUsedVersion: { id: string; version: number; title: string } | null;
  recentUses: CreatorMethodUseDTO[];
};

export type CreatorMethodsOverviewDTO = {
  windowDays: typeof WINDOW_DAYS;
  since: string;
  totalGenerations: number;
  all: CreatorMethodDTO[];
  groups: {
    CORE: CreatorMethodDTO[];
    TRIAL: CreatorMethodDTO[];
    SAVED: CreatorMethodDTO[];
    DISABLED: CreatorMethodDTO[];
  };
  recentlyUsed: CreatorMethodDTO[];
};

type UsageRow = Prisma.MethodUsageGetPayload<{
  include: {
    methodVersion: { select: { id: true; assetId: true; version: true; title: true } };
    project: { select: { id: true; title: true; workspaceId: true } };
    aiRun: { select: { id: true; status: true; action: true; userId: true; workspaceId: true; createdAt: true } };
  };
}>;

function sinceDate(now = new Date()) {
  const since = new Date(now);
  since.setDate(since.getDate() - WINDOW_DAYS);
  return since;
}

function emptyStats(method: MethodDTO): CreatorMethodDTO {
  return { ...method, attemptCount: 0, attempts: 0, successfulCount: 0, failedCount: 0, latestUsedAt: null, latestProject: null, latestUsedVersion: null, recentUses: [] };
}

export async function getCreatorMethodsOverview(input: { workspaceId: string; ownerUserId: string; now?: Date }): Promise<CreatorMethodsOverviewDTO> {
  const since = sinceDate(input.now);
  const methods = await listMethods({ workspaceId: input.workspaceId, ownerUserId: input.ownerUserId });
  const methodIds = methods.map((method) => method.id);
  const [usageRows, totalGenerations] = await Promise.all([
    methodIds.length ? db.methodUsage.findMany({
      where: {
        userId: input.ownerUserId,
        methodAssetId: { in: methodIds },
        methodAsset: { workspaceId: input.workspaceId, ownerUserId: input.ownerUserId },
        project: { workspaceId: input.workspaceId },
        aiRun: { workspaceId: input.workspaceId, userId: input.ownerUserId, action: "GENERATE_MOTHER_CONTENT", status: { in: [...GENERATION_STATUSES] }, createdAt: { gte: since } },
      },
      orderBy: [{ aiRun: { createdAt: "desc" } }, { createdAt: "desc" }],
      include: {
        methodVersion: { select: { id: true, assetId: true, version: true, title: true } },
        project: { select: { id: true, title: true, workspaceId: true } },
        aiRun: { select: { id: true, status: true, action: true, userId: true, workspaceId: true, createdAt: true } },
      },
    }) : Promise.resolve([] as UsageRow[]),
    db.aIRun.count({ where: { workspaceId: input.workspaceId, userId: input.ownerUserId, action: "GENERATE_MOTHER_CONTENT", status: { in: [...GENERATION_STATUSES] }, createdAt: { gte: since } } }),
  ]);
  const byAsset = new Map<string, UsageRow[]>();
  for (const usage of usageRows) if (usage.methodVersion.assetId === usage.methodAssetId) byAsset.set(usage.methodAssetId, [...(byAsset.get(usage.methodAssetId) ?? []), usage]);
  const all = methods.map((method) => {
    const uses = byAsset.get(method.id) ?? [];
    const successfulCount = uses.filter((use) => use.aiRun.status === "SUCCEEDED").length;
    const failedCount = uses.filter((use) => use.aiRun.status === "FAILED").length;
    const latest = uses[0];
    return {
      ...emptyStats(method),
      attemptCount: successfulCount + failedCount,
      attempts: successfulCount + failedCount,
      successfulCount,
      failedCount,
      latestUsedAt: latest?.aiRun.createdAt.toISOString() ?? null,
      latestProject: latest ? { id: latest.project.id, title: latest.project.title } : null,
      latestUsedVersion: latest ? { id: latest.methodVersion.id, version: latest.methodVersion.version, title: latest.methodVersion.title } : null,
      recentUses: uses.slice(0, 8).map((use): CreatorMethodUseDTO => ({ methodVersionId: use.methodVersion.id, methodVersion: use.methodVersion.version, projectId: use.project.id, projectTitle: use.project.title, status: use.aiRun.status as "SUCCEEDED" | "FAILED", createdAt: use.aiRun.createdAt.toISOString() })),
    } satisfies CreatorMethodDTO;
  });
  const groups = {
    CORE: all.filter((method) => method.status === "CORE"),
    TRIAL: all.filter((method) => method.status === "TRIAL"),
    SAVED: all.filter((method) => method.status === "SAVED"),
    DISABLED: all.filter((method) => method.status === "DISABLED"),
  } satisfies CreatorMethodsOverviewDTO["groups"];
  return { windowDays: WINDOW_DAYS, since: since.toISOString(), totalGenerations, all, groups, recentlyUsed: all.filter((method) => method.attempts > 0).sort((a, b) => (b.latestUsedAt ?? "").localeCompare(a.latestUsedAt ?? "")) };
}

export const listCreatorMethods = getCreatorMethodsOverview;
