import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { createSourceExternalMetadata, createSourceMetadataEnvelope } from "@content-center/providers";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";

const runId = randomUUID();
const email = `material-functional-recovery-${runId}@example.test`;
const password = "safe-material-functional-recovery-password";
const appOrigin = new URL(process.env.APP_URL ?? "http://localhost:3000");
let fixture: Server;
let fixtureOrigin = "";
let workspaceId = "";
let userId = "";
const consoleIssues: string[] = [];

function send(response: import("node:http").ServerResponse, payload: unknown, status = 200, contentType = "application/json") {
  response.writeHead(status, { "content-type": contentType });
  response.end(contentType === "application/json" ? JSON.stringify(payload) : String(payload));
}

function externalMetadata(externalId: string, title: string, complete = true) {
  return createSourceExternalMetadata({
    platform: "DOUYIN",
    externalId,
    originalTitle: title,
    description: complete ? "一条包含真实访谈、可核对表达和后续创作线索的资料。" : null,
    authorId: complete ? "author-functional" : null,
    authorName: complete ? "内容负责人" : null,
    authorAvatarUrl: complete ? `${fixtureOrigin}/avatar.svg` : null,
    publishedAt: complete ? "2026-09-12T08:30:00.000Z" : null,
    originalUrl: `https://www.douyin.com/video/${externalId}`,
    coverUrl: complete ? `${fixtureOrigin}/cover.svg` : null,
    durationMs: complete ? 92_000 : null,
    topics: complete ? ["招生", "内容表达"] : [],
    metrics: complete ? { views: 125_000, likes: 18_800, comments: 321, favorites: 2_400, shares: 680 } : { views: null, likes: null, comments: null, favorites: null, shares: null },
    providerFetchedAt: complete ? "2026-09-14T09:00:00.000Z" : undefined,
    providerCrawlTime: null,
  });
}

const understanding = {
  whatItSays: { summary: "这条访谈强调先回应真实问题，再组织表达。", keyPoints: ["先回应真实问题", "分开事实和观点", "最后组织表达"], evidence: [{ quote: "先回应真实问题，再组织表达。", segmentIndex: 0 }] },
  expression: {
    audience: { summary: "面向正在整理内容的团队。", evidence: [{ quote: "真实问题", segmentIndex: 0 }] },
    opening: { summary: "从真实问题进入主题。", evidence: [{ quote: "先回应真实问题", segmentIndex: 0 }] },
    progression: { summary: "由问题推进到表达动作。", steps: ["回应问题", "组织表达"], evidence: [{ quote: "再组织表达", segmentIndex: 0 }] },
    support: { summary: "用真实访谈支撑判断。", evidence: [{ quote: "真实问题", segmentIndex: 0 }] },
    emotionalOrRhetoricalShift: { summary: "从信息混乱转向清晰行动。", evidence: [{ quote: "组织表达", segmentIndex: 0 }] },
    ending: { summary: "以可执行动作收束。", evidence: [{ quote: "先回应真实问题", segmentIndex: 0 }] },
  },
  methods: { evidenceStatus: "SINGLE_SOURCE_DRAFT", reason: "只有一条资料依据。", items: [{ title: "先回应问题，再组织表达", howTo: ["写清问题", "组织表达"], applicable: ["整理访谈时"], boundaries: ["不要把外部经历写成我方事实"], evidence: [{ quote: "先回应真实问题", segmentIndex: 0 }] }] },
  reusable: [{ content: "先回应真实问题，再组织表达。", whyUseful: "帮助团队减少资料堆叠。" }],
  doNotCopy: [],
  uncertain: [{ content: "访谈中的规模性结论", reason: "还需要更多资料核对。" }],
};

test.beforeAll(async () => {
  fixture = createServer((request, response) => {
    if (request.url === "/cover.svg" || request.url === "/avatar.svg" || request.url === "/cover-refreshed.svg" || request.url === "/avatar-refreshed.svg") {
      const avatar = request.url.includes("avatar");
      const refreshed = request.url.includes("refreshed");
      const body = avatar
        ? `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 112 112'><circle cx='56' cy='56' r='42' fill='${refreshed ? "#d6b8a5" : "#f2c5a7"}'/><path d='M15 110c8-34 25-49 41-49s33 15 41 49' fill='#4f79a7'/></svg>`
        : `<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 640 360'><rect width='640' height='360' fill='${refreshed ? "#c8e0ef" : "#d8e8f7"}'/><path d='M0 280 180 120 315 245 430 95 640 300V360H0Z' fill='#769bc2'/><circle cx='510' cy='82' r='42' fill='#f4cfad'/></svg>`;
      send(response, body, 200, "image/svg+xml");
      return;
    }
    if (request.url === "/story/api/dyData/queryWork") {
      send(response, { code: 2000, requestId: "functional-recovery-refresh", data: { awemeId: "sparse-functional-recovery", awemeType: "video", title: "刷新后标题：真实问题优先", desc: "刷新后补齐的真实作品说明。", author: { uid: "author-refreshed", nickname: "刷新后的作者", avatarUrl: `${fixtureOrigin}/avatar-refreshed.svg` }, statistics: { playCount: 218_000, diggCount: 23_400, collectCount: 3_100, commentCount: 456, shareCount: 890 }, shareUrl: "https://www.douyin.com/video/sparse-functional-recovery", coverUrl: `${fixtureOrigin}/cover-refreshed.svg`, publishTime: 1_778_000_000, duration: 48 } });
      return;
    }
    send(response, { code: 404, message: "fixture not found" }, 404);
  });
  await new Promise<void>((resolve) => fixture.listen(0, "127.0.0.1", resolve));
  const address = fixture.address();
  if (!address || typeof address === "string") throw new Error("Functional recovery fixture did not bind");
  fixtureOrigin = `http://127.0.0.1:${address.port}`;
});

test.afterAll(async () => {
  await new Promise<void>((resolve) => fixture.close(() => resolve()));
  if (workspaceId) {
    await db.workspace.delete({ where: { id: workspaceId } }).catch(() => undefined);
  }
  if (userId) await db.user.delete({ where: { id: userId } }).catch(() => undefined);
  await db.$disconnect();
});

test("material detail real actions remain usable after one-screen layout", async ({ page }) => {
  test.setTimeout(150_000);
  page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") consoleIssues.push(`${message.type()}: ${message.text()}`); });
  page.on("pageerror", (error) => consoleIssues.push(`pageerror: ${error.message}`));

  const registration = await auth.api.signUpEmail({ body: { name: "资料功能回归负责人", email, password }, asResponse: true });
  expect(registration.ok).toBe(true);
  userId = ((await registration.clone().json()) as { user: { id: string } }).user.id;
  const workspace = await ensurePersonalWorkspaceForUser(db, { userId });
  workspaceId = workspace.id;
  const project = await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "招生内容项目", status: "WRITING" } });
  const primaryBranch = await db.draftBranch.create({ data: { workspaceId, projectId: project.id, title: "主稿", createdById: userId, updatedById: userId } });
  await db.contentProject.update({ where: { id: project.id }, data: { primaryDraftBranchId: primaryBranch.id } });
  await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "另一个创作项目", status: "DRAFT" } });
  const tag = await db.contentTag.create({ data: { workspaceId, name: "已有标签", slug: "existing-tag" } });
  const collection = await db.collection.create({ data: { workspaceId, createdById: userId, name: "已有素材集" } });
  const richExternal = externalMetadata("rich-functional-recovery", "招生访谈：把真实问题讲清楚");
  const sparseExternal = externalMetadata("sparse-functional-recovery", "待补全的资料", false);
  const makeSource = async (metadata: ReturnType<typeof externalMetadata>, title: string, withAnalysis: boolean) => {
    const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "VIDEO", sourcePlatform: "DOUYIN", sourceProvider: "REDFOX", sourceUrl: metadata.originalUrl, canonicalUrl: metadata.originalUrl, externalId: metadata.externalId, title, author: metadata.authorName, description: metadata.description, thumbnailUrl: metadata.coverUrl, status: "READY", metadata: createSourceMetadataEnvelope(metadata), transcript: { create: { workspaceId, provider: "DOUBAO_ASR", providerMode: "REAL", language: "zh", durationMs: 92_000, fullText: "先回应真实问题，再组织表达。", segments: [{ startMs: 12_000, endMs: 16_000, text: "先回应真实问题，再组织表达。" }, { startMs: 18_000, endMs: 21_000, text: "把事实和观点分开。" }, { startMs: 24_000, endMs: 28_000, text: "最后组织成可以执行的表达。" }], metadata: { methodLabel: "云端转写", qualityMode: "BALANCED", processingMs: 2_150 } } } } });
    if (withAnalysis) {
      const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } });
      await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: source.id, createdById: userId, version: 1, status: "COMPLETED", summary: understanding.whatItSays.summary, tags: [], keywords: ["招生"], keyPoints: understanding.whatItSays.keyPoints, understanding, transcriptUpdatedAtAtAnalysis: transcript.updatedAt } });
    }
    return source;
  };
  const richSource = await makeSource(richExternal, richExternal.originalTitle!, true);
  const sparseSource = await makeSource(sparseExternal, sparseExternal.originalTitle!, false);
  const unanalysedSource = await makeSource(externalMetadata("unanalysed-functional-recovery", "等待看懂的资料"), "等待看懂的资料", false);
  await db.projectSource.create({ data: { projectId: project.id, sourceItemId: richSource.id, role: "OWN_MATERIAL" } });
  await db.sourceItemTag.create({ data: { sourceItemId: richSource.id, tagId: tag.id } });
  await db.collectionItem.create({ data: { sourceItemId: richSource.id, collectionId: collection.id } });
  await db.evidenceItem.createMany({ data: [
    { workspaceId, projectId: project.id, sourceItemId: richSource.id, type: "VIEWPOINT", excerpt: "先回应真实问题，再组织表达。", claim: "先回应真实问题，再组织表达。", ownership: "OWN", status: "PENDING", locator: { kind: "TRANSCRIPT_SEGMENT", segmentIndex: 0, startMs: 12_000 }, createdById: userId },
    { workspaceId, projectId: project.id, sourceItemId: richSource.id, type: "DATA", excerpt: "待确认数据。", claim: "待确认数据。", ownership: "OWN", status: "PENDING", locator: { kind: "TRANSCRIPT_SEGMENT", segmentIndex: 1, startMs: 18_000 }, createdById: userId },
    { workspaceId, projectId: project.id, sourceItemId: richSource.id, type: "CASE", excerpt: "访谈中的规模性结论。", claim: "访谈中的规模性结论。", ownership: "EXTERNAL", status: "CONFIRMED", locator: { kind: "TRANSCRIPT_SEGMENT", segmentIndex: 2, startMs: 24_000 }, createdById: userId },
  ] });
  await new IntegrationService().saveIntegrationConfig({ workspaceId, userId, provider: "REDFOX", config: { baseUrl: fixtureOrigin, apiKey: "functional-redfox-key" } });
  await new IntegrationService().saveIntegrationConfig({ workspaceId, userId, provider: "LLM", config: { integrationType: "KIMI", productModel: "KIMI_2_6", baseUrl: fixtureOrigin, apiKey: "functional-kimi-key", apiModelId: "kimi-2.6-fixture" } });
  await new IntegrationService().saveIntegrationConfig({ workspaceId, userId, provider: "TRANSCRIPTION", config: { source: "DOUBAO", qualityMode: "BALANCED", selectionMode: "AUTO", fallbackToDoubao: false } });

  await page.context().addCookies(registration.headers.getSetCookie().map((header) => { const [pair] = header.split(";", 1); const separator = pair!.indexOf("="); return { name: pair!.slice(0, separator), value: pair!.slice(separator + 1), domain: appOrigin.hostname, path: "/", httpOnly: true, sameSite: "Lax" as const }; }));
  await page.context().grantPermissions(["clipboard-read", "clipboard-write"], { origin: appOrigin.origin });
  await page.setViewportSize({ width: 1680, height: 1000 });
  await page.route(/\/api\/source-items\/[^/]+\/knowledge$/, async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 201, contentType: "application/json", body: JSON.stringify({ runId: "functional-knowledge-run", created: 0, ownership: "EXTERNAL", state: { source: { id: "fixture", title: "本地资料", sourceType: "VIDEO", ownership: "EXTERNAL", hasTranscript: true, transcript: null }, status: "READY_TO_EXTRACT", employeeStatus: "正在识别关键信息", summary: null, candidates: [] } }) });
  });

  await page.goto(`/library/${richSource.id}`);
  await expect(page.getByRole("heading", { name: "招生访谈：把真实问题讲清楚" })).toBeVisible();
  await expect(page.getByText("内容负责人").first()).toBeVisible();
  await expect(page.getByText("12.5万").first()).toBeAttached();
  await expect(page.getByRole("link", { name: "打开原始来源" }).first()).toHaveAttribute("href", richExternal.originalUrl!);
  await expect(page.getByTestId("source-processing-status")).toContainText("资料处理");
  await expect(page.getByTestId("source-processing-status")).toContainText("内容理解");

  const knowledge = page.getByTestId("material-knowledge-card");
  await knowledge.getByText("查看原文", { exact: true }).first().click();
  await expect(knowledge.locator("blockquote").first()).toContainText("访谈中的规模性结论");
  await page.locator(".material-expression-preview > details > summary").click();
  await expect(page.getByText("怎么收尾", { exact: true })).toBeVisible();

  const editableCandidate = knowledge.getByRole("textbox", { name: /编辑待确认内容/ }).first();
  await editableCandidate.fill("确认后的真实观点。");
  await knowledge.getByRole("button", { name: "确认" }).first().click();
  await expect.poll(async () => (await db.evidenceItem.findFirst({ where: { sourceItemId: richSource.id, type: "VIEWPOINT" }, select: { status: true, claim: true } })), { timeout: 15_000 }).toMatchObject({ status: "CONFIRMED", claim: "确认后的真实观点。" });
  await page.reload();
  await expect(knowledge).toContainText("已确认");
  await knowledge.getByRole("button", { name: "不采用" }).last().click();
  await expect.poll(async () => (await db.evidenceItem.findFirst({ where: { sourceItemId: richSource.id, type: "DATA" } }))?.status).toBe("REJECTED");
  await expect.poll(async () => (await db.evidenceItem.findFirst({ where: { sourceItemId: richSource.id, type: "VIEWPOINT" } }))?.status).toBe("CONFIRMED");
  await expect.poll(async () => (await db.evidenceItem.findFirst({ where: { sourceItemId: richSource.id, type: "VIEWPOINT" } }))?.claim).toBe("确认后的真实观点。");

  const transcriptDisclosure = page.locator("#material-transcript-disclosure");
  await transcriptDisclosure.locator("summary").click();
  await expect(transcriptDisclosure).toContainText("状态：已完成");
  await expect(transcriptDisclosure).toContainText("质量：均衡");
  await expect(transcriptDisclosure).toContainText("耗时：2 秒");
  await expect(transcriptDisclosure).toContainText("更新：");
  await expect(transcriptDisclosure.getByRole("button", { name: "重新转写" })).toBeDisabled();
  await expect(transcriptDisclosure).toContainText("语音转写服务暂时不可用，请联系管理员。");
  await new IntegrationService().saveIntegrationConfig({ workspaceId, userId, provider: "DOUBAO_ASR", config: { authMode: "API_KEY", apiKey: "functional-doubao-key", resourceId: "volc.bigasr.auc_turbo" } });
  let transcribeRequest = false;
  await page.route(new RegExp(`/api/source-items/${richSource.id}/transcribe$`), async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    transcribeRequest = true;
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ jobId: "functional-transcribe-job", status: "QUEUED", created: true }) });
  });
  await page.reload();
  await transcriptDisclosure.locator("summary").click();
  await expect(transcriptDisclosure.getByRole("button", { name: "重新转写" })).toBeEnabled();
  await transcriptDisclosure.getByRole("button", { name: "重新转写" }).click();
  await expect.poll(() => transcribeRequest).toBe(true);
  await page.unroute(new RegExp(`/api/source-items/${richSource.id}/transcribe$`));
  await page.reload();
  await transcriptDisclosure.locator("summary").click();
  await expect(transcriptDisclosure.getByRole("button", { name: "复制全文" })).toBeVisible();
  await transcriptDisclosure.getByRole("button", { name: "复制全文" }).click();
  await expect(transcriptDisclosure.getByRole("status")).toContainText("全文已复制");
  await transcriptDisclosure.getByRole("button", { name: "编辑" }).click();
  await transcriptDisclosure.getByLabel("编辑文字稿").fill("已通过功能回归验证的转写内容。");
  await transcriptDisclosure.getByRole("button", { name: "保存文字稿" }).click();
  await expect.poll(async () => (await db.transcript.findUnique({ where: { sourceItemId: richSource.id } }))?.fullText).toBe("已通过功能回归验证的转写内容。");
  await transcriptDisclosure.locator("summary").click();
  await expect(transcriptDisclosure.getByRole("button", { name: "编辑" })).toHaveCount(0);

  const settings = page.locator(".source-settings-popover");
  await page.getByLabel("更多资料设置").click();
  await expect(settings.getByText("资料设置", { exact: true })).toBeVisible();
  await expect(settings.getByRole("button", { name: "归档" })).toBeVisible();
  await expect(settings.getByRole("button", { name: "删除" })).toBeVisible();
  await settings.getByLabel("新标签").fill("功能回归标签");
  await settings.getByRole("button", { name: "添加标签" }).click();
  await expect(settings).toContainText("#功能回归标签");
  await settings.getByText("资料集", { exact: true }).click();
  await settings.getByLabel("选择资料集").selectOption({ label: "已有素材集" });
  await settings.getByRole("button", { name: "加入资料集" }).click();
  await expect(settings).toContainText("已有素材集");
  await expect(settings).toContainText("资料准备");
  await page.getByLabel("更多资料设置").click();

  await page.getByRole("button", { name: /去创作/ }).click();
  const creation = page.locator("#material-creation-actions");
  await expect(creation).toHaveAttribute("open", "");
  await expect(creation.getByRole("link", { name: /加入当前创作/ })).toHaveAttribute("href", new RegExp(`project=${project.id}`));

  await page.goto(`/library/${unanalysedSource.id}`);
  let analysisRequest = false;
  page.on("request", (request) => { if (request.url().includes(`/api/source-items/${unanalysedSource.id}/material-analysis`) && request.method() === "POST") analysisRequest = true; });
  await page.route(new RegExp(`/api/source-items/${unanalysedSource.id}/material-analysis$`), async (route) => {
    if (route.request().method() !== "POST") return route.continue();
    await route.fulfill({ status: 202, contentType: "application/json", body: JSON.stringify({ id: "functional-analysis-attempt", jobId: "functional-analysis-job", version: 1, status: "QUEUED", summary: null, keyPoints: [], understanding: null, stale: false, transcriptUpdatedAt: null, errorCode: null, errorMessage: null }) });
  });
  await page.getByTestId("material-recommended-action").click();
  await expect.poll(() => analysisRequest).toBe(true);
  await expect(page.getByText(/正在整理内容理解|等待/).first()).toBeVisible();

  await page.goto(`/library/${sparseSource.id}`);
  await expect(page.getByRole("button", { name: "更新作品数据" }).first()).toBeVisible();
  const refreshResponse = page.waitForResponse((response) => response.url().includes(`/api/source-items/${sparseSource.id}/metadata/refresh`) && response.request().method() === "POST");
  await page.getByRole("button", { name: "更新作品数据" }).first().click();
  await refreshResponse;
  await expect(page.getByRole("heading", { name: "刷新后标题：真实问题优先" })).toBeVisible({ timeout: 15_000 });
  await expect(page.getByText("刷新后的作者").first()).toBeVisible();
  await expect(page.getByText("21.8万").first()).toBeAttached();

  await new IntegrationService().disableIntegration({ workspaceId, userId, provider: "LLM" });
  await page.goto(`/library/${sparseSource.id}`);
  const unavailableDistillation = page.getByTestId("material-distillation-card");
  await expect(unavailableDistillation).toBeVisible();
  await expect(unavailableDistillation).toContainText("内容提炼暂不可用，请联系管理员检查 AI 服务。");
  await expect(unavailableDistillation.getByRole("button", { name: "暂时无法提炼" })).toBeDisabled();

  expect(consoleIssues).toEqual([]);
});
