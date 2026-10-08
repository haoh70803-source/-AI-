import { randomBytes, randomUUID } from "node:crypto";
import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { getWorkspaceIntegrationConfig } from "./integrations";

describe("worker integration credential access", () => {
  const runId = randomUUID();
  const userId = `worker-integration-${runId}`;
  const secret = `worker-fake-secret-${runId}`;
  const originalKey = process.env.INTEGRATION_ENCRYPTION_KEY;
  let workspaceId = "";

  beforeAll(async () => {
    process.env.INTEGRATION_ENCRYPTION_KEY = randomBytes(32).toString("base64");
    await db.user.create({ data: { id: userId, name: "Worker Integration", email: `${userId}@example.test` } });
    const workspace = await db.workspace.create({
      data: {
        name: "Worker Integration",
        slug: `worker-integration-${runId}`,
        members: { create: { userId, role: "OWNER" } },
      },
    });
    workspaceId = workspace.id;
    await new IntegrationService().saveIntegrationConfig({
      workspaceId,
      userId,
      provider: "REDFOX",
      config: { baseUrl: "https://example.invalid", apiKey: secret },
    });
  });

  afterAll(async () => {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } });
    if (originalKey === undefined) delete process.env.INTEGRATION_ENCRYPTION_KEY;
    else process.env.INTEGRATION_ENCRYPTION_KEY = originalKey;
    await db.$disconnect();
  });

  it("loads the current Workspace credential through IntegrationService", async () => {
    await expect(getWorkspaceIntegrationConfig(workspaceId, "REDFOX")).resolves.toEqual({
      baseUrl: "https://example.invalid",
      apiKey: secret,
    });
  });
});
