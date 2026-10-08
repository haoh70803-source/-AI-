"use client";

import { ProjectCardMenu } from "./project-card-menu";
import { ProjectLifecycleActions } from "./project-lifecycle-actions";
import type { ProjectFolderView } from "@/server/sidebar/view-model";

/** Later project lifecycle actions remain available outside the Sidebar organization baseline. */
export function ProjectCardMenuWithLifecycle({ projectId, title, archived = false, folders, folderId, canManage = true }: { projectId: string; title: string; ended?: boolean; archived?: boolean; folders?: ProjectFolderView[]; folderId?: string | null; canManage?: boolean }) {
  return <ProjectCardMenu projectId={projectId} title={title} archived={archived} folders={folders} folderId={folderId} canManage={canManage} lifecycleActions={({ closeMenu, onInteractionLockChange }) => <ProjectLifecycleActions projectId={projectId} title={title} archived={archived} canManage={canManage} closeMenu={closeMenu} onInteractionLockChange={onInteractionLockChange} />} />;
}
