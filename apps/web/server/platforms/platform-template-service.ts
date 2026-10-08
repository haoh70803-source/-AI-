import "server-only";

import { db } from "@content-center/db";
import type { SupportedPlatform } from "../../lib/platforms";

export async function selectPlatformTemplate(workspaceId: string, platform: SupportedPlatform) {
  const workspace = await db.platformTemplate.findFirst({ where: { workspaceId, platform, isActive: true }, orderBy: { version: "desc" } });
  if (workspace) return workspace;
  return db.platformTemplate.findFirstOrThrow({ where: { workspaceId: null, platform, isActive: true }, orderBy: { version: "desc" } });
}
