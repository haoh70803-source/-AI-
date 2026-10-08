import { z } from "zod";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { materialKnowledgeApiError } from "@/server/material-knowledge/api";
import { decideMaterialCandidate } from "@/server/material-knowledge/service";

const schema = z.object({ decision: z.enum(["CONFIRM", "REJECT"]), content: z.string().trim().min(1).max(1_000).optional() }).strict();
type RouteContext = { params: Promise<{ id: string; candidateId: string }> };
export async function PATCH(request: Request, route: RouteContext) { const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401); const parsed = schema.safeParse(await request.json().catch(() => null)); if (!parsed.success) return apiError("INVALID_INPUT", 400, "请确认这条信息的处理方式。"); const { id, candidateId } = await route.params; try { return Response.json(await decideMaterialCandidate({ workspaceId: context.workspace.id, userId: context.session.user.id, sourceItemId: id, candidateId, ...parsed.data })); } catch (error) { return materialKnowledgeApiError(error); } }
