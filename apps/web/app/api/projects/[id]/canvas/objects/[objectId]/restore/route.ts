import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { canvasApiError } from "@/server/canvas/api";
import { restoreCanvasObject } from "@/server/canvas/service";

const schema = z.object({ expectedContentVersion: z.number().int().min(1) }).strict();

export async function POST(request: Request, route: { params: Promise<{ id: string; objectId: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "缺少节点版本。");
  const { id, objectId } = await route.params;
  try {
    return NextResponse.json({ object: await restoreCanvasObject({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, objectId, expectedContentVersion: parsed.data.expectedContentVersion }) });
  } catch (error) {
    return canvasApiError(error);
  }
}
