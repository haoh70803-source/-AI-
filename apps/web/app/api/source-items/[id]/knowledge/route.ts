import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { materialKnowledgeApiError } from "@/server/material-knowledge/api";
import { extractMaterialKnowledge, getMaterialKnowledge } from "@/server/material-knowledge/service";

type RouteContext = { params: Promise<{ id: string }> };
export async function GET(_request: Request, route: RouteContext) { const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401); const { id } = await route.params; try { return Response.json(await getMaterialKnowledge({ workspaceId: context.workspace.id, userId: context.session.user.id, sourceItemId: id })); } catch (error) { return materialKnowledgeApiError(error); } }
export async function POST(_request: Request, route: RouteContext) { const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401); const { id } = await route.params; try { return Response.json(await extractMaterialKnowledge({ workspaceId: context.workspace.id, userId: context.session.user.id, sourceItemId: id }), { status: 201 }); } catch (error) { return materialKnowledgeApiError(error); } }
