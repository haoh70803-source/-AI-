import "server-only";
import { db } from "@content-center/db";
import { researchMember, ResearchError, type ResearchActor } from "../access";
export async function requireNewsActor(actor: ResearchActor) {
  await researchMember(actor);
  const user = await db.user.findFirst({ where: { id: actor.userId, email: "2629194738@qq.com", systemRole: "SYSTEM_ADMIN", disabledAt: null }, select: { id: true } });
  if (!user) throw new ResearchError("FORBIDDEN", "当前资讯仅供已授权的管理员本人使用。", 403);
  return actor;
}
