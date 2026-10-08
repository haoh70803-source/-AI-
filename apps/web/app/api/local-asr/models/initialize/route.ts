import { canManageWorkspace } from "@content-center/core";
import { LocalAsrError, LOCAL_ASR_MODELS, TRANSCRIPTION_QUALITY_MODES } from "@content-center/providers";
import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { initializeLocalAsrModel } from "@/server/local-asr";

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (!canManageWorkspace(context.role)) return apiError("FORBIDDEN", 403);
  const body = await request.json().catch(() => null) as { qualityMode?: string; model?: string } | null;
  const qualityMode = body?.qualityMode && TRANSCRIPTION_QUALITY_MODES.includes(body.qualityMode as never)
    ? body.qualityMode as (typeof TRANSCRIPTION_QUALITY_MODES)[number]
    : undefined;
  const model = body?.model && LOCAL_ASR_MODELS.includes(body.model as never)
    ? body.model as (typeof LOCAL_ASR_MODELS)[number]
    : undefined;
  if (!qualityMode && !model) return apiError("INVALID_LOCAL_ASR_MODEL", 400, "请选择要初始化的质量模式或模型。");
  try {
    return NextResponse.json(await initializeLocalAsrModel({ workspaceId: context.workspace.id, qualityMode, model }));
  } catch (error) {
    if (error instanceof LocalAsrError) {
      return apiError(error.code, error.code === "LOCAL_ASR_NOT_RUNNING" ? 503 : 409, error.message);
    }
    return apiError("LOCAL_ASR_MODEL_LOAD_FAILED", 500, "本地模型初始化失败。");
  }
}

