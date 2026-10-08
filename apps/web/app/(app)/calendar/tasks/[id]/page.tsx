import { ArrowLeft } from "lucide-react";
import Link from "next/link";
import { notFound } from "next/navigation";
import { PublishTaskWorkspace, type PublishTaskView } from "@/components/publishing/publish-task-workspace";
import { requireWorkspace } from "@/server/access";
import { getPublishTask, PublishTaskServiceError } from "@/server/publishing/publish-task-service";

export default async function PublishTaskPage({ params }: { params: Promise<{ id: string }> }) {
  const { session, workspace, role } = await requireWorkspace();
  const { id } = await params;
  let task;
  try { task = await getPublishTask({ workspaceId: workspace.id, userId: session.user.id }, id); }
  catch (error) { if (error instanceof PublishTaskServiceError && error.code === "PUBLISH_TASK_NOT_FOUND") notFound(); throw error; }
  const view: PublishTaskView = {
    id: task.id, projectId: task.projectId, platform: task.platform, status: task.status, scheduledAt: task.scheduledAt?.toISOString() ?? null, publishedAt: task.publishedAt?.toISOString() ?? null, externalUrl: task.externalUrl, externalPostId: task.externalPostId, note: task.note,
    project: { title: task.project.title, creatorName: task.project.creatorProfile?.displayName || task.createdBy.name, motherVersion: task.project.motherContent?.version ?? null },
    publisher: task.publisher,
    snapshot: { variantVersion: task.snapshot.variantVersion, motherVersion: task.snapshot.motherVersion, createdAt: task.snapshot.createdAt },
    package: { sections: task.package.sections, fullText: task.package.fullText },
    contentChanged: task.contentChanged,
    canEdit: role !== "VIEWER",
  };
  return <><header className="mb-5"><Link href="/calendar" className="inline-flex items-center gap-2 text-sm text-[var(--text-secondary)] hover:text-[var(--text-primary)]"><ArrowLeft size={16} />返回发布中心</Link><h1 className="mt-4 text-2xl font-semibold tracking-tight">发布任务详情</h1><p className="mt-1 text-sm text-[var(--text-secondary)]">复制发布包后，由人工登录真实平台完成发布。</p></header><PublishTaskWorkspace initial={view} /></>;
}
