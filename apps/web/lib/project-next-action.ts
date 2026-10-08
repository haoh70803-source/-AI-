export type ProjectNextAction =
  | "ADD_REFERENCE"
  | "ORGANIZE_REFERENCE"
  | "COMPLETE_SUPPLEMENT"
  | "GENERATE_MOTHER"
  | "CONFIRM_MOTHER"
  | "GENERATE_PLATFORM"
  | "SUBMIT_REVIEW"
  | "ADD_TO_PUBLISHING";

export const projectNextActionLabels: Record<ProjectNextAction, string> = {
  ADD_REFERENCE: "添加参考素材",
  ORGANIZE_REFERENCE: "整理参考素材",
  COMPLETE_SUPPLEMENT: "完善我的补充",
  GENERATE_MOTHER: "生成我的口播稿",
  CONFIRM_MOTHER: "确认我的口播稿",
  GENERATE_PLATFORM: "生成平台版本",
  SUBMIT_REVIEW: "提交审核",
  ADD_TO_PUBLISHING: "加入发布中心",
};

export function getProjectNextAction(input: {
  sources: ReadonlyArray<{ completedAnalysis?: boolean }>;
  supplement?: string | null;
  mother?: { body: string; version: number; confirmedVersion?: number | null } | null;
  platformStatuses: ReadonlyArray<string>;
}): { key: ProjectNextAction; label: string } {
  if (!input.sources.length) return { key: "ADD_REFERENCE", label: projectNextActionLabels.ADD_REFERENCE };
  if (!input.sources.some((source) => source.completedAnalysis)) return { key: "ORGANIZE_REFERENCE", label: projectNextActionLabels.ORGANIZE_REFERENCE };
  if (!input.supplement?.trim()) return { key: "COMPLETE_SUPPLEMENT", label: projectNextActionLabels.COMPLETE_SUPPLEMENT };
  if (!input.mother?.body.trim()) return { key: "GENERATE_MOTHER", label: projectNextActionLabels.GENERATE_MOTHER };
  if (input.mother.confirmedVersion !== input.mother.version) return { key: "CONFIRM_MOTHER", label: projectNextActionLabels.CONFIRM_MOTHER };
  if (!input.platformStatuses.length) return { key: "GENERATE_PLATFORM", label: projectNextActionLabels.GENERATE_PLATFORM };
  if (input.platformStatuses.some((status) => status !== "APPROVED")) return { key: "SUBMIT_REVIEW", label: projectNextActionLabels.SUBMIT_REVIEW };
  return { key: "ADD_TO_PUBLISHING", label: projectNextActionLabels.ADD_TO_PUBLISHING };
}
