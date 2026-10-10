import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import { parseEnv } from "node:util";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { db, type Prisma } from "@content-center/db";
import { getStorageProvider } from "@content-center/providers";
import { IntegrationService } from "@content-center/integrations";
import { auth } from "../lib/auth";

test("REAL authorized upload → project → optional Skill → writing → edit → save → reopen → restore → export", async ({ page, context }) => {
  const userId = `v3-browser-${randomUUID()}`, output = path.resolve("output/v3-quality");
  await mkdir(output, { recursive: true }); let workspaceId = ""; const records: unknown[] = [];
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  const values = parseEnv(await readFile(path.resolve("output/account-upgrade-private/review.env"), "utf8"));
  const target = new URL(values.DATABASE_URL!);
  if (target.hostname !== "127.0.0.1" || target.port !== "55438" || target.pathname !== "/content_center_12_review") throw Error("READONLY_CONFIG_SCOPE_REQUIRED");
  const require = createRequire(path.resolve("packages/db/package.json"));
  const Client = require("@prisma/client").PrismaClient as new (options: { datasources: { db: { url: string } } }) => typeof db;
  const live = new Client({ datasources: { db: { url: target.href } } });
  try {
    await db.user.create({ data: { id: userId, name: "首次使用的教培运营", email: userId + "@test.invalid" } });
    workspaceId = (await db.workspace.create({ data: { name: "V3浏览器授权隔离", slug: userId, members: { create: { userId, role: "OWNER" } } } })).id;
    const integration = new IntegrationService(live, () => values.INTEGRATION_ENCRYPTION_KEY);
    const configs = await live.integrationConfig.findMany({ where: { provider: "LLM", status: "CONFIGURED", workspace: { disabledAt: null } }, orderBy: { updatedAt: "desc" } });
    let configured = false;
    for (const config of configs) {
      const modelConfig = await integration.getDecryptedIntegrationConfig(config.workspaceId, "LLM");
      if (!modelConfig || String(modelConfig.provider).toUpperCase() !== "DEEPSEEK" || modelConfig.mode === "MOCK" || modelConfig.mode === "FIXTURE") continue;
      // Opaque encrypted credential is copied only into this ephemeral isolated workspace, never logged/exported.
      await db.integrationConfig.create({ data: { workspaceId, provider: "LLM", status: config.status, configured: config.configured, publicConfig: config.publicConfig as Prisma.InputJsonValue, encryptedConfig: config.encryptedConfig, encryptionKeyVersion: config.encryptionKeyVersion } });
      configured = true; break;
    }
    expect(configured).toBe(true);
    const session = await db.session.create({ data: { userId, token: randomUUID() + randomUUID(), activeWorkspaceId: workspaceId, expiresAt: new Date(Date.now() + 3600000) } });
    const webRequire = createRequire(path.resolve("apps/web/package.json"));
    const cookies = webRequire(webRequire.resolve("better-call", { paths: [path.dirname(webRequire.resolve("better-auth/cookies"))] }));
    const signed = await cookies.serializeSignedCookie("teardown-test.session_token", session.token, (await auth.$context).secret, { path: "/", httpOnly: true, sameSite: "lax" }) as string;
    const pair = signed.split(";")[0]!, separator = pair.indexOf("=");
    await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: "http://localhost:3016" }]);
    const material = "授权合成测试资料：启航阅读课6次，每次60分钟，费用980元。学习关键词定位与段落主旨。没有确认免费试听、教师资历、课后服务、提分承诺和退费政策。";
    const upload = await context.request.post("/api/source-items/upload", { multipart: { files: { name: "V3-authorized.txt", mimeType: "text/plain", buffer: Buffer.from(material) } } });
    expect(upload.ok()).toBe(true);
    const uploaded = await upload.json();
    await writeFile(path.join(output, "upload-result.json"), JSON.stringify(uploaded, null, 2));
    const sourceId = uploaded.results[0].sourceItemId as string;
    expect(uploaded.results[0].status).toBe("READY");
    const asset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: userId, versions: { create: { version: 1, title: "授权阅读表达 Skill", editedById: userId, steps: ["按资料事实介绍阅读内容，避免宣传口号"], applicableScenarios: ["课程介绍"], boundaries: ["不能增加事实"], evidence: [] } } }, include: { versions: true } });
    for (const skill of [false, true]) {
      const created = await context.request.post("/api/projects", { data: { title: `阅读课运营-${skill ? "有Skill" : "无Skill"}`, sourceItemIds: [sourceId], methodVersionIds: skill ? [asset.versions[0]!.id] : [] } });
      expect(created.status()).toBe(201); const projectId = (await created.json()).id as string;
      const started = Date.now();
      await page.goto(`/dashboard?project=${projectId}`);
      await expect(page.getByLabel("和鑫小助说", { exact: true })).toBeEnabled({ timeout: 60000 });
      await page.getByLabel("任务类型", { exact: true }).selectOption("SCRIPT");
      await expect(page.getByLabel("选择 Skill", { exact: true })).toHaveValue(skill ? asset.versions[0]!.id : "");
      const prompt = "按项目资料写阅读课介绍：恰好三段，每段两句，段间空行，不要标题和列表。第一段讲学习内容，第二段列课时与费用，第三段讲如何了解课程。不得编亲历、效果、机构安排。";
      await page.getByLabel("和鑫小助说", { exact: true }).fill(prompt);
      await page.getByRole("button", { name: "发送给鑫小助", exact: true }).click();
      await expect(page.getByRole("button", { name: "保存为成果", exact: true }).last()).toBeVisible({ timeout: 150000 });
      const reply = await db.assistantMessage.findFirstOrThrow({ where: { role: "ASSISTANT", status: "COMPLETED", thread: { projectId } }, orderBy: { createdAt: "desc" } });
      const run = await db.aIRun.findUniqueOrThrow({ where: { id: reply.aiRunId! } }); expect(run.provider).toBe("DEEPSEEK");
      expect(reply.content).toContain("980"); expect(reply.content).toContain("60"); expect(reply.content).toContain("6");
      const metadata = reply.metadata as { sources?: Array<{ reference?: { sourceId: string } }> };
      expect(metadata.sources?.some(source => source.reference?.sourceId === sourceId)).toBe(true);
      const parts = reply.content.split(/\n\s*\n/u); expect(parts).toHaveLength(3);
      await page.getByRole("button", { name: "保存为成果", exact: true }).last().click();
      await page.getByRole("button", { name: "保存成果", exact: true }).click();
      await expect(page.getByText("已保存为独立文本产出。", { exact: true })).toBeVisible();
      const artifact = await db.artifact.findFirstOrThrow({ where: { projectId }, include: { draftBranch: true } });
      await page.goto(`/dashboard?project=${projectId}&node=artifact:${artifact.id}`);
      const editor = page.getByRole("dialog", { name: "项目成果", exact: true });
      await expect(editor.getByLabel("成果正文", { exact: true })).toHaveValue(reply.content.trim(), { timeout: 60000 });
      await editor.getByLabel("成果正文", { exact: true }).evaluate((element: HTMLTextAreaElement) => { element.focus(); element.setSelectionRange(0, 0); });
      await editor.getByLabel("成果正文", { exact: true }).press("Shift+End");
      await editor.getByRole("button", { name: "通过 AI 修改选中内容", exact: true }).click();
      await page.getByLabel("和鑫小助说", { exact: true }).fill("更自然一点，仅改选中部分，事实不变");
      await page.getByRole("button", { name: "发送给鑫小助", exact: true }).click();
      await expect(page.getByRole("button", { name: "应用到当前成果", exact: true }).last()).toBeVisible({ timeout: 150000 });
      await page.getByRole("button", { name: "应用到当前成果", exact: true }).last().click();
      await expect(page.getByText("已应用到当前产出，并保留上一版本。", { exact: true })).toBeVisible();
      const changed = await db.draftBranch.findUniqueOrThrow({ where: { id: artifact.draftBranchId } });
      const end = artifact.draftBranch.workingBody.indexOf("\n"); expect(changed.workingBody.slice(changed.workingBody.indexOf("\n"))).toBe(artifact.draftBranch.workingBody.slice(end));
      await page.goto("/dashboard"); await page.goto(`/dashboard?project=${projectId}&node=artifact:${artifact.id}`);
      await expect(editor.getByLabel("成果正文", { exact: true })).toHaveValue(changed.workingBody, { timeout: 60000 });
      await editor.getByRole("button", { name: "查看版本历史", exact: true }).click();
      const history = editor.getByRole("region", { name: "成果版本历史", exact: true });
      await history.locator("summary").last().click(); await history.getByRole("button", { name: "恢复此版本", exact: true }).last().click();
      await expect(editor.getByLabel("成果正文", { exact: true })).toHaveValue(artifact.draftBranch.workingBody);
      const downloadPromise = page.waitForEvent("download"); await editor.getByRole("button", { name: "导出已保存版本", exact: true }).click();
      const download = await downloadPromise, file = path.join(output, skill ? "skill-export.txt" : "no-skill-export.txt"); await download.saveAs(file);
      const exported = await readFile(file, "utf8"); expect(exported).toContain(artifact.draftBranch.workingBody);
      const runs = await db.aIRun.findMany({ where: { projectId, action: "PROJECT_ASSISTANT" }, select: { provider: true, model: true, inputTokens: true, outputTokens: true, createdAt: true, finishedAt: true, status: true, metadata: true } });
      const messages = await db.assistantMessage.findMany({ where: { thread: { projectId } }, select: { role: true, content: true, status: true, metadata: true } });
      records.push({ skill, mode: "REAL", elapsedMs: Date.now() - started, status: "PASS", upload: "API_REAL", source: material, runs, messages, exported });
      await writeFile(path.join(output, "e2e-real.json"), JSON.stringify({ records, pageErrors: errors }, null, 2));
      await page.screenshot({ path: path.join(output, `e2e-${skill ? "skill" : "no-skill"}.png`) });
    }
    expect(errors).toEqual([]);
  } finally {
    // Only uploaded objects owned by this isolated workspace are removed.
    if (workspaceId) {
      const runs = await db.aIRun.findMany({ where: { workspaceId, action: "PROJECT_ASSISTANT" }, select: { provider: true, model: true, inputTokens: true, outputTokens: true, createdAt: true, finishedAt: true, status: true } });
      const messages = await db.assistantMessage.findMany({ where: { thread: { workspaceId } }, select: { role: true, content: true, status: true, metadata: true } });
      await writeFile(path.join(output, `e2e-observed-${userId}.json`), JSON.stringify({ records, runs, messages, pageErrors: errors }, null, 2));
      const assets = await db.sourceAsset.findMany({ where: { workspaceId, storageKey: { not: null } } }); for (const asset of assets) await getStorageProvider().delete(asset.storageKey!); await db.workspace.delete({ where: { id: workspaceId } });
    }
    await db.user.deleteMany({ where: { id: userId } }); await live.$disconnect(); await db.$disconnect();
  }
});
