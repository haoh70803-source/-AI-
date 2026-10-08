import { creationModelSchema } from "@/server/creation/models";
import { notFound, redirect } from "next/navigation";
import { StudioShell } from "@/components/projects/studio-shell";
import { FusionOverview } from "@/components/fusion-overview";
import { WorkbenchStart } from "@/components/workbench-start";
import { requireWorkspace } from "@/server/access";
import { loadWorkbenchPageData } from "@/server/workbench-page-data";
import { ArtifactServiceError } from "@/server/artifacts/service";

export default async function DashboardPage({ searchParams }: { searchParams: Promise<{ project?: string; node?: string; start?: string; skill?: string }> }) {
  const { session, workspace, role } = await requireWorkspace();
  const query = await searchParams;
  const projectId = typeof query.project === "string" ? query.project.trim() : "";

  if (projectId) {
    const node = typeof query.node === "string" ? query.node : null;
    const activeArtifactId = node?.startsWith("artifact:") ? node.slice("artifact:".length) : null;
    const data = await loadWorkbenchPageData({ userId: session.user.id, workspaceId: workspace.id, role, projectId, activeArtifactId }).catch((error) => {
      if (error instanceof ArtifactServiceError && error.code === "ARTIFACT_NOT_FOUND") return null;
      throw error;
    });
    if (!data) notFound();
    if (node?.startsWith("source:")) {
      const sourceId = node.slice("source:".length);
      if (!data.project.sources.some(source => source.sourceItem.id === sourceId)) notFound();
      redirect(`/library/${encodeURIComponent(sourceId)}`);
    }
    return <div className="dashboard-workbench"><div className="studio-page"><StudioShell {...data} activeNode={node} initialRequest={query.start === "1" && data.project.description ? { content: data.project.description, sourceItemIds: data.project.sources.map(source => source.sourceItem.id), skillVersionId: data.methods.selected[0]?.methodVersionId ?? null, modelSelection: creationModelSchema.safeParse(data.project.creationModel).data ?? null } : undefined} /></div></div>;
  }

  return <WorkbenchStart overview={<FusionOverview workspaceId={workspace.id} userId={session.user.id} />} initialSkillId={typeof query.skill === "string" ? query.skill : undefined} canCreate={role !== "VIEWER"} draftKey={`xsj-start-draft:${workspace.id}:${session.user.id}`} />;
}
