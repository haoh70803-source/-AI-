import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { canvasApiError } from "@/server/canvas/api";
import { softDeleteCanvasObject, updateCanvasLayout, updateCanvasText } from "@/server/canvas/service";

const updateSchema = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("TEXT"), expectedContentVersion: z.number().int().min(1), title: z.string().max(200).nullable().optional(), textContent: z.string().max(500_000) }).strict(),
  z.object({ kind: z.literal("LAYOUT"), expectedLayoutVersion: z.number().int().min(1), positionX: z.number().finite(), positionY: z.number().finite(), width: z.number().finite(), height: z.number().finite(), zIndex: z.number().int().optional() }).strict(),
]);
const deleteSchema = z.object({ expectedContentVersion: z.number().int().min(1) }).strict();
type RouteContext = { params: Promise<{ id: string; objectId: string }> };

export async function PATCH(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const parsed = updateSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "请检查节点更新内容。");
  const { id, objectId } = await route.params;
  try {
    const base = { workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, objectId };
    const object = parsed.data.kind === "TEXT"
      ? await updateCanvasText({ ...base, expectedContentVersion: parsed.data.expectedContentVersion, title: parsed.data.title, textContent: parsed.data.textContent })
      : await updateCanvasLayout({ ...base, expectedLayoutVersion: parsed.data.expectedLayoutVersion, layout: { positionX: parsed.data.positionX, positionY: parsed.data.positionY, width: parsed.data.width, height: parsed.data.height, zIndex: parsed.data.zIndex } });
    return NextResponse.json({ object });
  } catch (error) {
    return canvasApiError(error);
  }
}
export async function DELETE(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const parsed = deleteSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "缺少节点版本。");
  const { id, objectId } = await route.params;
  try {
    return NextResponse.json({ object: await softDeleteCanvasObject({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, objectId, expectedContentVersion: parsed.data.expectedContentVersion }) });
  } catch (error) {
    return canvasApiError(error);
  }
}
