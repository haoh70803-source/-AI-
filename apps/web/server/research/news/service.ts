import "server-only";
import { db } from "@content-center/db";
import type { ResearchActor } from "../access";
import { ResearchError } from "../access";
import { requireNewsActor } from "./access";
import { newsRuntime } from "./runtime";
import { z } from "zod";
export async function newsReadModel(actor: ResearchActor) {
  await requireNewsActor(actor);
  const runtime = newsRuntime();
  const [state, paused, preferences] = await Promise.all([runtime.store.read(), runtime.store.paused(),
    db.researchObjectPreference.findMany({ where: { workspaceId: actor.workspaceId, userId: actor.userId, kind: { in: ["NEWS", "NEWS_LATER"] } }, select: { kind: true, objectKey: true, followedAt: true, viewedAt: true } })]);
  return { items: Object.values(state.items), removed: state.removed, dailies: state.dailies, reports: state.reports,
    status: { paused, enabled: process.env.AIHOT_PUBLIC_NEWS_ENABLED === "true", lastSuccess: state.lastSuccess, lastAttempt: state.lastAttempt, nextAttempt: state.nextAttempt, error: state.error },
    preferences: preferences.map(row => ({ kind: row.kind, id: row.objectKey, followed: !!row.followedAt, read: !!row.viewedAt })) };
}
export async function newsAction(actor: ResearchActor, value: unknown) {
  await requireNewsActor(actor);
  const input = z.discriminatedUnion("action", [
    z.object({ action: z.literal("PAUSE"), paused: z.boolean() }).strict(),
    z.object({ action: z.literal("SYNC") }).strict(),
    z.object({ action: z.literal("DAILY"), date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/) }).strict(),
  ]).parse(value);
  const runtime = newsRuntime();
  if (input.action === "PAUSE") await runtime.store.setPaused(input.paused);
  else if (input.action === "DAILY") return { report: await runtime.sync.daily(input.date) };
  else {
    if (process.env.AIHOT_PUBLIC_NEWS_ENABLED !== "true") throw new ResearchError("NEWS_DISABLED", "资讯同步尚未启用。", 409);
    await runtime.sync.run();
  }
  return newsReadModel(actor);
}
