import { db, findSourceForUser } from "@content-center/db";
import { isLocalReviewOffline, DoubaoError, LocalAsrError } from "@content-center/providers";
import { requestSourceTranscription, TranscriptionAlreadyRunningError } from "@content-center/worker/transcription";
import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";

export async function POST(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const { id } = await route.params;
  const source = await findSourceForUser(db, {
    userId: context.session.user.id,
    workspaceId: context.workspace.id,
    sourceItemId: id,
  });
  if (!source) return apiError("NOT_FOUND", 404);
  if (isLocalReviewOffline()) return apiError("LOCAL_REVIEW_OFFLINE", 409, "验收环境已关闭转写任务和语音服务调用。");
  if (source.status !== "READY") return apiError("SOURCE_NOT_READY", 409, "资料尚未保存完成。");
  const media = source.assets.find((asset) => (asset.assetType === "VIDEO" || asset.assetType === "AUDIO") && asset.status === "STORED" && asset.storageKey);
  if (!media) return apiError("ASR_MEDIA_NOT_AVAILABLE", 409, "没有可转写的已保存媒体。");
  try {
    const result = await requestSourceTranscription({
      workspaceId: context.workspace.id,
      sourceItemId: source.id,
      requestedById: context.session.user.id,
      mediaAssetId: media.id,
    });
    return NextResponse.json({ jobId: result.job.id, status: result.job.status, created: result.created }, { status: 202 });
  } catch (error) {
    if (error instanceof TranscriptionAlreadyRunningError) {
      return apiError(error.code, 409, error.message);
    }
    if (error instanceof DoubaoError) {
      return apiError(error.code, error.code === "DOUBAO_DISABLED" ? 409 : 400, error.message);
    }
    if (error instanceof LocalAsrError) {
      const status = error.code === "LOCAL_ASR_NOT_RUNNING" ? 503 : 409;
      return apiError(error.code, status, error.message);
    }
    if (error instanceof Error && error.message === "QUEUE_UNAVAILABLE") return apiError("QUEUE_UNAVAILABLE", 503, "转写队列暂时不可用。");
    return apiError("TRANSCRIPTION_REQUEST_FAILED", 500, "无法创建转写任务。");
  }
}
