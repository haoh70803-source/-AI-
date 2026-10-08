"use server";

import { randomUUID } from "node:crypto";
import { slugifyWorkspaceName } from "@content-center/core";
import { createOwnedWorkspace, db } from "@content-center/db";
import { redirect } from "next/navigation";
import { requireSession } from "@/server/access";

export type OnboardingState = { error: string };

export async function createWorkspaceAction(
  _previousState: OnboardingState,
  formData: FormData,
): Promise<OnboardingState> {
  const session = await requireSession();
  const name = String(formData.get("name") ?? "").trim();
  if (name.length < 2 || name.length > 80) {
    return { error: "Workspace 名称需要 2–80 个字符。" };
  }

  const existing = await db.workspaceMember.findFirst({ where: { userId: session.user.id } });
  if (existing) redirect("/dashboard");

  const slug = `${slugifyWorkspaceName(name)}-${randomUUID().slice(0, 8)}`;
  await createOwnedWorkspace(db, { userId: session.user.id, name, slug });
  redirect("/dashboard");
}
