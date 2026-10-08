import { NextResponse } from "next/server";
import { AIControlError } from "../ai/control/contracts";
import { MaterialKnowledgeError } from "./service";

export function materialKnowledgeApiError(error: unknown) {
  if (error instanceof MaterialKnowledgeError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.code === "SOURCE_NOT_FOUND" || error.code === "CANDIDATE_NOT_FOUND" ? 404 : error.code === "PERMISSION_DENIED" ? 403 : 422 });
  if (error instanceof AIControlError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.code === "PERMISSION_DENIED" ? 403 : error.code === "RATE_LIMITED" ? 429 : 503 });
  return NextResponse.json({ error: "UNKNOWN", message: "整理失败，可以重新试一次。" }, { status: 500 });
}
