import "server-only";
import { db } from "@content-center/db";
export type ResearchActor = { workspaceId: string; userId: string };
export class ResearchError extends Error {
  constructor(readonly code: string, message: string, readonly status = 409) { super(message); this.name = "ResearchError"; }
}
export async function researchMember(input: ResearchActor, write = false) {
  const member = await db.workspaceMember.findFirst({ where: { workspaceId: input.workspaceId, userId: input.userId, disabledAt: null, workspace: { disabledAt: null }, user: { disabledAt: null } }, select: { role: true } });
  if (!member || (write && member.role === "VIEWER")) throw new ResearchError("FORBIDDEN", "当前账号没有执行此操作的权限。", 403);
  return member;
}
export function personalSessionWhere(input: ResearchActor) { return { workspaceId: input.workspaceId, createdById: input.userId }; }
export async function researchSessionForUser(input: ResearchActor & { sessionId: string }, write = false) {
  await researchMember(input, write);
  const session = await db.researchSession.findFirst({ where: { id: input.sessionId, ...personalSessionWhere(input) }, include: { project: { select: { id: true, title: true, workspaceId: true } } } });
  if (!session || (session.project && session.project.workspaceId !== input.workspaceId)) throw new ResearchError("NOT_FOUND", "研究会话不存在或不可访问。", 404);
  return session;
}
