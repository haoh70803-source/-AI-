import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { createMethodFromAnalysis, createMethodFromBenchmarkStudy, createMethodFromDistillation, createMethodSchema, listMethods, methodStatusSchema, MethodError } from "@/server/methods/service";

function methodApiError(error: unknown) {
  if (!(error instanceof MethodError)) return null;
  const status = error.code === "METHOD_NOT_FOUND" ? 404 : error.code === "METHOD_VERSION_CONFLICT" ? 409 : 400;
  return NextResponse.json({ error: error.code, message: error.message }, { status });
}

export async function GET(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const status = new URL(request.url).searchParams.get("status") || undefined;
  if (status && !methodStatusSchema.safeParse(status).success) return apiError("INVALID_METHOD_STATUS", 400, "请选择有效的方法状态。");
  try {
    return NextResponse.json(await listMethods({ workspaceId: context.workspace.id, ownerUserId: context.session.user.id, status: status as "SAVED" | "TRIAL" | "CORE" | "DISABLED" | undefined }));
  } catch (error) {
    return methodApiError(error) ?? apiError("METHODS_READ_FAILED", 500, "无法读取我的方法。");
  }
}

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = createMethodSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_METHOD_INPUT", 400, "请检查方法名称、步骤和适用边界。");
  try {
    const data = parsed.data;
    if ("benchmarkStudyId" in data) {
      return NextResponse.json(await createMethodFromBenchmarkStudy({ ...data, workspaceId: context.workspace.id, ownerUserId: context.session.user.id }), { status: 201 });
    }
    if ("materialDistillationId" in data) {
      return NextResponse.json(await createMethodFromDistillation({ ...data, workspaceId: context.workspace.id, ownerUserId: context.session.user.id }), { status: 201 });
    }
    return NextResponse.json(await createMethodFromAnalysis({ ...data, workspaceId: context.workspace.id, ownerUserId: context.session.user.id }), { status: 201 });
  } catch (error) {
    return methodApiError(error) ?? apiError("METHOD_CREATE_FAILED", 500, "无法保存方法。");
  }
}
