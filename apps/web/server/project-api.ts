import { ProjectTransitionError } from "@content-center/core";
import { NextResponse } from "next/server";
import { VersionConflictError } from "./brief-service";
import { ProjectServiceError } from "./project-service";
import { CreationInputError } from "./creation/models";

export function projectApiError(error: unknown) {
  if (error instanceof CreationInputError) return NextResponse.json({ error: "CREATION_INPUT_INVALID", message: error.message }, { status: 400 });
  if (error instanceof VersionConflictError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
  }
  if (error instanceof ProjectTransitionError) {
    return NextResponse.json({ error: error.code, message: error.message }, { status: 409 });
  }
  if (error instanceof ProjectServiceError) {
    if(error.code === "PROJECT_RETAINED") return NextResponse.json({error:error.code,message:"此项目关联了选题审核历史，请归档项目以保留记录。"},{status:409});
    if (error.code === "PROJECT_CONFLICT") return NextResponse.json({ error: error.code, message: "项目状态已发生变化，请刷新后重试。" }, { status: 409 });
    const status = error.code === "SOURCE_LIMIT_EXCEEDED" ? 400 : error.code === "SOURCE_ALREADY_ADDED" ? 409 : 404;
    const message = error.code === "SOURCE_LIMIT_EXCEEDED" ? "一次最多选择 8 条资料。" : error.code === "SOURCE_ALREADY_ADDED"
      ? "该素材已在项目中。"
      : error.code === "SOURCE_NOT_FOUND"
        ? "素材不存在或不属于当前 Workspace。"
        : "项目不存在。";
    return NextResponse.json({ error: error.code, message }, { status });
  }
  return null;
}
