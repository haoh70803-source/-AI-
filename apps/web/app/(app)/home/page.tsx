import { WorkbenchStart } from "@/components/workbench-start";
import { FusionOverview } from "@/components/fusion-overview";
import { requireWorkspace } from "@/server/access";
export default async function HomePage() {
  const { session, workspace, role } = await requireWorkspace();
  return <WorkbenchStart canCreate={role !== "VIEWER"} draftKey={`xsj-start-draft:${workspace.id}:${session.user.id}`} overview={<FusionOverview workspaceId={workspace.id} userId={session.user.id} />} />;
}
