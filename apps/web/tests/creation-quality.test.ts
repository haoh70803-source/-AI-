import { randomUUID } from "node:crypto";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { MockLLMProvider, type LLMGenerateInput } from "@content-center/providers";
import { IntegrationService } from "@content-center/integrations";
import { loadLLMRuntime, type LLMRuntime } from "../server/ai/llm-runtime";
import { runProjectAssistant } from "../server/assistant/service";
import { createTextArtifact, applyTextArtifactRevision, setArtifactLocked } from "../server/artifacts/service";
import { creationOptionsSchema } from "../lib/contracts/creation";
import { resolveCreationPolicy } from "../server/assistant/creation-policy";
import { qualityCases } from "./fixtures/creation-quality-cases";

it("records 60 scoped engineering samples and opt-in representative real generations", async () => {
  if (!process.env.DATABASE_URL?.includes("content_center_agent_test_12")) throw Error("ISOLATED_DATABASE_REQUIRED");
  const directory = resolve("output/v3-quality"); await mkdir(directory, { recursive: true });
  const userId = `quality-${randomUUID()}`; let workspaceId = "";
  let live: typeof db | undefined; let real: LLMRuntime | undefined;
  const results: Array<Record<string, unknown>> = [];
  vi.stubEnv("ASSISTANT_REQUESTS_PER_MINUTE", "1000");
  try {
    if (process.env.CREATION_V3_REAL === "1") {
      vi.stubEnv("EXTERNAL_CALLS_DISABLED", "false"); vi.stubEnv("SYSTEM_MANAGED_PROVIDERS", "false");
      const values = parseEnv(await readFile(resolve("output/account-upgrade-private/review.env"), "utf8"));
      const url = new URL(values.DATABASE_URL!);
      if (url.hostname !== "127.0.0.1" || url.port !== "55438" || url.pathname !== "/content_center_12_review") throw Error("READONLY_CONFIG_SCOPE_REQUIRED");
      const require = createRequire(resolve("packages/db/package.json"));
      const Client = require("@prisma/client").PrismaClient as new (options: { datasources: { db: { url: string } } }) => typeof db;
      live = new Client({ datasources: { db: { url: url.href } } });
      const configs = await live.integrationConfig.findMany({ where: { provider: "LLM", status: "CONFIGURED", workspace: { disabledAt: null } }, orderBy: { updatedAt: "desc" }, select: { workspaceId: true } });
      const integrations = new IntegrationService(live, () => values.INTEGRATION_ENCRYPTION_KEY);
      for (const config of configs) { const candidate = await loadLLMRuntime(config.workspaceId, integrations); if (candidate.providerName === "DEEPSEEK" && candidate.mode !== "MOCK" && candidate.mode !== "FIXTURE") { real = candidate; break; } }
      if (!real) throw Error("REAL_CONFIGURATION_UNAVAILABLE");
      vi.stubEnv("EXTERNAL_CALLS_DISABLED", "false"); vi.stubEnv("SYSTEM_MANAGED_PROVIDERS", "false");
    }
    await db.user.create({ data: { id: userId, name: "V3授权测试角色", email: userId + "@test.invalid" } });
    workspaceId = (await db.workspace.create({ data: { name: "V3隔离质量空间", slug: userId, members: { create: { userId, role: "OWNER" } } } })).id;
    for (const sample of qualityCases) {
      const observations: Array<Record<string, unknown>> = [];
      const selected = sample.real && (!process.env.CREATION_V3_FILTER || process.env.CREATION_V3_FILTER.split(",").includes(sample.id));
      for (const mode of real && selected ? ["MOCK", "REAL"] : ["MOCK"]) {
        const projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: `${sample.id}-${mode}` } })).id;
        const actor = { workspaceId, projectId, userId };
        const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, title: "授权合成测试资料", sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", rawText: sample.prompt, projects: { create: { projectId, role: "REFERENCE" } } } });
        let request: LLMGenerateInput | undefined; let rawOutput = ""; let usage: unknown = null; let finishReason: unknown = null;
        const mock = new MockLLMProvider(input => { const current = input.prompt.split("【员工当前问题】").at(-1) ?? ""; return current.includes("只改第二段") ? "第二段修改。" : current.includes("只改第三段") ? "第三段修改。" : sample.fixture; });
        const runtime: LLMRuntime = mode === "REAL" ? real! : { provider: mock, providerName: "MOCK", model: "fixed-fixture", mode: "MOCK" as const };
        const stream = runtime.provider.streamText.bind(runtime.provider);
        runtime.provider.streamText = async (input, options) => { request = input; const result = await stream(input, options); rawOutput = result.data.text; usage = result.data.usage; finishReason = result.data.finishReason; return result; };
        const calls: Array<Record<string, unknown>> = [];
        const invoke = async (content: string, targetArtifactId?: string) => {
          const start = Date.now(); request = undefined; usage = null; rawOutput = ""; finishReason = null;
          const message = await runProjectAssistant({ ...actor, content, ...(targetArtifactId ? { targetArtifactId } : {}), references: [{ sourceType: "MATERIAL", sourceId: source.id }], creationOptions: creationOptionsSchema.parse(sample.options ?? {}), signal: AbortSignal.timeout(120000) }, () => {}, { runtime });
          calls.push({ input: content, providerInput: request, rawOutput, output: message.content, tokenUsage: usage, elapsedMs: Date.now() - start, finishReason, status: message.status, warnings: message.warnings, messageId: message.id });
          return message;
        };
        let engineering = "PASS";
        try {
          const message = await invoke(sample.prompt);
          if (message.status !== "COMPLETED") engineering = "FAIL";
          if (mode === "MOCK") {
            expect(message.status).toBe("COMPLETED");
            const policy = resolveCreationPolicy(sample.prompt, creationOptionsSchema.parse(sample.options ?? {}));
            expect(request!.maxCompletionTokens).toBe(policy.maxCompletionTokens);
            expect(request!.prompt).toContain(sample.prompt);
            expect(request!.prompt).toContain("授权合成测试资料");
            expect(message.sources.some(item => item.reference?.sourceId === source.id)).toBe(true);
            if (sample.riskExpected) {
              expect(message.content).toContain("【需要确认】");
              const artifact = await createTextArtifact({ ...actor, title: "待核实草稿", sourceMessageId: message.id });
              await expect(setArtifactLocked({ ...actor, artifactId: artifact.artifactId, expectedVersion: artifact.version, locked: true })).rejects.toMatchObject({ code: "ARTIFACT_RESULT_NOT_APPLICABLE" });
            }
          }
          if (sample.turns && message.status === "COMPLETED") {
            const artifact = await createTextArtifact({ ...actor, title: "连续修改样本", sourceMessageId: message.id });
            let last = message;
            for (const turn of sample.turns) {
              const prior = last.content, scope = /第二段/u.test(turn) ? 1 : 2;
              last = await invoke(turn, artifact.artifactId);
              if (last.status !== "COMPLETED" || prior.split(/\n\s*\n/u).length < 3) { engineering = "FAIL"; break; }
              const before = prior.split(/\n\s*\n/u), after = last.content.split(/\n\s*\n/u);
              if (before.some((part, index) => index !== scope && part !== after[index])) engineering = "FAIL";
            }
            if (engineering === "PASS") { const saved = await applyTextArtifactRevision({ ...actor, artifactId: artifact.artifactId, expectedVersion: artifact.version, sourceMessageId: last.id }); expect(saved.content).toBe(last.content); }
          }
        } catch (error) { engineering = "FAIL"; calls.push({ error: error instanceof Error ? error.message : String(error) }); }
        finally { runtime.provider.streamText = stream; }
        observations.push({ mode, engineering, generationQuality: "NOT TESTED", factReview: "NOT TESTED", calls });
      }
      results.push({ ...sample, execution: observations.some(item => item.mode === "REAL") ? "REAL" : "MOCK", realStatus: real && selected ? "EXECUTED" : "NOT TESTED", observations });
      await writeFile(resolve(directory, !real ? "engineering.json" : process.env.CREATION_V3_FILTER ? "followup.json" : "samples.json"), JSON.stringify({ createdAt: new Date().toISOString(), sampleCount: qualityCases.length, provider: real?.providerName ?? null, model: real?.model ?? null, results, caveat: "Engineering checks are not human quality approval. Synthetic authorized facts only; no real business writes. Mock Token usage is synthetic, not cost." }, null, 2));
      console.log(`V3_SAMPLE ${sample.id} ${observations.map(item => `${item.mode}:${item.engineering}`).join(" ")}`);
    }
    expect(results).toHaveLength(60);
    expect(results.every(item => (item.observations as Array<{ mode: string; engineering: string }>).filter(row => row.mode === "MOCK").every(row => row.engineering === "PASS"))).toBe(true);
  } finally {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } }); await live?.$disconnect(); await db.$disconnect(); vi.unstubAllEnvs();
  }
}, 25 * 60_000);
