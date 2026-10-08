import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { getBenchmarkCollectionRun } from "@/server/discovery/benchmark-collection-service";

export async function GET(_request: Request, { params }: { params: Promise<{ id: string; runId: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  const { id, runId } = await params;
  const run = await getBenchmarkCollectionRun({ workspaceId: context.workspace.id, benchmarkAccountId: id, runId });
  return run ? NextResponse.json(run) : apiError("NOT_FOUND", 404, "采集批次不存在。");
}
