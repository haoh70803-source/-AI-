import { notFound } from "next/navigation";
import { SourceWorkspace } from "@/components/material-detail/source-workspace";
import { requireWorkspace } from "@/server/access";
import { getSourceWorkspaceModel } from "@/server/material-detail/read-model";

type PreviewState = "TRANSCRIBING" | "TRANSCRIPT_ONLY" | "M1_ONLY";

export default async function SourceDetailPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ previewState?: string }> }) {
  const { session, workspace, role } = await requireWorkspace();
  const { id } = await params;
  const query = await searchParams;
  const previewState = process.env.NODE_ENV !== "production" && (["TRANSCRIBING", "TRANSCRIPT_ONLY", "M1_ONLY"] as string[]).includes(query.previewState || "") ? query.previewState as PreviewState : null;
  const model = await getSourceWorkspaceModel({ workspaceId: workspace.id, userId: session.user.id, sourceItemId: id, role });
  if (!model) notFound();
  if (previewState === "TRANSCRIBING" && model.workspace) model.workspace.busy = true;
  return <SourceWorkspace model={model} />;
}
