import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { discoveryApiError } from "@/server/discovery/api";
import { addIdeaReferenceSchema } from "@/server/discovery/schemas";
import { addIdeaReference } from "@/server/discovery/service";

export async function POST(request: Request, { params }: RouteContext<"/api/discovery/ideas/[id]/references">) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403);
  try {
    const { id } = await params;
    const input = addIdeaReferenceSchema.parse(await request.json().catch(() => null));
    const reference = await addIdeaReference({ workspaceId: context.workspace.id, userId: context.session.user.id, ideaId: id, reference: input.reference });
    return NextResponse.json({ reference }, { status: 201 });
  } catch (error) {
    return discoveryApiError(error);
  }
}
