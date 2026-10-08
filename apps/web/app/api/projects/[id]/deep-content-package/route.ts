import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { deepContentApiError } from "@/server/deep-content/api";
import { getDeepContentPackage, updateDeepContentPackage } from "@/server/deep-content/service";

const updateSchema = z.object({
  packageId: z.string().min(1),
  expectedUpdatedAt: z.string().datetime(),
  coreTopic: z.string().min(1).max(2_000),
  mainViewpoint: z.string().min(1).max(10_000),
  supportingViewpoints: z.array(z.string().max(5_000)).max(100),
  personalViews: z.array(z.string().max(5_000)).max(100),
  recommendedStructure: z.string().min(1).max(2_000),
  risks: z.array(z.string().max(5_000)).max(100),
}).strict();

export async function GET(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await route.params;
  try { return NextResponse.json({ package: await getDeepContentPackage({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id }) }); }
  catch (error) { return deepContentApiError(error); }
}

export async function PUT(request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const { id } = await route.params;
  const { packageId, expectedUpdatedAt, ...data } = parsed.data;
  try { return NextResponse.json({ package: await updateDeepContentPackage({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, packageId, expectedUpdatedAt, data }) }); }
  catch (error) { return deepContentApiError(error); }
}
