import { db } from "@content-center/db";
import { securityAudit } from "./account-security";
export function sessionDevice(agent: string | null) {
  if (!agent) return "应用或其他设备";
  const system = /Windows/i.test(agent) ? "Windows" : /Android/i.test(agent) ? "Android" : /iPhone|iPad/i.test(agent) ? "iOS" : /Macintosh/i.test(agent) ? "macOS" : /Linux/i.test(agent) ? "Linux" : "其他设备";
  const browser = /Edg\//.test(agent) ? "Edge" : /Firefox\//.test(agent) ? "Firefox" : /Chrome\//.test(agent) ? "Chrome" : /Safari\//.test(agent) ? "Safari" : "应用";
  return `${system} · ${browser}`;
}
export async function listAccountSessions(userId: string, currentId: string) {
  const sessions = await db.session.findMany({ where: { userId, expiresAt: { gt: new Date() } }, select: { id: true, userAgent: true, updatedAt: true }, orderBy: { updatedAt: "desc" } });
  return sessions.map(session => ({ id: session.id, current: session.id === currentId, device: sessionDevice(session.userAgent), lastActive: session.updatedAt.toISOString() })).sort((a, b) => Number(b.current) - Number(a.current));
}
export async function revokeAccountSessions(userId: string, currentId: string, id?: string) {
  return db.$transaction(async tx => {
    const result = await tx.session.deleteMany({ where: { userId, id: id ? { equals: id, not: currentId } : { not: currentId } } });
    if (result.count) await securityAudit(tx, userId, id ? "account.device_signed_out" : "account.other_devices_signed_out");
    return result;
  });
}
