import { NextResponse } from "next/server";
import { RedFoxError } from "@content-center/providers";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import {
  SourceMetadataRefreshError,
  canRefreshSourceMetadata,
  refreshSourceExternalMetadata,
} from "@/server/source-metadata-service";

export async function POST(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (!canRefreshSourceMetadata(context.role)) return apiError("FORBIDDEN", 403);
  const { id } = await route.params;
  try {
    const result = await refreshSourceExternalMetadata({
      workspaceId: context.workspace.id,
      userId: context.session.user.id,
      sourceItemId: id,
    });
    return NextResponse.json({ external: result.external });
  } catch (error) {
    if (error instanceof SourceMetadataRefreshError) {
      const status = error.code === "SOURCE_NOT_FOUND"
        ? 404
        : error.code === "REDFOX_NOT_CONFIGURED" || error.code === "REDFOX_DISABLED"
          ? 409
          : 422;
      return apiError(error.code, status, error.message);
    }
    if (error instanceof RedFoxError) {
      const status = error.code === "REDFOX_RATE_LIMITED" ? 429 : error.retryable ? 503 : 502;
      return apiError(error.code, status, error.message);
    }
    return apiError("SOURCE_METADATA_REFRESH_FAILED", 500, "作品数据刷新失败，请稍后重试。");
  }
}
