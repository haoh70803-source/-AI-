import "server-only";
import { createHash } from "node:crypto";
import { z } from "zod";
import { db } from "@content-center/db";
import { ResearchError, researchMember, type ResearchActor } from "./access";
import { createResearchSession, reserveResearchRun, researchRunExpired } from "./service";
import { TOPIC_V2_QUESTION } from "./topic-opportunity-v2-run";
import { parseTopicOpportunityV2State } from "./topic-opportunity-v2-contract";
import { parseTrendStableKey } from "./trends";
import { workCreationChoices } from "./work-research-service";

const requestSchema = z.object({ requestKey: z.string().uuid(), projectId: z.string().min(1).max(200),
  materialIds: z.array(z.string().min(1).max(200)).min(1).max(8), force: z.boolean().optional() }).strict();
function sessionKey(actor: ResearchActor, stableKey: string, projectId: string) {
  const hex = createHash("sha256").update(`topic-opportunity-v2:${actor.workspaceId}:${actor.userId}:${stableKey}:${projectId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
export async function startTopicOpportunityV2(actor: ResearchActor, stableKey: string, value: unknown) {
  await researchMember(actor, true); parseTrendStableKey(stableKey);
  const input = requestSchema.parse(value);
  const project = await db.contentProject.findFirst({ where: { id: input.projectId, workspaceId: actor.workspaceId, status: { not: "ARCHIVED" } }, select: { id: true } });
  if (!project) throw new ResearchError("PROJECT_NOT_FOUND", "项目不存在或不可访问。", 404);
  const key = sessionKey(actor, stableKey, input.projectId);
  const existing = await db.researchSession.findUnique({ where: { workspaceId_createdById_requestKey: {
    workspaceId: actor.workspaceId, createdById: actor.userId, requestKey: key } } });
  const session = existing ?? await createResearchSession(actor, { title: "趋势选题机会", entryTemplate: "OPPORTUNITY", projectId: input.projectId, requestKey: key });
  const reserved = await reserveResearchRun(actor, session.id, { question: TOPIC_V2_QUESTION, requestKey: input.requestKey, scope: {
    materialIds: input.materialIds, benchmarkAccountIds: [], trendKeys: [stableKey], notes: "", useOwnArtifacts: false,
    useCreatorProfile: false, researchProfile: "TOPIC_OPPORTUNITY_V2", forceReanalysis: Boolean(input.force),
  } });
  return { sessionId: session.id, runId: reserved.run.id, version: reserved.run.version,
    status: researchRunExpired(reserved.run) ? "FAILED" : reserved.run.status, created: reserved.created, unchanged: reserved.unchanged };
}

export async function topicOpportunityV2View(actor: ResearchActor, stableKey: string) {
  await researchMember(actor); parseTrendStableKey(stableKey);
  const rows = await db.researchRun.findMany({ where: { workspaceId: actor.workspaceId, requestedById: actor.userId,
    inputScope: { path: ["trendKeys"], array_contains: [stableKey] }, session: { workspaceId: actor.workspaceId, createdById: actor.userId, entryTemplate: "OPPORTUNITY" } },
    orderBy: { createdAt: "desc" }, take: 30,
    select: { id: true, sessionId: true, version: true, status: true, stage: true, createdAt: true, startedAt: true, aiRunId: true, finishedAt: true,
      savedAt: true, errorMessage: true, coverage: true } });
  const latest = rows.find(row => row.status === "COMPLETED" && parseTopicOpportunityV2State(row.coverage)?.answer);
  const active = rows.find(row => ["QUEUED", "RUNNING"].includes(row.status) && parseTopicOpportunityV2State(row.coverage) && !researchRunExpired(row));
  const failure = rows.find(row => row.status === "FAILED" && parseTopicOpportunityV2State(row.coverage));
  return { choices: await workCreationChoices(actor),
    latest: latest ? { id: latest.id, sessionId: latest.sessionId, version: latest.version, saved: Boolean(latest.savedAt),
      at: (latest.finishedAt ?? latest.createdAt).toISOString(), state: parseTopicOpportunityV2State(latest.coverage)! } : null,
    active: active ? { id: active.id, sessionId: active.sessionId } : null,
    failure: failure && (!latest || failure.createdAt > latest.createdAt) ? failure.errorMessage : null };
}
