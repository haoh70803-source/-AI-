import { apiError } from "@/server/api-access";
import { SidebarServiceError } from "./service";

export function sidebarApiError(error: unknown) {
  if (!(error instanceof SidebarServiceError)) return null;
  if (error.code === "SIDEBAR_NOT_FOUND") return apiError(error.code, 404, error.message);
  if (error.code === "SIDEBAR_FOLDER_CONFLICT") return apiError(error.code, 409, error.message);
  return apiError(error.code, 400, error.message);
}
