import { NextResponse } from "next/server";
import { DraftServiceError } from "./service";

export function draftApiError(error: unknown) {
  if (!(error instanceof DraftServiceError)) return null;
  const status = error.code === "PROJECT_NOT_FOUND" || error.code === "DRAFT_NOT_FOUND" ? 404
    : error.code === "DRAFT_FORBIDDEN" ? 403
      : error.code === "DRAFT_VERSION_CONFLICT" || error.code === "DRAFT_PRIMARY_CONFLICT" || error.code === "DRAFT_PRIMARY_DELETE_FORBIDDEN" ? 409
        : 400;
  return NextResponse.json({ error: error.code, message: error.message }, { status });
}
