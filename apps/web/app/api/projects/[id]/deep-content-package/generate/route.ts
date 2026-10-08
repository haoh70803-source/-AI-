import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { deepContentApiError } from "@/server/deep-content/api";
import { generateDeepContentPackagePreview } from "@/server/deep-content/service";

export async function POST(_request: Request, route: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const { id } = await route.params;
  try { return NextResponse.json(await generateDeepContentPackagePreview({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id }), { status: 201 }); }
  catch (error) { return deepContentApiError(error); }
}
