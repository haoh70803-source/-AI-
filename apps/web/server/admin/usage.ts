import "server-only";

import { db } from "@content-center/db";
import { successfulTranscriptionDurationMs } from "../../lib/transcription-usage";

export type UsageRange = "today" | "7d" | "month";

function rangeStart(range: UsageRange, now = new Date()) {
  if (range === "7d") return new Date(now.getTime() - 7 * 24 * 60 * 60 * 1_000);
  if (range === "month") return new Date(now.getFullYear(), now.getMonth(), 1);
  return new Date(now.getFullYear(), now.getMonth(), now.getDate());
}

export async function getAdminUsage(range: UsageRange, selectedUserId?: string) {
  const since = rangeStart(range);
  const users = await db.user.findMany({
    where: selectedUserId ? { id: selectedUserId } : undefined,
    select: {
      id: true,
      name: true,
      email: true,
      createdAt: true,
      workspaceMemberships: { take: 1, orderBy: { createdAt: "asc" }, select: { workspace: { select: { id: true, name: true } } } },
      sessions: { take: 1, orderBy: { updatedAt: "desc" }, select: { updatedAt: true } },
    },
    orderBy: { createdAt: "asc" },
  });
  const userIds = users.map((user) => user.id);
  const [usage, materialCounts, projectCounts] = await Promise.all([
    db.apiUsage.findMany({ where: { userId: { in: userIds }, createdAt: { gte: since } }, orderBy: { createdAt: "desc" } }),
    db.sourceItem.groupBy({ by: ["createdById"], where: { createdById: { in: userIds }, createdAt: { gte: since } }, _count: { _all: true } }),
    db.contentProject.groupBy({ by: ["createdById"], where: { createdById: { in: userIds }, createdAt: { gte: since } }, _count: { _all: true } }),
  ]);
  return users.map((user) => {
    const rows = usage.filter((row) => row.userId === user.id);
    const ai = rows.filter((row) => ["KIMI", "DEEPSEEK", "LLM", "MOCK", "FIXTURE", "fixture-openai-compatible"].includes(row.provider));
    const redfox = rows.filter((row) => row.provider === "REDFOX");
    const asr = rows.filter((row) => row.provider === "DOUBAO_ASR" || row.provider === "LOCAL_FUNASR");
    const workspace = user.workspaceMemberships[0]?.workspace ?? null;
    return {
      id: user.id,
      name: user.name,
      email: user.email,
      workspace,
      aiCalls: ai.length,
      aiInputTokens: ai.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0),
      aiOutputTokens: ai.reduce((sum, row) => sum + (row.outputTokens ?? 0), 0),
      kimiInputTokens: ai.reduce((sum, row) => sum + (row.inputTokens ?? 0), 0),
      kimiOutputTokens: ai.reduce((sum, row) => sum + (row.outputTokens ?? 0), 0),
      redfoxCalls: redfox.length,
      redfoxSuccess: redfox.filter((row) => row.success).length,
      redfoxFailed: redfox.filter((row) => !row.success).length,
      transcriptionMinutes: Math.round(successfulTranscriptionDurationMs(asr) / 60_000 * 10) / 10,
      doubaoMinutes: Math.round(successfulTranscriptionDurationMs(asr.filter((row) => row.provider === "DOUBAO_ASR")) / 60_000 * 10) / 10,
      localFunAsrMinutes: Math.round(successfulTranscriptionDurationMs(asr.filter((row) => row.provider === "LOCAL_FUNASR")) / 60_000 * 10) / 10,
      asrFailed: asr.filter((row) => !row.success).length,
      materialCount: materialCounts.find((item) => item.createdById === user.id)?._count._all ?? 0,
      projectCount: projectCounts.find((item) => item.createdById === user.id)?._count._all ?? 0,
      operations: Object.fromEntries([...new Set(ai.map((row) => row.operation))].map((operation) => [operation, ai.filter((row) => row.operation === operation).length])),
      recentActivity: rows[0]?.createdAt.toISOString() ?? user.sessions[0]?.updatedAt.toISOString() ?? null,
    };
  });
}
