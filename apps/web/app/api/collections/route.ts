import { db } from "@content-center/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";

export async function GET() {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const collections = await db.collection.findMany({ where: { workspaceId: context.workspace.id }, orderBy: { name: "asc" } });
  return NextResponse.json(collections);
}

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = z.object({ name: z.string().trim().min(1).max(100), description: z.string().trim().max(500).optional() }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const existing = await db.collection.findFirst({ where: { workspaceId: context.workspace.id, name: { equals: parsed.data.name, mode: "insensitive" } }, select: { id: true } });
  if (existing) return apiError("DUPLICATE_COLLECTION", 409);
  const collection = await db.$transaction(async (tx) => {
    const created = await tx.collection.create({ data: { workspaceId: context.workspace.id, createdById: context.session.user.id, name: parsed.data.name, description: parsed.data.description } });
    await tx.auditLog.create({ data: { workspaceId: context.workspace.id, userId: context.session.user.id, action: "collection.created", resourceType: "collection", resourceId: created.id } });
    return created;
  });
  return NextResponse.json(collection, { status: 201 });
}
