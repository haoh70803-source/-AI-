import { requireNewsActor } from "@/server/research/news/access";
import { ResearchError } from "@/server/research/access";
import { requireWorkspace } from "@/server/access";
import { listResearchSessions } from "@/server/research/service";
import { ResearchShell } from "@/components/research/research-shell";
import "@/components/research/research.css";
export default async function ResearchLayout({ children }: { children: React.ReactNode }) {
  const { workspace, session } = await requireWorkspace();
  const sessions = await listResearchSessions({ workspaceId: workspace.id, userId: session.user.id });
  const canReadNews = await requireNewsActor({ workspaceId: workspace.id, userId: session.user.id }).then(() => true).catch(error => { if (error instanceof ResearchError && error.status === 403) return false; throw error; });
  return <ResearchShell sessions={sessions} canReadNews={canReadNews}>{children}</ResearchShell>;
}
