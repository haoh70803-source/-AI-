import { apiError } from "@/server/api-access";
import { PublishTaskServiceError } from "./publish-task-service";

export function publishApiError(error: unknown) {
  if (!(error instanceof PublishTaskServiceError)) return apiError("PUBLISH_TASK_FAILED", 500);
  const status = error.code === "PUBLISH_TASK_NOT_FOUND" ? 404 : error.code === "PUBLISH_FORBIDDEN" ? 403 : 409;
  return apiError(error.code, status, error.message);
}
