import { requireWorkspace } from "@/server/access";
import { listResearchSessions } from "@/server/research/service";
import { ResearchShell } from "@/components/research/research-shell";
import "@/components/research/research.css";
export default async function ResearchLayout({ children }: { children: React.ReactNode }) {
  const { workspace, session } = await requireWorkspace();
  const sessions = await listResearchSessions({ workspaceId: workspace.id, userId: session.user.id });
  return <ResearchShell sessions={sessions}>{children}</ResearchShell>;
}
