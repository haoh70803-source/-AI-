import { createRequire } from "node:module";
import { readFile, mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { parseEnv } from "node:util";
import { expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { loadLLMRuntime, type LLMRuntime } from "../server/ai/llm-runtime";
import { assistantSystemPrompt } from "../server/assistant/prompt";
import { mergeLocalEdit, paragraphScope, resolveCreationPolicy } from "../server/assistant/creation-policy";
import { creationCases } from "./fixtures/creation-cases";

// Explicit opt-in; 8 paired cases, no evaluator model and no business writes.
it.skipIf(process.env.CREATION_REAL_EVAL !== "1")("records controlled before/after samples with the configured real provider", async () => {
  if (!process.env.DATABASE_URL?.includes("content_center_agent_test_12")) throw new Error("ISOLATED_DATABASE_REQUIRED");
  const values = parseEnv(await readFile(resolve("output/account-upgrade-private/review.env"), "utf8"));
  const target = new URL(values.DATABASE_URL!);
  if (target.hostname !== "127.0.0.1" || target.port !== "55438" || target.pathname !== "/content_center_12_review") throw new Error("READONLY_CONFIG_SCOPE_REQUIRED");
  const require = createRequire(resolve("packages/db/package.json"));
  const Client = require("@prisma/client").PrismaClient as new (options: { datasources: { db: { url: string } } }) => typeof db;
  const live = new Client({ datasources: { db: { url: target.href } } });
  vi.stubEnv("EXTERNAL_CALLS_DISABLED", "false"); vi.stubEnv("SYSTEM_MANAGED_PROVIDERS", "false");
  const before = (await readFile(new URL("./fixtures/creation-prompt-before.txt", import.meta.url), "utf8")).match(/`([\s\S]*)`;/u)![1]!;
  const result: Array<Record<string, unknown>> = [];
  const directory = resolve("output/creation-agent-quality"); await mkdir(directory, { recursive: true });
  let runtime: LLMRuntime | undefined;
  try {
    const integrations = new IntegrationService(live, () => values.INTEGRATION_ENCRYPTION_KEY);
    const configurations = await live.integrationConfig.findMany({ where: { provider: "LLM", status: "CONFIGURED", workspace: { disabledAt: null } }, orderBy: { updatedAt: "desc" }, select: { workspaceId: true } });
    for (const config of configurations) {
      const candidate = await loadLLMRuntime(config.workspaceId, integrations);
      if (candidate.providerName === "DEEPSEEK" && candidate.mode !== "MOCK" && candidate.mode !== "FIXTURE") { runtime = candidate; break; }
    }
    if (!runtime) throw new Error("REAL_CONFIGURATION_UNAVAILABLE");
    const selected = creationCases.filter(sample => !process.env.CREATION_EVAL_FILTER || process.env.CREATION_EVAL_FILTER.split(",").includes(sample.id));
    const variants = process.env.CREATION_EVAL_AFTER_ONLY === "1" ? ["after"] as const : ["before", "after"] as const;
    const expectedCalls = selected.length * variants.length;
    for (const sample of selected) {
      const policy = resolveCreationPolicy(sample.prompt);
      for (const variant of variants) {
        const original = sample.id === "local" ? sample.prompt.split("原稿：\n")[1]! : "";
        const scope = original ? paragraphScope(original, sample.prompt) : null;
        const localInstruction = variant === "after" && scope ? `\n只返回选中片段的新正文，不要标题或解释。选中原文：${JSON.stringify(original.slice(scope.start, scope.end))}` : "";
        const startedAt = Date.now();
        const response = await runtime.provider.streamText({ systemPrompt: variant === "before" ? before : assistantSystemPrompt, prompt: `${variant === "after" ? policy.instruction + "\n" : ""}【当前问题与已提供资料】\n${sample.prompt}${localInstruction}\n直接交付，不输出分析过程。`, maxCompletionTokens: variant === "before" ? 2000 : policy.maxCompletionTokens, ...(variant === "after" ? { temperature: policy.temperature } : {}) }, { signal: AbortSignal.timeout(120_000), onDelta: () => {} });
        const text = variant === "after" && scope ? mergeLocalEdit(original, scope, response.data.text) : response.data.text;
        result.push({ sample: sample.id, name: sample.name, variant, input: sample.prompt, output: text, rawOutput: response.data.text, elapsedMs: Date.now() - startedAt, model: response.data.model, usage: response.data.usage, finishReason: response.data.finishReason, outputCharacters: text.length, requiredMissing: sample.required.filter(term => !text.includes(term)), flaggedPhrases: sample.forbidden.filter(term => text.includes(term)), templatePhraseCount: (text.match(/赋能|保驾护航|在这个.{0,12}时代|让我们一起|不仅.{0,20}更是|综上所述/gu) ?? []).length });
        await writeFile(resolve(directory, process.env.CREATION_EVAL_FINAL === "1" ? "final.json" : process.env.CREATION_EVAL_AFTER_ONLY === "1" ? "followup.json" : "comparison.json"), JSON.stringify({ kind: "controlled_prompt_comparison", provider: runtime.providerName, model: runtime.model, expectedCalls, completedCalls: result.length, samples: result, limitation: "固定素材的真实模型配对试验；不是完整 UI 链路，也不是自然度或事实准确性的自动认证。" }, null, 2));
        console.log(`CREATION_EVAL ${sample.id} ${variant} chars=${text.length} finish=${response.data.finishReason} ms=${Date.now() - startedAt}`);
      }
    }
    expect(result).toHaveLength(expectedCalls);
    expect(result.every(item => item.finishReason !== "length")).toBe(true);
  } finally { await live.$disconnect(); await db.$disconnect(); vi.unstubAllEnvs(); }
}, 20 * 60_000);
