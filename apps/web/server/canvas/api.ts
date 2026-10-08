import { NextResponse } from "next/server";
import { CanvasServiceError } from "./service";

export function canvasApiError(error: unknown) {
  if (!(error instanceof CanvasServiceError)) return NextResponse.json({ error: "CANVAS_OPERATION_FAILED", message: "画布操作失败，请重试。" }, { status: 500 });
  const status = error.code === "PROJECT_NOT_FOUND" || error.code === "CANVAS_OBJECT_NOT_FOUND" || error.code === "CANVAS_SOURCE_NOT_FOUND" ? 404
    : error.code === "CANVAS_FORBIDDEN" ? 403
      : error.code === "CANVAS_CONTENT_CONFLICT" || error.code === "CANVAS_LAYOUT_CONFLICT" ? 409
        : 400;
  return NextResponse.json({ error: error.code, message: error.message }, { status });
}
