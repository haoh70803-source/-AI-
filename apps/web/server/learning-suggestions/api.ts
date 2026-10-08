import { NextResponse } from "next/server";
import { LearningSuggestionError } from "./service";

export function learningSuggestionApiError(error: unknown) {
  if (!(error instanceof LearningSuggestionError)) return null;
  const status = error.code === "NOT_FOUND" ? 404 : error.code === "FORBIDDEN" ? 403 : error.code === "ALREADY_REVIEWED" ? 409 : 400;
  return NextResponse.json({ error: error.code, message: error.message }, { status });
}
