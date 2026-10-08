import { Card } from "@content-center/ui";
import { db } from "@content-center/db";
import { redirect } from "next/navigation";
import { OnboardingForm } from "@/components/onboarding-form";
import { requireSession } from "@/server/access";

export default async function OnboardingPage() {
  const session = await requireSession();
  const membership = await db.workspaceMember.findFirst({ where: { userId: session.user.id } });
  if (membership) redirect("/dashboard");

  return (
    <main className="grid min-h-screen place-items-center p-5">
      <Card className="w-full max-w-lg p-8 sm:p-10">
        <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[var(--accent)]">首次设置</p>
        <h1 className="mt-3 text-3xl font-semibold tracking-tight">创建你的 Workspace</h1>
        <p className="mt-3 text-sm leading-6 text-[var(--text-secondary)]">内容、集成和权限都将隔离在这个 Workspace 中。你会自动成为 OWNER。</p>
        <OnboardingForm />
      </Card>
    </main>
  );
}
