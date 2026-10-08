import { slugifyTag } from "@content-center/core";
import { db } from "@content-center/db";
import { NextResponse } from "next/server";
import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";

export async function GET() {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const tags = await db.contentTag.findMany({ where: { workspaceId: context.workspace.id }, orderBy: { name: "asc" } });
  return NextResponse.json(tags);
}

export async function POST(request: Request) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  const parsed = z.object({ name: z.string().trim().min(1).max(50) }).safeParse(await request.json().catch(() => null));
  if (!parsed.success) return apiError("INVALID_INPUT", 400);
  const slug = slugifyTag(parsed.data.name);
  if (!slug) return apiError("INVALID_TAG", 400);
  const tag = await db.contentTag.upsert({
    where: { workspaceId_slug: { workspaceId: context.workspace.id, slug } },
    create: { workspaceId: context.workspace.id, name: parsed.data.name, slug },
    update: {},
  });
  return NextResponse.json(tag, { status: 201 });
}
