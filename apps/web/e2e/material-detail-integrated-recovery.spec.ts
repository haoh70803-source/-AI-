import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { mkdir } from "node:fs/promises";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { createSourceExternalMetadata, createSourceMetadataEnvelope } from "@content-center/providers";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";

const runId = randomUUID();
const email = `material-detail-recovery-${runId}@example.test`;
const password = "safe-material-detail-recovery-password";
const appOrigin = new URL(process.env.APP_URL ?? "http://localhost:3000");
let fixture: Server;
let fixtureOrigin = "";
let workspaceId = "";
let userId = "";
const consoleIssues: string[] = [];

async function assertOneScreen(page: import("@playwright/test").Page) {
  const metrics = await page.evaluate(() => {
    const center = document.querySelector(".material-understanding-column") as HTMLElement | null;
    const transcript = document.querySelector(".source-transcript-column") as HTMLElement | null;
    return {
      documentHeight: Math.max(document.documentElement.scrollHeight, document.body.scrollHeight),
      viewportHeight: window.innerHeight,
      centerScrollHeight: center?.scrollHeight ?? 0,
      centerClientHeight: center?.clientHeight ?? 0,
      centerOverflow: Boolean(center && center.scrollHeight > center.clientHeight + 1),
      transcriptHeight: transcript?.clientHeight ?? 0,
    };
  });
  expect(metrics.documentHeight).toBeLessThanOrEqual(metrics.viewportHeight + 8);
  return metrics;
}

function jsonResponse(response: import("node:http").ServerResponse, payload: unknown, status = 200, contentType = "application/json") {
  response.writeHead(status, { "content-type": contentType });
  response.end(contentType === "application/json" ? JSON.stringify(payload) : String(payload));
}

test.beforeAll(async () => {
  await mkdir("output/ux-reset-v2-1-visual-repair", { recursive: true });
  fixture = createServer((request, response) => {
    if (request.url === "/cover-rich.svg" || request.url === "/avatar-rich.svg" || request.url === "/cover-refreshed.svg" || request.url === "/avatar-refreshed.svg") {
      const accent = request.url.includes("refreshed") ? "#b8d9f1" : "#d8e8f7";
      const circle = request.url.includes("avatar") ? "<circle cx='56' cy='56' r='42' fill='#f2c5a7'/><path d='M15 110c8-34 25-49 41-49s33 15 41 49' fill='#4f79a7'/>" : "<rect width='640' height='360' fill='" + accent + "'/><path d='M0 280 180 120 315 245 430 95 640 300V360H0Z' fill='#769bc2'/><circle cx='510' cy='82' r='42' fill='#f4cfad'/>";
      jsonResponse(response, `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${request.url.includes("avatar") ? "112 112" : "640 360"}'>${circle}</svg>`, 200, "image/svg+xml");
      return;
    }
    if (request.url === "/story/api/dyData/queryWork") {
      jsonResponse(response, { code: 2000, requestId: "recovery-refresh", data: { awemeId: "sparse-material-recovery", awemeType: "video", title: "刷新后标题：真实问题优先", desc: "刷新后补齐的真实作品说明。", author: { uid: "author-refreshed", nickname: "刷新后的作者", avatarUrl: `${fixtureOrigin}/avatar-refreshed.svg` }, statistics: { playCount: 218_000, diggCount: 23_400, collectCount: 3_100, commentCount: 456, shareCount: 890 }, shareUrl: "https://www.douyin.com/video/sparse-material-recovery", coverUrl: `${fixtureOrigin}/cover-refreshed.svg`, publishTime: 1_778_000_000, duration: 48 } });
      return;
    }
    jsonResponse(response, { code: 404, message: "fixture not found" }, 404);
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("Integrated recovery fixture did not bind");
  fixtureOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

test("rich material detail preserves data, workflow actions, evidence and transcript", async ({ page }) => {
  test.setTimeout(120_000);
  page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") consoleIssues.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", (error) => consoleIssues.push(`pageerror: ${error.message}`));
  const registration = await auth.api.signUpEmail({ body: { name: "资料详情验收负责人", email, password }, asResponse: true });
  expect(registration.ok).toBe(true);
  userId = ((await registration.clone().json()) as { user: { id: string } }).user.id;
  const workspace = await ensurePersonalWorkspaceForUser(db, { userId });
  workspaceId = workspace.id;
  const project = await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "招生内容项目", status: "WRITING" } });
  const richExternal = createSourceExternalMetadata({ platform: "DOUYIN", externalId: "rich-material-recovery", originalTitle: "招生访谈：把真实问题讲清楚", description: "一条包含真实访谈、可核对表达和后续创作线索的资料。", authorId: "author-rich", authorName: "内容负责人", authorAvatarUrl: `${fixtureOrigin}/avatar-rich.svg`, publishedAt: "2026-09-12T08:30:00.000Z", originalUrl: "https://www.douyin.com/video/rich-material-recovery", coverUrl: `${fixtureOrigin}/cover-rich.svg`, durationMs: 92_000, topics: ["招生", "内容表达"], metrics: { views: 125_000, likes: 18_800, comments: 321, favorites: 2_400, shares: 680 }, providerFetchedAt: "2026-09-14T09:00:00.000Z", providerCrawlTime: null });
  const richSource = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "VIDEO", sourcePlatform: "DOUYIN", sourceProvider: "REDFOX", sourceUrl: richExternal.originalUrl, canonicalUrl: richExternal.originalUrl, externalId: richExternal.externalId, title: richExternal.originalTitle, author: richExternal.authorName, description: richExternal.description, thumbnailUrl: richExternal.coverUrl, status: "READY", metadata: createSourceMetadataEnvelope(richExternal, { awemeType: "video", assetCount: 1 }), transcript: { create: { workspaceId, provider: "DOUBAO_ASR", providerMode: "REAL", language: "zh", durationMs: 92_000, fullText: "先回应真实问题，再组织表达。", segments: [{ startMs: 12_000, endMs: 16_000, text: "先回应真实问题，再组织表达。" }] } } } });
  await db.sourceAsset.create({ data: { workspaceId, sourceItemId: richSource.id, assetType: "VIDEO", sourceProvider: "REDFOX", remoteUrl: `${fixtureOrigin}/video-rich.mp4`, status: "REMOTE", mimeType: "video/mp4" } });
  await db.projectSource.create({ data: { projectId: project.id, sourceItemId: richSource.id, role: "OWN_MATERIAL" } });
  const understanding = { whatItSays: { summary: "这条访谈强调先回应真实问题，再组织表达。", keyPoints: ["先回应真实问题", "分开事实和观点", "最后组织表达"], evidence: [{ quote: "先回应真实问题，再组织表达。", segmentIndex: 0 }] }, expression: { audience: { summary: "面向正在整理内容的团队。", evidence: [{ quote: "真实问题", segmentIndex: 0 }] }, opening: { summary: "从真实问题进入主题。", evidence: [{ quote: "先回应真实问题", segmentIndex: 0 }] }, progression: { summary: "由问题推进到表达动作。", steps: ["回应问题", "组织表达"], evidence: [{ quote: "再组织表达", segmentIndex: 0 }] }, support: { summary: "用真实访谈支撑判断。", evidence: [{ quote: "真实问题", segmentIndex: 0 }] }, emotionalOrRhetoricalShift: { summary: "从信息混乱转向清晰行动。", evidence: [{ quote: "组织表达", segmentIndex: 0 }] }, ending: { summary: "以可执行动作收束。", evidence: [{ quote: "先回应真实问题", segmentIndex: 0 }] } }, methods: { evidenceStatus: "SINGLE_SOURCE_DRAFT", reason: "只有一条资料依据。", items: [{ title: "先回应问题，再组织表达", howTo: ["写清问题", "组织表达"], applicable: ["整理访谈时"], boundaries: ["不要把外部经历写成我方事实"], evidence: [{ quote: "先回应真实问题", segmentIndex: 0 }] }] }, reusable: [{ content: "先回应真实问题，再组织表达。", whyUseful: "帮助团队减少资料堆叠。" }], doNotCopy: [], uncertain: [{ content: "访谈中的规模性结论", reason: "还需要更多资料核对。" }] };
  await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: richSource.id, createdById: userId, version: 1, status: "COMPLETED", summary: understanding.whatItSays.summary, tags: [], keywords: ["招生"], keyPoints: understanding.whatItSays.keyPoints, understanding, transcriptUpdatedAtAtAnalysis: (await db.transcript.findUniqueOrThrow({ where: { sourceItemId: richSource.id } })).updatedAt } });
  await db.evidenceItem.createMany({ data: [{ workspaceId, projectId: project.id, sourceItemId: richSource.id, type: "VIEWPOINT", excerpt: "先回应真实问题，再组织表达。", claim: "先回应真实问题，再组织表达。", ownership: "OWN", status: "PENDING", locator: { kind: "TRANSCRIPT_SEGMENT", segmentIndex: 0, startMs: 12_000 }, createdById: userId }, { workspaceId, projectId: project.id, sourceItemId: richSource.id, type: "CASE", excerpt: "访谈中的规模性结论。", claim: "访谈中的规模性结论。", ownership: "EXTERNAL", status: "CONFIRMED", locator: { kind: "TRANSCRIPT_SEGMENT", segmentIndex: 0, startMs: 12_000 }, createdById: userId }, { workspaceId, projectId: project.id, sourceItemId: richSource.id, type: "DATA", excerpt: "待确认数据。", claim: "待确认数据。", ownership: "OWN", status: "PENDING", locator: { kind: "TRANSCRIPT_SEGMENT", segmentIndex: 0, startMs: 12_000 }, createdById: userId }] });
  const sparseSource = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "VIDEO", sourcePlatform: "DOUYIN", sourceProvider: "REDFOX", sourceUrl: "https://www.douyin.com/video/sparse-material-recovery", canonicalUrl: "https://www.douyin.com/video/sparse-material-recovery", externalId: "sparse-material-recovery", title: "待补全的资料", status: "READY", transcript: { create: { workspaceId, provider: "MANUAL", providerMode: "REAL", fullText: "一条已有文字稿的资料。", segments: [] } } } });
  await db.evidenceItem.create({ data: { workspaceId, sourceItemId: sparseSource.id, type: "CASE", excerpt: "已有资料参考。", claim: "已有资料参考。", ownership: "EXTERNAL", status: "CONFIRMED", locator: { kind: "SOURCE_EXCERPT", excerpt: "已有资料参考。" }, createdById: userId } });
  await new IntegrationService().saveIntegrationConfig({ workspaceId, userId, provider: "REDFOX", config: { baseUrl: fixtureOrigin, apiKey: "recovery-redfox-key" } });

  const cookies = registration.headers.getSetCookie().map((header) => { const [pair] = header.split(";", 1); const separator = pair!.indexOf("="); return { name: pair!.slice(0, separator), value: pair!.slice(separator + 1), domain: appOrigin.hostname, path: "/", httpOnly: true, sameSite: "Lax" as const }; });
  await page.context().addCookies(cookies);
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.goto(`/library/${richSource.id}`);
  await expect(page.getByRole("heading", { name: "招生访谈：把真实问题讲清楚" })).toBeVisible();
  await expect(page.locator(".source-media-meta > img")).toHaveAttribute("src", `${fixtureOrigin}/avatar-rich.svg`);
  await expect(page.getByText("内容负责人").first()).toBeVisible();
  await expect(page.getByText("12.5万").first()).toBeAttached();
  await expect(page.getByRole("heading", { name: "当前工作" })).toBeVisible();
  await expect(page.getByLabel("当前工作").getByText("招生内容项目")).toBeVisible();
  await expect(page.getByTestId("source-processing-status")).toContainText("资料处理");
  await expect(page.getByTestId("source-processing-status")).toContainText("内容理解");
  await expect(page.getByTestId("material-distillation-card")).toBeVisible();
  await expect(page.getByTestId("material-distillation-card")).toContainText("内容提炼暂不可用，请联系管理员检查 AI 服务。");
  await expect(page.getByTestId("material-distillation-card").getByRole("button", { name: "暂时无法提炼" })).toBeDisabled();
  await expect(page.locator("#material-transcript-disclosure")).toContainText("14 字");
  const richMetrics = await assertOneScreen(page);
  expect(richMetrics.centerOverflow).toBe(true);
  expect(await page.locator(".material-understanding-column").evaluate((element) => element.scrollTop)).toBe(0);
  await page.screenshot({ path: "output/ux-reset-v2-1-visual-repair/01-visual-repair-ready.png" });
  await page.screenshot({ path: "output/ux-reset-v2-1-visual-repair/02-visual-repair-center-top.png" });
  await page.locator(".material-understanding-column").evaluate((element) => { element.scrollTop = element.scrollHeight; });
  await expect.poll(async () => page.locator(".material-understanding-column").evaluate((element) => element.scrollTop)).toBeGreaterThan(0);
  await assertOneScreen(page);
  await page.locator(".material-understanding-column").evaluate((element) => { element.scrollTop = 0; });
  await page.locator(".material-confirmable-section").scrollIntoViewIfNeeded();
  await assertOneScreen(page);
  await expect(page.getByTestId("material-recommended-action")).toBeVisible();
  await page.screenshot({ path: "output/ux-reset-v2-1-visual-repair/03-visual-repair-evidence.png" });
  const confirm = page.getByTestId("material-knowledge-card").getByRole("button", { name: "确认" }).first();
  const reject = page.getByTestId("material-knowledge-card").getByRole("button", { name: "不采用" }).last();
  await confirm.click();
  await expect.poll(async () => (await db.evidenceItem.findFirst({ where: { sourceItemId: richSource.id, type: "VIEWPOINT" }, select: { status: true } }))?.status, { timeout: 15_000 }).toBe("CONFIRMED");
  await page.reload();
  await expect(page.getByTestId("material-knowledge-card")).toContainText("已确认");
  await reject.click();
  await expect.poll(async () => (await db.evidenceItem.findFirst({ where: { sourceItemId: richSource.id, type: "DATA" } }))?.status).toBe("REJECTED");
  await expect.poll(async () => (await db.evidenceItem.findFirst({ where: { sourceItemId: richSource.id, type: "VIEWPOINT" } }))?.status).toBe("CONFIRMED");
  await page.locator(".material-understanding-column").evaluate((element) => { element.scrollTop = 0; });
  await assertOneScreen(page);
  await page.screenshot({ path: "output/ux-reset-v2-1-visual-repair/04-visual-repair-right-rail.png" });
  const disclosure = page.locator("#material-transcript-disclosure");
  await disclosure.scrollIntoViewIfNeeded();
  await assertOneScreen(page);
  await page.screenshot({ path: "output/ux-reset-v2-1-visual-repair/05-visual-repair-transcript-collapsed.png" });
  await disclosure.locator("summary").click();
  await expect(disclosure).toContainText("先回应真实问题，再组织表达。");
  await expect(disclosure).toContainText("状态：已完成");
  await expect(disclosure).toContainText("质量：暂未记录");
  await expect(disclosure).toContainText("耗时：暂未记录");
  await expect(disclosure).toContainText("更新：");
  await expect(disclosure.getByRole("button", { name: "复制全文" })).toBeVisible();
  await assertOneScreen(page);
  await page.screenshot({ path: "output/ux-reset-v2-1-visual-repair/06-visual-repair-transcript-expanded.png" });

  await page.goto(`/library/${sparseSource.id}`);
  await expect(page.getByRole("heading", { name: "待补全的资料" })).toBeVisible();
  await expect(page.getByRole("button", { name: "更新作品数据" }).first()).toBeVisible();
  await expect(page.getByText("资料信息待补全")).toBeVisible();
  await assertOneScreen(page);
  await page.screenshot({ path: "output/ux-reset-v2-1-visual-repair/07-visual-repair-metadata-missing.png" });
  const refreshResponse = page.waitForResponse((response) => response.url().includes(`/api/source-items/${sparseSource.id}/metadata/refresh`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "更新作品数据" }).first().click();
  await refreshResponse;
  await expect(page.getByRole("heading", { name: "刷新后标题：真实问题优先" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("刷新后的作者").first()).toBeVisible();
  await expect(page.getByText("21.8万").first()).toBeAttached();
  const settings = page.locator(".source-settings-popover");
  await settings.getByLabel("更多资料设置").click();
  await expect(settings.getByTestId("source-external-metadata").getByText("刷新后补齐的真实作品说明。", { exact: true })).toBeVisible();
  await settings.getByLabel("更多资料设置").click();
  const detailText = await page.locator("main.app-main").innerText();
  expect(detailText).not.toMatch(/MaterialAnalysis|MaterialDistillation|EvidenceItem|FactGate|Provider|Worker|Queue|Runtime|MethodVersion|DOUBAO_ASR|LOCAL_FUNASR|AIRun|errorCode/i);
  expect(consoleIssues).toEqual([]);
});
