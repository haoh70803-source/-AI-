export const CONTENT_PROJECT_STATUSES = [
  "DRAFT",
  "RESEARCHING",
  "BRIEF_READY",
  "WRITING",
  "IN_REVIEW",
  "APPROVED",
  "ARCHIVED",
] as const;

export type ContentProjectStatus = (typeof CONTENT_PROJECT_STATUSES)[number];

const transitions: Record<ContentProjectStatus, readonly ContentProjectStatus[]> = {
  DRAFT: ["RESEARCHING", "ARCHIVED"],
  RESEARCHING: ["BRIEF_READY", "ARCHIVED"],
  BRIEF_READY: ["WRITING", "ARCHIVED"],
  WRITING: ["IN_REVIEW", "ARCHIVED"],
  IN_REVIEW: ["WRITING", "APPROVED", "ARCHIVED"],
  APPROVED: ["WRITING", "ARCHIVED"],
  ARCHIVED: [],
};

export type ProjectTransitionErrorCode = "INVALID_TRANSITION" | "BRIEF_REQUIRED" | "MOTHER_CONTENT_REQUIRED";

export class ProjectTransitionError extends Error {
  constructor(readonly code: ProjectTransitionErrorCode, message: string) {
    super(message);
    this.name = "ProjectTransitionError";
  }
}

export function allowedProjectTransitions(status: ContentProjectStatus) {
  return transitions[status];
}

export function transitionProjectStatus(input: {
  from: ContentProjectStatus;
  to: ContentProjectStatus;
  brief?: { topic?: string | null; coreMessage?: string | null } | null;
  motherContent?: { body?: string | null } | null;
}) {
  if (!transitions[input.from].includes(input.to)) {
    throw new ProjectTransitionError("INVALID_TRANSITION", `不允许从 ${input.from} 迁移到 ${input.to}。`);
  }
  if (input.to === "BRIEF_READY" && (!input.brief?.topic?.trim() || !input.brief.coreMessage?.trim())) {
    throw new ProjectTransitionError("BRIEF_REQUIRED", "进入 Brief Ready 前必须填写选题和核心观点。");
  }
  if (input.to === "IN_REVIEW" && !input.motherContent?.body?.trim()) {
    throw new ProjectTransitionError("MOTHER_CONTENT_REQUIRED", "提交审核前必须填写母稿正文。");
  }
  return input.to;
}
