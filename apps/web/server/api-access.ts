import { db } from "@content-center/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { resolveWorkspaceMembership } from "./workspace-context";
import { auth } from "@/lib/auth";

export async function getApiWorkspaceContext() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return null;
  const user = await db.user.findUnique({ where: { id: session.user.id }, select: { disabledAt: true } });
  if (!user || user.disabledAt) return null;
  const membership = await resolveWorkspaceMembership(session.user.id, session.session.id);
  if (!membership) return null;
  return { session, workspace: membership.workspace, role: membership.role };
}

export async function getSystemAdminApiContext() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return { response: apiError("UNAUTHORIZED", 401) } as const;
  const user = await db.user.findUnique({
    where: { id: session.user.id },
    select: { id: true, systemRole: true, disabledAt: true },
  });
  if (!user || user.systemRole !== "SYSTEM_ADMIN" || user.disabledAt) {
    return { response: apiError("FORBIDDEN", 403) } as const;
  }
  return { session, user } as const;
}

export function apiError(error: string, status: number, message?: string) {
  return NextResponse.json({ error, message }, { status });
}
