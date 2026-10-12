import "server-only";

import { createProject, ProjectServiceError } from "../project-service";

export class BasicProjectError extends Error {
  constructor(readonly code: "INVALID_INPUT" | "FORBIDDEN" | "FOLDER_NOT_FOUND") {
    super(code);
    this.name = "BasicProjectError";
  }
}

/** The sidebar creates an empty project; creative setup belongs to its own flow. */
export async function createBasicProject(input: { workspaceId: string; userId: string; title: string; description?: string; folderId?: string }) {
  const title = input.title.trim();
  const description = input.description?.trim() || null;
  if (!title || title.length > 200 || (description?.length ?? 0) > 5_000) throw new BasicProjectError("INVALID_INPUT");
  try {
    return await createProject({ ...input, title, description: description ?? undefined });
  } catch (error) {
    if (error instanceof ProjectServiceError && error.code === "PROJECT_FORBIDDEN") throw new BasicProjectError("FORBIDDEN");
    if (error instanceof ProjectServiceError && error.code === "PROJECT_NOT_FOUND" && input.folderId) throw new BasicProjectError("FOLDER_NOT_FOUND");
    throw error;
  }
}
