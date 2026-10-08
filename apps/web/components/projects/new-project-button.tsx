"use client";

import { Plus } from "lucide-react";
import { useState } from "react";
import { NewProjectDialog } from "../sidebar/new-project-dialog";
import { useSidebarLockController } from "../app-shell";

export function NewProjectButton({ folderId, returnTo, label = "新建项目" }: { folderId?: string; returnTo?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  const lock = useSidebarLockController();
  return <><button className="project-create-button" type="button" onClick={() => setOpen(true)}><Plus size={16} />{label}</button><NewProjectDialog folderId={folderId} returnTo={returnTo} open={open} onOpenChange={setOpen} onInteractionLockChange={lock} onCreated={async () => { window.dispatchEvent(new Event("project-list-changed")); }} /></>;
}
