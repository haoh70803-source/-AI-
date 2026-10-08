import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { trendApiError } from "@/server/discovery/trends/api";
import { decodeTrendOpportunityKey } from "@/server/discovery/trends/read-model";
import { generateTopicCandidatesSchema } from "@/server/discovery/trends/schemas";
import { generateTopicCandidates } from "@/server/discovery/trends/topic-service";

export async function POST(request: Request, contextValue: RouteContext<"/api/discovery/trends/[key]/topics">) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403, "只读成员无法生成选题建议。");
  try {
    const { key: encodedKey } = await contextValue.params;
    const key = decodeTrendOpportunityKey(encodedKey);
    const input = generateTopicCandidatesSchema.parse(await request.json().catch(() => null));
    const result = await generateTopicCandidates({ workspaceId: context.workspace.id, userId: context.session.user.id, opportunityKey: key, supportingContents: input.supportingContents });
    return NextResponse.json({ runId: result.id, candidates: result.output.candidates, provider: result.provider === "MOCK" ? "MOCK" : "CONFIGURED" });
  } catch (error) { return trendApiError(error); }
}
