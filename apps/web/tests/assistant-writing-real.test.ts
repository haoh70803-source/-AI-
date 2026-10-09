import { randomUUID, createHash } from "node:crypto";
import { readFile, writeFile } from "node:fs/promises";
import { parseEnv } from "node:util";
import { createRequire } from "node:module";
import { resolve } from "node:path";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { loadLLMRuntime, type LLMRuntime } from "../server/ai/llm-runtime";
import { runProjectAssistant } from "../server/assistant/service";

// Paid calls require an explicit opt-in. Business configuration is read-only; all fixtures are isolated.
it.skipIf(process.env.ASSISTANT_REAL_EVAL !== "1")("evaluates the user's multi-turn writing case using real DeepSeek", async () => {
  if (!process.env.DATABASE_URL?.includes("content_center_agent_test")) throw Error("ISOLATED_AGENT_DATABASE_REQUIRED");
  const values = parseEnv(await readFile(resolve("output/account-upgrade-private/review.env"), "utf8"));
  const target = new URL(values.DATABASE_URL!);
  if (target.hostname !== "127.0.0.1" || target.port !== "55438" || target.pathname !== "/content_center_12_review") throw Error("READONLY_LIVE_CONFIG_SCOPE_MISMATCH");
  const require = createRequire(resolve("packages/db/package.json"));
  const Client = require("@prisma/client").PrismaClient as new (options: { datasources: { db: { url: string } } }) => typeof db;
  const live = new Client({ datasources: { db: { url: target.href } } });
  const userId = `writing-eval-${randomUUID()}`;
  let workspaceId = "";
  vi.stubEnv("SYSTEM_MANAGED_PROVIDERS", "false"); vi.stubEnv("EXTERNAL_CALLS_DISABLED", "false");
  try {
    const integrations = new IntegrationService(live, () => values.INTEGRATION_ENCRYPTION_KEY);
    const rows = await live.integrationConfig.findMany({ where: { provider: "LLM", status: "CONFIGURED", workspace: { disabledAt: null } }, orderBy: { updatedAt: "desc" }, select: { workspaceId: true } });
    let runtime: LLMRuntime | undefined;
    for (const row of rows) {
      const candidate = await loadLLMRuntime(row.workspaceId, integrations);
      if (candidate.providerName === "DEEPSEEK" && candidate.mode !== "MOCK" && candidate.mode !== "FIXTURE") { runtime = candidate; break; }
    }
    if (!runtime) throw Error("REAL_DEEPSEEK_CONFIGURATION_UNAVAILABLE");
    const usage: unknown[] = [];
    const stream = runtime.provider.streamText.bind(runtime.provider);
    runtime.provider.streamText = async (input, options) => { const result = await stream(input, options); usage.push({ usage: result.data.usage, finishReason: result.data.finishReason }); return result; };
    await db.user.create({ data: { id: userId, email: `${userId}@test.invalid`, name: "Writing fixture" } });
    workspaceId = (await db.workspace.create({ data: { name: "Writing fixture", slug: userId, members: { create: { userId, role: "OWNER" } } } })).id;
    const projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "日常朋友圈写作验收" } })).id;
    const actor = { workspaceId, projectId, userId };
    const startedAt = Date.now();
    const first = await runProjectAssistant({ ...actor, content: "帮我把一件日常小事写成朋友圈文案。根据我真实提供的场景和感受，给一个50字以内的简短版，以及一个约120字的叙事版，再给一个配图建议。像自然聊天，不堆金句、不强行升华、不硬加营销。没有真实经历时先问发生了什么，不替我编故事。" }, () => {}, { runtime });
    const second = await runProjectAssistant({ ...actor, content: "煮泡面发现鸡蛋没了，就这么清汤寡水吃完了，居然还挺满足" }, () => {}, { runtime });
    await writeFile(resolve(".local-data/agent-writing-real-eval.json"), JSON.stringify({ provider: runtime.providerName, model: runtime.model, requestedModel: runtime.requestedModel, elapsedMs: Date.now() - startedAt, calls: usage, first: { status: first.status, content: first.content }, second: { status: second.status, content: second.content } }, null, 2));
    expect(first.status).toBe("COMPLETED"); expect(second.status).toBe("COMPLETED");
    expect(second.content).toMatch(/简短|50字/u); expect(second.content).toMatch(/叙事|120字/u); expect(second.content).toContain("配图");
    const body = second.content.split(/(?:\*\*|#{1,6}\s*)?配图/u)[0]!;
    expect(body).toContain("满足"); expect(body).not.toMatch(/晚上|没再出门|卧个蛋|汤.{0,3}(?:见|到|了)底|没抱.{0,4}期望|没那么讲究|加.{0,3}醋|没多好吃|没什么味道|心里.{0,4}(?:定|踏实)|只好|想加个蛋|翻了|端上桌|放下碗/u);
    expect(body.match(/满足/gu)?.length ?? 0).toBeLessThanOrEqual(3);
    expect(body).not.toContain("今天记一笔");
  } finally {
    if (workspaceId) {
      await db.verification.deleteMany({ where: { id: "auth-rate:" + createHash("sha256").update(`assistant:${workspaceId}:${userId}`).digest("hex") } });
      await db.workspace.delete({ where: { id: workspaceId } });
    }
    await db.user.deleteMany({ where: { id: userId } }); await live.$disconnect(); await db.$disconnect(); vi.unstubAllEnvs();
  }
}, 240_000);
