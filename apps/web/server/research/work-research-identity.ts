import { createHash } from "node:crypto";
import type { ResearchActor } from "./access";

export function workResearchSessionKey(actor: ResearchActor, accountId: string, workId: string) {
  const hex = createHash("sha256").update(`work-research:${actor.workspaceId}:${actor.userId}:${accountId}:${workId}`).digest("hex");
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-5${hex.slice(13, 16)}-a${hex.slice(17, 20)}-${hex.slice(20, 32)}`;
}
