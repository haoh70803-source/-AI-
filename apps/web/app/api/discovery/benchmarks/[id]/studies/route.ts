import { NextResponse } from "next/server";
import { apiError, getApiWorkspaceContext } from "@/server/api-access";
import {
  BenchmarkStudyError,
  createBenchmarkCreatorProfileStudy,
  createBenchmarkCreatorProfileStudySchema,
  createBenchmarkPlaybookStudy,
  createBenchmarkPlaybookStudySchema,
  createBenchmarkStudy,
  createBenchmarkStudySchema,
  listBenchmarkStudies,
} from "@/server/discovery/benchmark-study-service";

function studyApiError(error: unknown) {
  if (!(error instanceof BenchmarkStudyError)) return null;
  const status = error.code === "BENCHMARK_NOT_FOUND" || error.code === "BENCHMARK_STUDY_NOT_FOUND" ? 404 : error.code === "BENCHMARK_FORBIDDEN" ? 403 : error.code === "BENCHMARK_STUDY_IN_PROGRESS" || error.code === "BENCHMARK_QUEUE_UNAVAILABLE" ? 409 : 400;
  return NextResponse.json({ error: error.code, message: error.message }, { status });
}

export async function GET(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  try {
    const { id } = await params;
    return NextResponse.json({ items: await listBenchmarkStudies({ workspaceId: context.workspace.id, benchmarkAccountId: id }) });
  } catch (error) {
    return studyApiError(error) ?? apiError("BENCHMARK_STUDIES_READ_FAILED", 500, "无法读取账号研究。");
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  const context = await getApiWorkspaceContext();
  if (!context) return apiError("UNAUTHORIZED", 401);
  if (context.role === "VIEWER") return apiError("FORBIDDEN", 403, "当前权限不能发起账号研究。");
  const body = await request.json().catch(() => null) as { kind?: unknown; sampleIds?: unknown; snapshotIds?: unknown; contentSnapshotIds?: unknown; collectionRunId?: unknown } | null;
  if (body?.collectionRunId !== undefined && typeof body.collectionRunId !== "string") return apiError("BENCHMARK_INVALID_SAMPLES", 400, "采集批次无效。");
  const creatorProfile = body?.kind === "CREATOR_PROFILE";
  const playbooks = body?.kind === "PLAYBOOKS";
  const schema = creatorProfile ? createBenchmarkCreatorProfileStudySchema : playbooks ? createBenchmarkPlaybookStudySchema : createBenchmarkStudySchema;
  const parsed = schema.safeParse({ sampleIds: body?.sampleIds ?? body?.snapshotIds ?? body?.contentSnapshotIds });
  if (!parsed.success) return apiError("BENCHMARK_INVALID_SAMPLES", 400, creatorProfile ? "请选择 5–10 条不重复的代表内容。" : playbooks ? "请选择 3–10 条不重复的代表内容。" : "请选择 1–10 条不重复的代表内容。");
  try {
    const { id } = await params;
    const study = creatorProfile
      ? await createBenchmarkCreatorProfileStudy({ workspaceId: context.workspace.id, benchmarkAccountId: id, userId: context.session.user.id, sampleIds: parsed.data.sampleIds, collectionRunId: body?.collectionRunId as string | undefined })
      : playbooks
      ? await createBenchmarkPlaybookStudy({ workspaceId: context.workspace.id, benchmarkAccountId: id, userId: context.session.user.id, sampleIds: parsed.data.sampleIds, collectionRunId: body?.collectionRunId as string | undefined })
      : await createBenchmarkStudy({ workspaceId: context.workspace.id, benchmarkAccountId: id, userId: context.session.user.id, sampleIds: parsed.data.sampleIds, collectionRunId: body?.collectionRunId as string | undefined });
    return NextResponse.json(study, { status: 202 });
  } catch (error) {
    return studyApiError(error) ?? apiError("BENCHMARK_STUDY_CREATE_FAILED", 500, "账号研究暂时无法开始。");
  }
}
