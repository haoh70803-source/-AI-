import "server-only";
import { z } from "zod";
import { db } from "@content-center/db";
import { ResearchError, researchMember, type ResearchActor } from "./access";
import { accountResearchSessionKey } from "./account-research-service";
import { ACCOUNT_V2_QUESTION } from "./account-v2-run";
import { parseAccountV2State } from "./account-v2-contract";
import { createResearchSession, reserveResearchRun, researchRunExpired } from "./service";

const requestSchema = z.object({ requestKey: z.string().uuid(), collectionRunId: z.string().min(1).max(200).optional(),
  from: z.string().date().optional(), to: z.string().date().optional(), force: z.boolean().optional() }).strict()
  .refine(value => !value.from || !value.to || value.from <= value.to, "Invalid range");

export async function startAccountV2Research(actor: ResearchActor, accountId: string, value: unknown) {
  await researchMember(actor, true);
  const input = requestSchema.parse(value);
  const account = await db.benchmarkAccount.findFirst({ where: { id: accountId, workspaceId: actor.workspaceId, enabled: true }, select: { id: true, name: true } });
  if (!account) throw new ResearchError("NOT_FOUND", "账号不存在或不可访问。", 404);
  const key = accountResearchSessionKey(actor, accountId);
  const existing = await db.researchSession.findUnique({ where: { workspaceId_createdById_requestKey: { workspaceId: actor.workspaceId, createdById: actor.userId, requestKey: key } } });
  const session = existing ?? await createResearchSession(actor, { title: `${account.name} · 持续研究`.slice(0, 200), entryTemplate: "BENCHMARK", requestKey: key });
  const reserved = await reserveResearchRun(actor, session.id, { question: ACCOUNT_V2_QUESTION, requestKey: input.requestKey, scope: {
    materialIds: [], benchmarkAccountIds: [accountId], trendKeys: [], notes: "", useOwnArtifacts: false, useCreatorProfile: false,
    researchProfile: "ACCOUNT_V2", forceReanalysis: Boolean(input.force),
    ...(input.collectionRunId ? { benchmarkCollectionRunId: input.collectionRunId } : {}),
    ...(input.from || input.to ? { researchDateRange: { from: input.from, to: input.to } } : {}),
  } });
  return { sessionId: session.id, runId: reserved.run.id, version: reserved.run.version,
    status: researchRunExpired(reserved.run) ? "FAILED" : reserved.run.status, created: reserved.created, unchanged: reserved.unchanged };
}

export async function accountV2Overview(actor: ResearchActor, accountId: string) {
  await researchMember(actor);
  const session = await db.researchSession.findUnique({ where: { workspaceId_createdById_requestKey: {
    workspaceId: actor.workspaceId, createdById: actor.userId, requestKey: accountResearchSessionKey(actor, accountId) } }, select: { id: true } });
  const runs = session ? await db.researchRun.findMany({ where: { sessionId: session.id, workspaceId: actor.workspaceId, requestedById: actor.userId },
    orderBy: { version: "desc" }, take: 40,
    select: { id: true, sessionId: true, version: true, status: true, stage: true, createdAt: true, startedAt: true, aiRunId: true, finishedAt: true,
      savedAt: true, coverage: true, errorMessage: true } }) : [];
  const latest = runs.find(run => run.status === "COMPLETED" && parseAccountV2State(run.coverage)?.answer) ?? null;
  const state = latest ? parseAccountV2State(latest.coverage) : null;
  const active = runs.find(run => ["QUEUED", "RUNNING"].includes(run.status) && parseAccountV2State(run.coverage) && !researchRunExpired(run)) ?? null;
  const failed = runs.find(run => run.status === "FAILED" && parseAccountV2State(run.coverage));
  return { latest: latest ? { id: latest.id, sessionId: latest.sessionId, version: latest.version, saved: Boolean(latest.savedAt),
    at: (latest.finishedAt ?? latest.createdAt).toISOString(), state: state! } : null,
    active: active ? { id: active.id, sessionId: active.sessionId, stage: active.stage } : null,
    failure: failed && (!latest || failed.version > latest.version) ? failed.errorMessage : null,
    history: runs.filter(run => run.status === "COMPLETED" && parseAccountV2State(run.coverage)?.answer).map(run => ({
      id: run.id, sessionId: run.sessionId, version: run.version, saved: Boolean(run.savedAt), at: (run.finishedAt ?? run.createdAt).toISOString() })) };
}
