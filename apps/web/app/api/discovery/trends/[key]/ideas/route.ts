import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { trendApiError } from "@/server/discovery/trends/api";
import { decodeTrendOpportunityKey } from "@/server/discovery/trends/read-model";
import { saveTrendIdeaSchema } from "@/server/discovery/trends/schemas";
import { saveCandidateTrendIdea, saveManualTrendIdea } from "@/server/discovery/trends/topic-service";

export async function POST(request: Request, contextValue: RouteContext<"/api/discovery/trends/[key]/ideas">) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403, "只读成员无法保存选题。");
  try {
    const { key: encodedKey } = await contextValue.params;
    const key = decodeTrendOpportunityKey(encodedKey);
    const input = saveTrendIdeaSchema.parse(await request.json().catch(() => null));
    const idea = input.mode === "MANUAL"
      ? await saveManualTrendIdea({ workspaceId: context.workspace.id, userId: context.session.user.id, opportunityKey: key, title: input.title })
      : await saveCandidateTrendIdea({ workspaceId: context.workspace.id, userId: context.session.user.id, opportunityKey: key, runId: input.runId, selectedIndex: input.selectedIndex });
    return NextResponse.json({ ideaId: idea.id }, { status: 201 });
  } catch (error) { return trendApiError(error); }
}
