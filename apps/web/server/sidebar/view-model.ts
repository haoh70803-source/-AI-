export type ProjectListItemView = {
  projectId: string;
  label: string;
  href: string;
  folderId: string | null;
  pinned: boolean;
  sortOrder: number;
  lastOpenedAt: string | null;
  updatedAt: string;
  recentAt: string;
  recentSource: "OPENED" | "UPDATED_FALLBACK";
};

export type ProjectFolderView = {
  folderId: string;
  label: string;
  sortOrder: number;
  projects: ProjectListItemView[];
};

export type ProjectListView = {
  workspaceId: string;
  canCreateProject: boolean;
  canRenameProject: boolean;
  pinned: ProjectListItemView[];
  recent: ProjectListItemView[];
  folders: ProjectFolderView[];
  ungrouped: ProjectListItemView[];
};

type ProjectRow = {
  id: string;
  title: string;
  updatedAt: Date;
};

type FolderRow = {
  id: string;
  name: string;
  sortOrder: number;
};

type PreferenceRow = {
  projectId: string;
  folderId: string | null;
  pinnedAt: Date | null;
  sortOrder: number;
  lastOpenedAt: Date | null;
};

function canonicalCompare(left: ProjectListItemView, right: ProjectListItemView) {
  return left.sortOrder - right.sortOrder
    || left.label.localeCompare(right.label, "zh-CN")
    || left.projectId.localeCompare(right.projectId);
}

export function projectListView(input: {
  workspaceId: string;
  role: "OWNER" | "ADMIN" | "EDITOR" | "VIEWER";
  projects: ProjectRow[];
  folders: FolderRow[];
  preferences: PreferenceRow[];
}): ProjectListView {
  const preferenceByProject = new Map(input.preferences.map((preference) => [preference.projectId, preference]));
  const pinnedAtByProject = new Map(input.preferences.map((preference) => [preference.projectId, preference.pinnedAt]));
  const validFolderIds = new Set(input.folders.map(({ id }) => id));
  const items = input.projects.map((project, index): ProjectListItemView => {
    const preference = preferenceByProject.get(project.id);
    const recentAt = preference?.lastOpenedAt ?? project.updatedAt;
    const folderId = preference?.folderId && validFolderIds.has(preference.folderId) ? preference.folderId : null;
    return {
      projectId: project.id,
      label: project.title,
      href: `/dashboard?project=${project.id}`,
      folderId,
      pinned: Boolean(preference?.pinnedAt),
      sortOrder: preference?.sortOrder ?? index,
      lastOpenedAt: preference?.lastOpenedAt?.toISOString() ?? null,
      updatedAt: project.updatedAt.toISOString(),
      recentAt: recentAt.toISOString(),
      recentSource: preference?.lastOpenedAt ? "OPENED" : "UPDATED_FALLBACK",
    };
  });
  const itemsByFolder = new Map<string, ProjectListItemView[]>();
  for (const item of items) {
    if (!item.folderId) continue;
    const current = itemsByFolder.get(item.folderId) ?? [];
    current.push(item);
    itemsByFolder.set(item.folderId, current);
  }
  const folders = input.folders
    .map((folder): ProjectFolderView => ({
      folderId: folder.id,
      label: folder.name,
      sortOrder: folder.sortOrder,
      projects: (itemsByFolder.get(folder.id) ?? []).sort(canonicalCompare),
    }))
    .sort((left, right) => left.sortOrder - right.sortOrder || left.label.localeCompare(right.label, "zh-CN") || left.folderId.localeCompare(right.folderId));
  const pinned = items
    .filter((item) => item.pinned)
    .sort((left, right) => {
      const leftPinnedAt = pinnedAtByProject.get(left.projectId)?.getTime() ?? 0;
      const rightPinnedAt = pinnedAtByProject.get(right.projectId)?.getTime() ?? 0;
      return rightPinnedAt - leftPinnedAt || left.projectId.localeCompare(right.projectId);
    });
  const recent = [...items]
    .sort((left, right) => new Date(right.recentAt).getTime() - new Date(left.recentAt).getTime() || left.projectId.localeCompare(right.projectId))
    .slice(0, 6);
  return {
    workspaceId: input.workspaceId,
    canCreateProject: input.role !== "VIEWER",
    canRenameProject: input.role !== "VIEWER",
    pinned,
    recent,
    folders,
    ungrouped: items.filter((item) => !item.folderId).sort(canonicalCompare),
  };
}
