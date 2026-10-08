import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import { getBenchmarkCreatorDetail } from "@/server/discovery/benchmark-creator-read-model";
import { buildAccountReportContract } from "@/server/discovery/account-report-contract";

export async function GET(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const runId = new URL(request.url).searchParams.get("runId") ?? undefined;
  const context = await getApiWorkspaceContext(); if (!context) return apiError("UNAUTHORIZED", 401);
  const profile = await getBenchmarkCreatorDetail({ workspaceId: context.workspace.id, ownerUserId: context.session.user.id, benchmarkAccountId: (await params).id, collectionRunId: runId });
  if (!profile) return apiError("NOT_FOUND", 404);
  return NextResponse.json(buildAccountReportContract(profile));
}
