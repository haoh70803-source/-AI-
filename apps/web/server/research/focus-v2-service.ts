import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@content-center/db";
import { ResearchError, researchMember, type ResearchActor } from "./access";
import { createResearchSession, reserveResearchRun, researchRunExpired } from "./service";
import { parseFocusV2State } from "./focus-v2-contract";
import { parseWorkResearchState } from "./work-research-contract";

const requestSchema = z.object({ requestKey: z.string().uuid(), question: z.string().trim().min(2).max(1000),
  accountIds: z.array(z.string().min(1).max(200)).min(1).max(3), workIds: z.array(z.string().min(1).max(200)).max(30).optional(),
  force: z.boolean().optional() }).strict();
function sessionKey(actor: ResearchActor, accountIds: string[], question: string) {
  const hex = createHash("sha256").update(`focus-research-v2:${actor.workspaceId}:${actor.userId}:${[...accountIds].sort().join(":")}:${question}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export async function startFocusV2Research(actor: ResearchActor, value: unknown) {
  await researchMember(actor, true);
  const input = requestSchema.parse(value); const accountIds = [...new Set(input.accountIds)].sort();
  const accounts = await db.benchmarkAccount.findMany({ where: { workspaceId: actor.workspaceId, enabled: true, id: { in: accountIds } }, select: { id: true } });
  if (accounts.length !== accountIds.length) throw new ResearchError("BENCHMARK_NOT_FOUND", "所选账号不存在或不可访问。", 404);
  const key = sessionKey(actor, accountIds, input.question);
  const existing = await db.researchSession.findUnique({ where: { workspaceId_createdById_requestKey: {
    workspaceId: actor.workspaceId, createdById: actor.userId, requestKey: key } } });
  const session = existing ?? await createResearchSession(actor, { title: input.question.slice(0, 200), entryTemplate: "BENCHMARK", requestKey: key });
  const reserved = await reserveResearchRun(actor, session.id, { question: input.question, requestKey: input.requestKey, scope: {
    materialIds: [], benchmarkAccountIds: accountIds, trendKeys: [], notes: "", useOwnArtifacts: false,
    useCreatorProfile: false, researchProfile: "FOCUS_V2", ...(input.workIds?.length ? { focusWorkIds: [...new Set(input.workIds)] } : {}),
    forceReanalysis: Boolean(input.force),
  } });
  return { sessionId: session.id, runId: reserved.run.id, version: reserved.run.version,
    status: researchRunExpired(reserved.run) ? "FAILED" : reserved.run.status, created: reserved.created, unchanged: reserved.unchanged };
}
export async function focusV2Library(actor: ResearchActor) {
  await researchMember(actor);
  const [accounts, rows, workRuns] = await Promise.all([
    db.benchmarkAccount.findMany({ where: { workspaceId: actor.workspaceId, enabled: true }, select: { id: true, name: true, platform: true },
      orderBy: { updatedAt: "desc" }, take: 100 }),
    db.researchRun.findMany({ where: { workspaceId: actor.workspaceId, requestedById: actor.userId,
      inputScope: { path: ["researchProfile"], equals: "FOCUS_V2" }, session: { workspaceId: actor.workspaceId, createdById: actor.userId } },
      orderBy: { createdAt: "desc" }, take: 50,
      select: { id: true, sessionId: true, version: true, status: true, stage: true, question: true, createdAt: true, finishedAt: true,
        savedAt: true, errorMessage: true, coverage: true } }),
    db.researchRun.findMany({ where: { workspaceId: actor.workspaceId, requestedById: actor.userId, status: "COMPLETED",
      inputScope: { path: ["researchProfile"], equals: "WORK_DEEP" } }, orderBy: { finishedAt: "desc" }, take: 200,
      select: { coverage: true } }),
  ]);
  const studies = rows.flatMap(row => {
    const state = parseFocusV2State(row.coverage); if (!state) return [];
    return [{ id: row.id, sessionId: row.sessionId, version: row.version, question: row.question, status: row.status,
      stage: row.stage, at: (row.finishedAt ?? row.createdAt).toISOString(), saved: Boolean(row.savedAt),
      accountNames: state.accounts.map(item => item.name), directAnswer: state.answer?.directAnswer ?? null,
      errorMessage: row.errorMessage }];
  });
  const works = [...new Map(workRuns.flatMap(run => {
    const state = parseWorkResearchState(run.coverage);
    return state?.schemaVersion === "work-research-v2" && state.answer ? [[state.evidence.workId, {
      id: state.evidence.workId, accountId: state.evidence.accountId, title: state.evidence.title,
      oneLine: state.answer.decision.executiveSummary.oneLine }]] as const : [];
  })).values()];
  return { accounts, works, studies };
}

export async function focusV2RunView(actor: ResearchActor, runId: string) {
  await researchMember(actor);
  const run = await db.researchRun.findFirst({ where: { id: runId, workspaceId: actor.workspaceId, requestedById: actor.userId,
    status: "COMPLETED", session: { workspaceId: actor.workspaceId, createdById: actor.userId, entryTemplate: "BENCHMARK" } },
    select: { id: true, sessionId: true, version: true, savedAt: true, finishedAt: true, createdAt: true, coverage: true } });
  const state = parseFocusV2State(run?.coverage);
  if (!run || !state?.answer) throw new ResearchError("NOT_FOUND", "专项研究版本不存在或不可访问。", 404);
  return { id: run.id, sessionId: run.sessionId, version: run.version, saved: Boolean(run.savedAt),
    at: (run.finishedAt ?? run.createdAt).toISOString(), state };
}
