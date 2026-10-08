import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { importWorkflowSkill, MethodError, previewWorkflowSkill } from "@/server/methods/service";
import { WorkflowSkillParseError } from "@/server/workflow-skill/contract";

const inputSchema = z.object({ markdown: z.string().min(1).max(100_000), save: z.boolean().optional() }).strict();

function friendlyError(error: unknown) {
  if (error instanceof WorkflowSkillParseError) return NextResponse.json({ error: "WORKFLOW_SKILL_INVALID", message: "这个创作方法还不能导入。", issues: error.issues }, { status: 400 });
  if (error instanceof MethodError) return NextResponse.json({ error: error.code, message: error.message }, { status: error.code === "METHOD_NOT_FOUND" ? 404 : error.code === "METHOD_VERSION_CONFLICT" ? 409 : 400 });
  return null;
}

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = inputSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "请提供 Markdown 创作方法。");
  try {
    if (parsed.data.save) return NextResponse.json(await importWorkflowSkill({ workspaceId: context.workspace.id, ownerUserId: context.session.user.id, markdown: parsed.data.markdown }), { status: 201 });
    return NextResponse.json({ preview: previewWorkflowSkill(parsed.data.markdown) });
  } catch (error) {
    return friendlyError(error) ?? apiError("INTERNAL_ERROR", 500, "创作方法暂时无法导入，请稍后再试。");
  }
}
