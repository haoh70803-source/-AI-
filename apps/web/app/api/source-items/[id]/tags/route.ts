import { db, findSourceForUser, findTagForUser } from "@content-center/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";

const schema = z.object({ tagId: z.string().min(1) });
type RouteContext = { params: Promise<{ id: string }> };

async function resources(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return { response: apiError("UNAUTHORIZED", 401) };
  if (context.role === "VIEWER") return { response: apiError("FORBIDDEN", 403) };
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return { response: apiError("INVALID_INPUT", 400) };
  const { id } = await route.params;
  const [source, tag] = await Promise.all([
    findSourceForUser(db, { userId: context.session.user.id, workspaceId: context.workspace.id, sourceItemId: id }),
    findTagForUser(db, { userId: context.session.user.id, workspaceId: context.workspace.id, tagId: parsed.data.tagId }),
  ]);
  if (!source || !tag) return { response: apiError("NOT_FOUND", 404) };
  return { context, source, tag };
}

export async function POST(request: Request, route: RouteContext) {
  const result = await resources(request, route);
  if ("response" in result) return result.response;
  await db.$transaction([
    db.sourceItemTag.upsert({ where: { sourceItemId_tagId: { sourceItemId: result.source.id, tagId: result.tag.id } }, create: { sourceItemId: result.source.id, tagId: result.tag.id }, update: {} }),
    db.auditLog.create({ data: { workspaceId: result.context.workspace.id, userId: result.context.session.user.id, action: "source.tag_added", resourceType: "source_item", resourceId: result.source.id, metadata: { tagId: result.tag.id } } }),
  ]);
  return NextResponse.json({ status: "ADDED" }, { status: 201 });
}

export async function DELETE(request: Request, route: RouteContext) {
  const result = await resources(request, route);
  if ("response" in result) return result.response;
  await db.$transaction([
    db.sourceItemTag.deleteMany({ where: { sourceItemId: result.source.id, tagId: result.tag.id } }),
    db.auditLog.create({ data: { workspaceId: result.context.workspace.id, userId: result.context.session.user.id, action: "source.tag_removed", resourceType: "source_item", resourceId: result.source.id, metadata: { tagId: result.tag.id } } }),
  ]);
  return new NextResponse(null, { status: 204 });
}
