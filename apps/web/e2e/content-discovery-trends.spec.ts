import { randomUUID } from "node:crypto";
import { createServer, type IncomingMessage, type Server } from "node:http";
import { db } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { expect, test } from "@playwright/test";

const runId = randomUUID();
const email = `trends-e2e-${runId}@example.test`;
const password = "safe-e2e-password";
let fixture: Server;
let fixtureOrigin = "";
const calls: Record<string, number> = {};

async function bodyOf(request: IncomingMessage) {
  const chunks: Buffer[] = [];
  for await (const chunk of request) chunks.push(Buffer.from(chunk));
  return JSON.parse(Buffer.concat(chunks).toString("utf8") || "{}") as Record<string, unknown>;
}

function send(response: import("node:http").ServerResponse, data: unknown, requestId: string) {
  response.writeHead(200, { "content-type": "application/json", "x-request-id": requestId });
  response.end(JSON.stringify(data));
}

test.beforeAll(async () => {
  fixture = createServer(async (request, response) => {
    const url = new URL(request.url ?? "/", "http://fixture.local");
    calls[url.pathname] = (calls[url.pathname] ?? 0) + 1;

    if (url.pathname === "/v1/chat/completions") {
      expect(request.headers.authorization).toBe("Bearer trend-llm-key");
      await bodyOf(request);
      send(response, {
        id: "trend-topic-completion",
        model: "fixture-topic-model",
        choices: [{ message: { content: JSON.stringify({ candidates: [
          { title: "AI 工具越多，协作为什么反而越慢？", angle: "从流程断点切入", targetAudience: "内容团队", coreConflict: "工具增加与协作效率下降", whyNow: "当前榜单出现相关讨论", differenceFromSources: "不复述工具清单，讨论流程设计", supportingReferences: [], riskNotes: ["榜单内容中的事实仍需核实"], recommendedFormat: "口播" },
          { title: "别再堆 AI 工具：先修这三个工作流断点", angle: "用具体流程拆解", targetAudience: "小团队管理者", coreConflict: "购买工具与解决问题之间存在落差", whyNow: "多平台出现相同话题", differenceFromSources: "提供流程检查框架", supportingReferences: [], riskNotes: [], recommendedFormat: "图文" },
          { title: "一套 AI 工作流，为什么换个人就失效？", angle: "从可复制性切入", targetAudience: "企业内容负责人", coreConflict: "个人技巧难以变成组织能力", whyNow: "相关话题进入热门榜单", differenceFromSources: "聚焦组织协作而非模型性能", supportingReferences: [], riskNotes: [], recommendedFormat: null },
        ] }) } }],
        usage: { prompt_tokens: 120, completion_tokens: 80 },
      }, "trend-llm-request");
      return;
    }

    expect(request.headers.redfox_api_key).toBe("trend-redfox-key");
    const body = request.method === "GET" ? {} : await bodyOf(request);
    if (url.pathname === "/story/api/dy/search/likesRank") {
      send(response, { code: 2000, data: { list: [{ id: "ai-office-dy", title: "#AI 办公", rank: 6, likeCount: 900 }] } }, "trend-dy-hot");
      return;
    }
    if (url.pathname === "/story/api/cozeSkill/getXhsCozeSkillDataOne") {
      send(response, { code: 2000, data: { list: [{ id: "ai-office-xhs", title: "AI，办公", rank: 4, noteCount: 18 }] } }, "trend-xhs-hot");
      return;
    }
    if (url.pathname === "/story/api/hotKeyword/list") {
      send(response, { code: 2000, data: { list: [{ id: "low-altitude", hotKeyword: "低空经济", rank: 2 }] } }, "trend-global-hot");
      return;
    }
    if (url.pathname.endsWith("/searchArticle")) {
      const isDouyin = url.pathname.includes("dyData");
      const keyword = String(body.keyword ?? "");
      expect(keyword).toMatch(/AI/);
      const data = isDouyin
        ? { total: 1, hasMore: false, list: [{ awemeId: "trend-support-dy", awemeType: "video", desc: "AI 办公流程案例", author: { uid: "dy-author", nickname: "流程研究员" }, statistics: { diggCount: 321 }, shareUrl: "https://www.douyin.com/video/trend-support-dy" }] }
        : { total: 1, hasMore: false, list: [{ noteId: "trend-support-xhs", noteType: "normal", title: "AI 办公不是工具堆叠", desc: "从协作流程看效率", user: { userId: "xhs-author", nickname: "效率笔记" }, likedCount: 188, noteUrl: "https://www.xiaohongshu.com/explore/trend-support-xhs" }] };
      send(response, { code: 2000, data }, `trend-related-${isDouyin ? "dy" : "xhs"}`);
      return;
    }
    response.writeHead(404).end();
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("Trend fixture did not bind");
  fixtureOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    await db.workspace.deleteMany({ where: { members: { some: { userId: user.id } } } });
    await db.user.delete({ where: { id: user.id } });
  }
  await db.$disconnect();
});

test("trend → related evidence → candidate preview → idea references → project studio", async ({ page }) => {
  test.setTimeout(120_000);
  await page.goto("/register");
  await page.getByLabel("姓名").fill("Trend E2E Owner");
  await page.getByLabel("邮箱").fill(email);
  await page.getByLabel("密码").fill(password);
  await page.getByRole("button", { name: "创建账号" }).click();
  await page.getByLabel("Workspace 名称").fill("Trend E2E Workspace");
  await page.getByRole("button", { name: "创建 Workspace" }).click();
  await expect(page).toHaveURL(/\/dashboard$/);

  const user = await db.user.findUniqueOrThrow({ where: { email }, include: { workspaceMemberships: true } });
  const membership = user.workspaceMemberships[0]!;
  const workspaceId = membership.workspaceId;
  const integrations = new IntegrationService();
  await integrations.saveIntegrationConfig({ workspaceId, userId: user.id, provider: "REDFOX", config: { baseUrl: fixtureOrigin, apiKey: "trend-redfox-key" } });
  await integrations.saveIntegrationConfig({ workspaceId, userId: user.id, provider: "LLM", mode: "FIXTURE", config: { provider: "fixture-openai-compatible", baseUrl: `${fixtureOrigin}/v1`, apiKey: "trend-llm-key", model: "fixture-topic-model" } });

  await page.goto("/discovery/trends");
  await expect(page.getByRole("heading", { name: "趋势机会" })).toBeVisible();
  await page.getByRole("button", { name: "加载趋势" }).click();
  await expect(page.getByRole("link", { name: "#AI 办公" }).first()).toBeVisible();
  expect(calls["/story/api/dy/search/likesRank"]).toBe(1);
  expect(calls["/story/api/cozeSkill/getXhsCozeSkillDataOne"]).toBe(1);
  expect(calls["/story/api/hotKeyword/list"]).toBe(1);
  const publicTrends = await (await page.request.get("/api/discovery/trends?window=TODAY&platform=ALL&type=HOT")).json() as { items: Array<Record<string, unknown>> };
  expect(publicTrends.items.every((item) => !("sourceProvider" in item))).toBe(true);

  await page.getByRole("link", { name: "#AI 办公" }).first().click();
  await expect(page.getByText("真实依据", { exact: true })).toBeVisible();
  await expect(page.getByText("多个平台都出现了相同的明确关键词。")).toBeVisible();
  expect(calls["/story/api/dy/search/likesRank"]).toBe(1);
  expect(calls["/story/api/cozeSkill/getXhsCozeSkillDataOne"]).toBe(1);
  expect(calls["/story/api/hotKeyword/list"]).toBe(1);
  await page.getByRole("button", { name: "查看相关内容" }).click();
  await expect(page.getByText("AI 办公流程案例")).toBeVisible();
  await expect(page.getByText("AI 办公不是工具堆叠")).toBeVisible();
  for (const checkbox of await page.getByRole("checkbox").all()) await checkbox.uncheck();

  await page.getByRole("button", { name: "生成选题" }).first().click();
  await expect(page.getByRole("heading", { name: "AI 工具越多，协作为什么反而越慢？" })).toBeVisible();
  expect(await db.contentIdea.count({ where: { workspaceId } })).toBe(0);
  await page.getByRole("button", { name: "加入我的选题" }).first().click();
  await expect(page).toHaveURL(/\/discovery\/ideas\/[^/]+$/);
  await expect(page.getByText("真实依据", { exact: true })).toBeVisible();
  await expect(page.getByText("AI 建议", { exact: true })).toBeVisible();

  const idea = await db.contentIdea.findFirstOrThrow({ where: { workspaceId, title: "AI 工具越多，协作为什么反而越慢？" }, include: { references: true } });
  expect(idea.references.some((reference) => reference.trendSnapshotId !== null)).toBe(true);
  expect(idea.references.some((reference) => reference.sourceItemId !== null)).toBe(false);
  await page.getByRole("button", { name: "开始创作" }).click();
  await expect(page).toHaveURL(/\/projects\/[^/]+\/studio$/);
  await expect(db.contentIdea.findUniqueOrThrow({ where: { id: idea.id } })).resolves.toMatchObject({ status: "IN_PROGRESS", projectId: expect.any(String) });

  await db.workspaceMember.update({ where: { id: membership.id }, data: { role: "VIEWER" } });
  const forbidden = await page.request.post("/api/discovery/trends", { data: { window: "TODAY", platform: "DOUYIN", type: "HOT", force: true } });
  expect(forbidden.status()).toBe(403);
  await db.workspaceMember.update({ where: { id: membership.id }, data: { role: "OWNER" } });

  expect(await db.apiUsage.count({ where: { workspaceId, operation: { startsWith: "TREND_" }, success: true } })).toBe(3);
  expect(await db.apiUsage.count({ where: { workspaceId, operation: "GENERATE_TOPIC_CANDIDATES", success: true } })).toBe(1);
});
