import { NextResponse } from "next/server";
import { ArtifactServiceError } from "./service";

export function artifactApiError(error: unknown) {
  if (!(error instanceof ArtifactServiceError)) return NextResponse.json({ error: "ARTIFACT_FAILED", message: "产出操作失败，请稍后重试。" }, { status: 500 });
  const status = error.code === "ARTIFACT_NOT_FOUND" ? 404 : error.code === "ARTIFACT_FORBIDDEN" ? 403 : error.code === "ARTIFACT_VERSION_CONFLICT" ? 409 : 400;
  return NextResponse.json({ error: error.code, message: error.message }, { status });
}
