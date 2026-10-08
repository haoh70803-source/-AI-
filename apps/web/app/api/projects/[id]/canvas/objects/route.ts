import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { canvasApiError } from "@/server/canvas/api";
import { createCanvasMaterialObject, createCanvasTextObject, listCanvasObjects } from "@/server/canvas/service";

const layoutSchema = z.object({
  positionX: z.number().finite(),
  positionY: z.number().finite(),
  width: z.number().finite(),
  height: z.number().finite(),
  zIndex: z.number().int().optional(),
}).strict();

const createSchema = z.discriminatedUnion("objectType", [
  z.object({ objectType: z.literal("TEXT"), title: z.string().max(200).nullable().optional(), textContent: z.string().max(500_000).optional(), layout: layoutSchema }).strict(),
  z.object({ objectType: z.literal("MATERIAL_REFERENCE"), sourceItemId: z.string().min(1).max(200), excerpt: z.string().max(5_000).nullable().optional(), layout: layoutSchema }).strict(),
  z.object({ objectType: z.literal("IMAGE_REFERENCE"), sourceItemId: z.string().min(1).max(200), sourceAssetId: z.string().min(1).max(200), layout: layoutSchema }).strict(),
]);

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id } = await route.params;
  try {
    return NextResponse.json({ objects: await listCanvasObjects({ workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id }) });
  } catch (error) {
    return canvasApiError(error);
  }
}
export async function POST(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const parsed = createSchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400, "请检查节点内容、位置和尺寸。");
  const { id } = await route.params;
  try {
    const base = { workspaceId: context.workspace.id, userId: context.session.user.id, projectId: id, layout: parsed.data.layout };
    const object = parsed.data.objectType === "TEXT"
      ? await createCanvasTextObject({ ...base, title: parsed.data.title, textContent: parsed.data.textContent })
      : await createCanvasMaterialObject({ ...base, objectType: parsed.data.objectType, sourceItemId: parsed.data.sourceItemId, sourceAssetId: parsed.data.objectType === "IMAGE_REFERENCE" ? parsed.data.sourceAssetId : null, excerpt: parsed.data.objectType === "MATERIAL_REFERENCE" ? parsed.data.excerpt : null });
    return NextResponse.json({ object }, { status: 201 });
  } catch (error) {
    return canvasApiError(error);
  }
}
