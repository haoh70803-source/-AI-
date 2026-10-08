import { db, findCollectionForUser, findSourceForUser } from "@content-center/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";

const schema = z.object({ collectionId: z.string().min(1) });
type RouteContext = { params: Promise<{ id: string }> };

async function resources(request: Request, route: RouteContext) {
  const context = await getApiWorkspaceContext();
  if (!context) return { response: apiError("UNAUTHORIZED", 401) };
  if (context.role === "VIEWER") return { response: apiError("FORBIDDEN", 403) };
  const parsed = schema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return { response: apiError("INVALID_INPUT", 400) };
  const { id } = await route.params;
  const [source, collection] = await Promise.all([
    findSourceForUser(db, { userId: context.session.user.id, workspaceId: context.workspace.id, sourceItemId: id }),
    findCollectionForUser(db, { userId: context.session.user.id, workspaceId: context.workspace.id, collectionId: parsed.data.collectionId }),
  ]);
  if (!source || !collection) return { response: apiError("NOT_FOUND", 404) };
  return { context, source, collection };
}

export async function POST(request: Request, route: RouteContext) {
  const result = await resources(request, route);
  if ("response" in result) return result.response;
  await db.$transaction([
    db.collectionItem.upsert({ where: { collectionId_sourceItemId: { collectionId: result.collection.id, sourceItemId: result.source.id } }, create: { collectionId: result.collection.id, sourceItemId: result.source.id }, update: {} }),
    db.auditLog.create({ data: { workspaceId: result.context.workspace.id, userId: result.context.session.user.id, action: "collection.item_added", resourceType: "source_item", resourceId: result.source.id, metadata: { collectionId: result.collection.id } } }),
  ]);
  return NextResponse.json({ status: "ADDED" }, { status: 201 });
}

export async function DELETE(request: Request, route: RouteContext) {
  const result = await resources(request, route);
  if ("response" in result) return result.response;
  await db.$transaction([
    db.collectionItem.deleteMany({ where: { collectionId: result.collection.id, sourceItemId: result.source.id } }),
    db.auditLog.create({ data: { workspaceId: result.context.workspace.id, userId: result.context.session.user.id, action: "collection.item_removed", resourceType: "source_item", resourceId: result.source.id, metadata: { collectionId: result.collection.id } } }),
  ]);
  return new NextResponse(null, { status: 204 });
}
