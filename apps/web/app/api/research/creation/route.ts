import { z } from "zod";
import { db } from "@content-center/db";
import { researchApiActor, researchApiError } from "@/server/research/api";
import { getResearchResult, getSelectedResearch, researchCreationTarget, researchProjectOptions } from "@/server/research/read-model";
import { getLegacyResearchResult } from "@/server/research/legacy";
import { buildResearchSharePreview } from "@/server/research/sharing";
import { getArtifactForUser } from "@/server/artifacts/service";
import { researchSelectionSchema } from "@/server/research/contracts";
const input = z.object({ mode: z.enum(["create", "preview"]).default("create"), projectId: z.string().min(1).max(200), resultId: z.string().min(1).max(200), selection: researchSelectionSchema, content: z.string().trim().min(1).max(4000).optional() }).strict();
export async function GET(request: Request) {
  try {
    const actor = await researchApiActor(), params = new URL(request.url).searchParams, resultId = params.get("resultId");
    if (!resultId) return Response.json(await researchCreationTarget(actor, params.get("projectId") || ""), { headers: { "cache-control": "no-store" } });
    const kind = params.get("kind") === "study" ? "study" : "run";
    const [result, projects] = await Promise.all([kind === "run" ? getResearchResult(actor, resultId, { includeUnsaved: true }) : getLegacyResearchResult(actor, resultId), researchProjectOptions(actor)]);
    return Response.json({ actor, kind, version: result.version, title: "question" in result ? result.resultTitle || result.question : result.title, blocks: result.blocks, saved: "savedAt" in result ? Boolean(result.savedAt) : true, sessionId: "sessionId" in result ? result.sessionId : null, projects }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return researchApiError(error); }
}
export async function POST(request: Request) {
  try {
    const value = input.parse(await request.json()), actor = await researchApiActor();
    const [target, result] = await Promise.all([researchCreationTarget(actor, value.projectId, { requireOwnThread: value.mode === "create" }), getSelectedResearch(actor, value.selection.kind, value.resultId, value.selection)]);
    if (value.mode === "preview") {
      const existing = await db.artifact.findFirst({ where: { workspaceId: actor.workspaceId, projectId: value.projectId, ...(value.selection.kind === "run" ? { sourceResearchRunId: value.resultId } : { sourceBenchmarkStudyId: value.resultId }) }, select: { id: true } });
      if (existing) { const artifact = await getArtifactForUser({ ...actor, projectId: value.projectId, artifactId: existing.id }); return Response.json({ ...target, preview: { body: artifact.content }, existingArtifact: artifact, selection: result.selection }, { headers: { "cache-control": "no-store" } }); }
      return Response.json({ ...target, preview: buildResearchSharePreview(result.title, result.blocks, { explicitSelection: true }), selection: result.selection }, { headers: { "cache-control": "no-store" } });
    }
    if (!value.content) return Response.json({ message: "请写下本次创作意图。" }, { status: 400 });
    return Response.json({ ...target, id: crypto.randomUUID(), expiresAt: Date.now() + 30 * 60 * 1000, content: value.content, reference: { sourceType: "RESEARCH", sourceId: value.resultId, title: result.title, href: "/research/results/" + value.selection.kind + "/" + value.resultId, generated: true, version: result.version, description: "本次挑选的研究结论 · 原研究未修改", researchSelection: result.selection } }, { headers: { "cache-control": "no-store" } });
  } catch (error) { return researchApiError(error); }
}
