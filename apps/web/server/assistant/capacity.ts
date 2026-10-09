import "server-only";
import type { Prisma } from "@content-center/db";
import { authRateLimitStorage } from "../auth-rate-limit";
import { AIControlError } from "../ai/control/contracts";

export function assistantLimit(name: string, fallback: number) {
  const value = Number(process.env[name]);
  return Number.isSafeInteger(value) && value > 0 && value <= 10_000 ? value : fallback;
}

export async function consumeAssistantRequest(workspaceId: string, userId: string) {
  const state = await authRateLimitStorage.consume(`assistant:${workspaceId}:${userId}`, { window: 60, max: assistantLimit("ASSISTANT_REQUESTS_PER_MINUTE", 20) });
  if (!state.allowed) throw new AIControlError("RATE_LIMITED", `请求较频繁，请在 ${state.retryAfter} 秒后重试。`, true);
}

/** Short DB admission lock works across instances, including during Redis outages. */
export async function assertAssistantCapacity(tx: Prisma.TransactionClient, input: { workspaceId: string; userId: string }, now = new Date()) {
  await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtext('assistant-capacity:global'))`;
  const active = { status: { in: ["PENDING", "STREAMING"] as Array<"PENDING" | "STREAMING"> }, updatedAt: { gte: new Date(now.getTime() - 10 * 60_000) } };
  const global = await tx.assistantMessage.count({ where: active });
  if (global >= assistantLimit("ASSISTANT_GLOBAL_CONCURRENCY", 32)) throw new AIControlError("RATE_LIMITED", "当前生成任务较多，请稍后重试；你的输入没有被提交。", true);
  const workspace = await tx.assistantMessage.count({ where: { ...active, thread: { workspaceId: input.workspaceId } } });
  if (workspace >= assistantLimit("ASSISTANT_WORKSPACE_CONCURRENCY", 8)) throw new AIControlError("RATE_LIMITED", "当前工作空间的生成任务较多，请稍后重试。", true);
  const user = await tx.assistantMessage.count({ where: { ...active, thread: { workspaceId: input.workspaceId, createdById: input.userId } } });
  if (user >= assistantLimit("ASSISTANT_USER_CONCURRENCY", 2)) throw new AIControlError("RATE_LIMITED", "你已有多个生成任务，请先完成或停止后再试。", true);
}
