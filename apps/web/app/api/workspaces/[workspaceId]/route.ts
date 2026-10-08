import { db, findWorkspaceForUser } from "@content-center/db";
import { headers } from "next/headers";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";

export async function GET(
  _request: Request,
  context: { params: Promise<{ workspaceId: string }> },
) {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session) return NextResponse.json({ error: "UNAUTHORIZED" }, { status: 401 });

  const { workspaceId } = await context.params;
  const workspace = await findWorkspaceForUser(db, { userId: session.user.id, workspaceId });
  if (!workspace) return NextResponse.json({ error: "NOT_FOUND" }, { status: 404 });

  return NextResponse.json({ id: workspace.id, name: workspace.name, slug: workspace.slug });
}
