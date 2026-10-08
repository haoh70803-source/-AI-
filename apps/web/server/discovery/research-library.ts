import "server-only";
import { db } from "@content-center/db";
import { z } from "zod";
import { DiscoveryServiceError } from "./service";

export const researchOrganizationSchema = z.object({
  category: z.string().trim().max(40).nullable(),
  notes: z.string().trim().max(2000),
}).strict();

export class ResearchAccessError extends Error {
  constructor(public status: 403 | 404) { super(status === 404 ? "账号不存在。" : "只读成员不能编辑研究设置。"); }
}

async function membership(workspaceId: string, userId: string) {
  const member = await db.workspaceMember.findUnique({ where: { workspaceId_userId: { workspaceId, userId } } });
  if (!member) throw new ResearchAccessError(404);
  return member;
}

export async function getResearchLibrary(workspaceId: string, userId: string) {
  await membership(workspaceId, userId);
  const rows = await db.benchmarkAccount.findMany({
    where: { workspaceId, enabled: true }, orderBy: [{ updatedAt: "desc" }, { id: "asc" }],
    select: { id: true, name: true, platform: true, avatarUrl: true, bio: true,
      researchCategory: true, researchNotes: true, lastSyncedAt: true,
      _count: { select: { contentSnapshots: true, studies: true } },
      studies: { orderBy: { version: "desc" }, take: 1, select: { status: true, version: true, updatedAt: true } },
    },
  });
  return rows.map(({ _count, studies, lastSyncedAt, ...row }) => ({ ...row,
    sampleCount: _count.contentSnapshots, studyCount: _count.studies,
    latestStudy: studies[0] ? { ...studies[0], updatedAt: studies[0].updatedAt.toISOString() } : null,
    lastSyncedAt: lastSyncedAt?.toISOString() ?? null,
  }));
}
export type ResearchAccountView = Awaited<ReturnType<typeof getResearchLibrary>>[number];

export async function updateResearchOrganization(input: { workspaceId: string; userId: string; accountId: string; data: unknown }) {
  const member = await membership(input.workspaceId, input.userId);
  const account = await db.benchmarkAccount.findFirst({ where: { id: input.accountId, workspaceId: input.workspaceId, enabled: true }, select: { id: true } });
  if (!account) throw new DiscoveryServiceError("DISCOVERY_NOT_FOUND", "账号不存在。");
  if (member.role === "VIEWER") throw new ResearchAccessError(403);
  const data = researchOrganizationSchema.parse(input.data);
  // Categories are labels, not folders or account ownership. Normalize their identity.
  const category = data.category?.normalize("NFKC").trim().toLocaleLowerCase("zh-CN") || null;
  await db.benchmarkAccount.updateMany({ where: { id: account.id, workspaceId: input.workspaceId, enabled: true }, data: { researchCategory: category, researchNotes: data.notes || null } });
  return getResearchLibrary(input.workspaceId, input.userId);
}
