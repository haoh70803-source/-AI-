import { ZodError } from "zod";
import { apiError, getApiWorkspaceContext } from "../api-access";
import { ResearchError } from "./access";
export async function researchApiActor() {
  const context = await getApiWorkspaceContext();
  if (!context) throw new ResearchError("UNAUTHORIZED", "请登录后继续。", 401);
  return { workspaceId: context.workspace.id, userId: context.session.user.id };
}
export function researchApiError(error: unknown) {
  if (error instanceof ResearchError) return apiError(error.code, error.status, error.message);
  if (error instanceof ZodError) return apiError("INVALID_INPUT", 400, "请检查问题、对象范围与输入长度。");
  return apiError("RESEARCH_UNAVAILABLE", 503, "研究服务暂时不可用，请稍后重试。");
}
