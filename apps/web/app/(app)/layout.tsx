import { cookies } from "next/headers";
import { AppShell } from "@/components/app-shell";
import { db } from "@content-center/db";
import { requireWorkspace } from "@/server/access";
import { SIDEBAR_PIN_COOKIE } from "@/components/sidebar-state";
import { getProjectListView } from "@/server/sidebar/service";

export default async function AppLayout({ children, settings }: { children: React.ReactNode; settings: React.ReactNode }) {
  const { session, workspace } = await requireWorkspace();
  const [user, initialProjectListView, cookieStore] = await Promise.all([
    db.user.findUnique({ where: { id: session.user.id }, select: { systemRole: true } }),
    getProjectListView({ workspaceId: workspace.id, userId: session.user.id }),
    cookies(),
  ]);
  const initialPinned = cookieStore.get(SIDEBAR_PIN_COOKIE)?.value !== "0";
  return (
    <div className="app-shell" data-shell="v4" data-sidebar-initial={initialPinned ? "pinned" : "collapsed"}>
      <AppShell initialPinned={initialPinned} workspaceName={workspace.name} userName={session.user.name} isSystemAdmin={user?.systemRole === "SYSTEM_ADMIN"} initialProjectListView={initialProjectListView} />
      <main id="main-content" className="app-main">{children}</main>
      {settings}
    </div>
  );
}
