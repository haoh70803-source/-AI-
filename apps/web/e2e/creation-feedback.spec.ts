import { randomUUID } from "node:crypto";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";

const runId = randomUUID();
const email = `creation-feedback-${runId}@example.test`;
const otherEmail = `creation-feedback-other-${runId}@example.test`;
const password = "safe-e2e-password";

test.afterAll(async () => {
  const users = await db.user.findMany({ where: { email: { in: [email, otherEmail] } }, include: { workspaceMemberships: true } });
  if (users.length) {
    const workspaceIds = [...new Set(users.flatMap((user) => user.workspaceMemberships.map(({ workspaceId }) => workspaceId)))];
    await db.creationFeedback.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.methodAsset.deleteMany({ where: { workspaceId: { in: workspaceIds } } });
    await db.workspace.deleteMany({ where: { id: { in: workspaceIds } } });
    await db.user.deleteMany({ where: { id: { in: users.map(({ id }) => id) } } });
  }
  await db.$disconnect();
});

function sessionCookies(response: Response) {
  return response.headers.getSetCookie().map((header) => {
    const [pair] = header.split(";", 1); const separator = pair!.indexOf("=");
    return { name: pair!.slice(0, separator), value: pair!.slice(separator + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
  });
}

test("covers draft outcomes, per-method ratings, version changes, failures, isolation, and double clicks", async ({ page }) => {
  const registration = await auth.api.signUpEmail({ body: { name: "Feedback Owner", email, password }, asResponse: true });
  expect(registration.ok).toBe(true);
  const body = await registration.clone().json() as { user: { id: string } };
  await ensurePersonalWorkspaceForUser(db, { userId: body.user.id });
  await page.context().addCookies(sessionCookies(registration));
  const user = await db.user.findUniqueOrThrow({ where: { id: body.user.id }, include: { workspaceMemberships: true } });
  const workspaceId = user.workspaceMemberships[0]!.workspaceId;
  const project = await db.contentProject.create({ data: { workspaceId, createdById: user.id, title: "反馈测试创作", motherContent: { create: { workspaceId, createdById: user.id, title: "已生成口播稿", body: "第一版口播稿正文。", outline: [], origin: "KIMI" } } } });
  const mother = await db.motherContent.findUniqueOrThrow({ where: { projectId: project.id } });
  await db.aIRun.create({ data: { workspaceId, projectId: project.id, userId: user.id, action: "GENERATE_MOTHER_CONTENT", provider: "FIXTURE", model: "fixture", promptVersion: 1, status: "SUCCEEDED", inputSummary: {}, outputJson: {}, appliedAt: new Date("2026-09-07T09:00:00.000Z") } });

  await page.goto(`/projects/${project.id}/studio`);
  const feedback = page.getByTestId("creation-feedback");
  await expect(feedback.getByRole("heading", { name: "这篇稿最后怎么样？" })).toBeVisible();
  await feedback.getByRole("radio", { name: "直接采用" }).click();
  await feedback.getByRole("button", { name: "保存反馈" }).dblclick();
  await expect(feedback).toContainText("已反馈");
  await expect(db.creationFeedback.count({ where: { userId: user.id, projectId: project.id } })).resolves.toBe(1);
  const savedResponse = await page.request.get(`/api/projects/${project.id}/feedback`);
  expect(savedResponse.ok()).toBe(true);
  await page.reload();
  await expect(page.getByTestId("creation-feedback").getByRole("radio", { name: "直接采用" })).toHaveAttribute("aria-checked", "true");

  const source = await db.sourceItem.create({ data: { workspaceId, createdById: user.id, sourceType: "VIDEO", sourcePlatform: "DOUYIN", title: "反馈方法来源", status: "READY", transcript: { create: { workspaceId, provider: "FIXTURE", providerMode: "REAL", fullText: "反馈方法来源。", segments: [] } } } });
  const transcript = await db.transcript.findUniqueOrThrow({ where: { sourceItemId: source.id } });
  const analysis = await db.materialAnalysis.create({ data: { workspaceId, sourceItemId: source.id, createdById: user.id, version: 1, status: "COMPLETED", tags: [], keywords: [], keyPoints: [], understanding: {}, transcriptUpdatedAtAtAnalysis: transcript.updatedAt } });
  const methods: Array<{ assetId: string; versionId: string; title: string }> = [];
  for (let index = 0; index < 3; index += 1) {
    const title = `本次使用的方法 ${index + 1}`;
    const asset = await db.methodAsset.create({ data: { workspaceId, ownerUserId: user.id, status: "TRIAL" } });
    const version = await db.methodVersion.create({ data: { assetId: asset.id, version: 1, title, steps: ["方法步骤"], applicableScenarios: ["需要时"], boundaries: ["不要虚构"], sourceItemId: source.id, sourceMaterialAnalysisId: analysis.id, sourceTranscriptId: transcript.id, sourceTranscriptUpdatedAt: transcript.updatedAt, evidence: [], editedById: user.id } });
    methods.push({ assetId: asset.id, versionId: version.id, title });
  }

  const secondRun = await db.aIRun.create({ data: { workspaceId, projectId: project.id, userId: user.id, action: "GENERATE_MOTHER_CONTENT", provider: "FIXTURE", model: "fixture", promptVersion: 1, status: "SUCCEEDED", inputSummary: {}, outputJson: {}, appliedAt: new Date("2026-09-07T10:00:00.000Z") } });
  const secondUsage = await db.methodUsage.create({ data: { projectId: project.id, methodAssetId: methods[0]!.assetId, methodVersionId: methods[0]!.versionId, aiRunId: secondRun.id, userId: user.id } });
  await page.getByLabel("口播稿正文").fill("人工修改后的第二版口播稿正文。");
  await expect.poll(async () => (await db.motherContent.findUniqueOrThrow({ where: { id: mother.id } })).version).toBe(2);
  const editedFeedback = page.getByTestId("creation-feedback");
  await expect(editedFeedback).toContainText("尚未反馈");
  await editedFeedback.getByRole("radio", { name: "修改后采用" }).click();
  const firstMethod = editedFeedback.locator("div.rounded-xl.border.p-3").filter({ hasText: methods[0]!.title });
  await firstMethod.getByRole("radio", { name: "有帮助" }).click();
  await editedFeedback.getByRole("button", { name: "保存反馈" }).click();
  await expect(editedFeedback).toContainText("已保存这次反馈");
  await page.reload();
  await expect(page.getByTestId("creation-feedback").getByRole("radio", { name: "修改后采用" })).toHaveAttribute("aria-checked", "true");
  await expect(page.getByTestId("creation-feedback").locator("div.rounded-xl.border.p-3").filter({ hasText: methods[0]!.title }).getByRole("radio", { name: "有帮助" })).toHaveAttribute("aria-checked", "true");
  await expect(db.methodUsageFeedback.findFirstOrThrow({ where: { methodUsageId: secondUsage.id } })).resolves.toMatchObject({ methodVersionId: methods[0]!.versionId, rating: "HELPFUL" });

  await db.motherContent.update({ where: { id: mother.id }, data: { body: "第三版口播稿正文。", version: 3 } });
  const thirdRun = await db.aIRun.create({ data: { workspaceId, projectId: project.id, userId: user.id, action: "GENERATE_MOTHER_CONTENT", provider: "FIXTURE", model: "fixture", promptVersion: 1, status: "SUCCEEDED", inputSummary: {}, outputJson: {}, appliedAt: new Date("2026-09-07T11:00:00.000Z") } });
  const thirdUsages = await db.methodUsage.createManyAndReturn({ data: methods.map((method) => ({ projectId: project.id, methodAssetId: method.assetId, methodVersionId: method.versionId, aiRunId: thirdRun.id, userId: user.id })), select: { id: true } });
  await page.reload();
  const multiFeedback = page.getByTestId("creation-feedback");
  await expect(multiFeedback).toContainText("尚未反馈");
  await multiFeedback.getByRole("radio", { name: "修改后采用" }).click();
  const ratingLabels = ["有帮助", "一般", "不适合这次内容"];
  for (let index = 0; index < methods.length; index += 1) {
    const method = multiFeedback.locator("div.rounded-xl.border.p-3").filter({ hasText: methods[index]!.title });
    await method.getByRole("radio", { name: ratingLabels[index]!, exact: true }).click();
  }
  await multiFeedback.getByRole("button", { name: "保存反馈" }).click();
  await expect(multiFeedback).toContainText("已保存这次反馈");
  await expect(db.methodUsageFeedback.count({ where: { methodUsageId: { in: thirdUsages.map(({ id }) => id) } } })).resolves.toBe(3);
  await expect(db.methodUsageFeedback.findMany({ where: { methodUsageId: { in: thirdUsages.map(({ id }) => id) } }, select: { rating: true } })).resolves.toEqual(expect.arrayContaining([{ rating: "HELPFUL" }, { rating: "NEUTRAL" }, { rating: "NOT_SUITABLE" }]));
  await multiFeedback.getByRole("radio", { name: "没有采用" }).click();
  await multiFeedback.getByRole("button", { name: "保存反馈" }).dblclick();
  await expect.poll(async () => (await db.creationFeedback.findUniqueOrThrow({ where: { userId_projectId: { userId: user.id, projectId: project.id } } })).outcome).toBe("NOT_USED");
  await expect(db.creationFeedback.count({ where: { userId: user.id, projectId: project.id } })).resolves.toBe(1);

  const failedProject = await db.contentProject.create({ data: { workspaceId, createdById: user.id, title: "失败生成项目", motherContent: { create: { workspaceId, createdById: user.id, title: "旧稿", body: "旧稿正文", outline: [], origin: "KIMI" } } } });
  await db.aIRun.create({ data: { workspaceId, projectId: failedProject.id, userId: user.id, action: "GENERATE_MOTHER_CONTENT", provider: "FIXTURE", model: "fixture", promptVersion: 1, status: "FAILED", inputSummary: {}, errorCode: "FIXTURE_FAILURE", finishedAt: new Date() } });
  await page.goto(`/projects/${failedProject.id}/studio`);
  await expect(page.getByTestId("creation-feedback")).toHaveCount(0);
  await expect(db.creationFeedback.count({ where: { projectId: failedProject.id } })).resolves.toBe(0);

  const otherRegistration = await auth.api.signUpEmail({ body: { name: "Feedback Other", email: otherEmail, password }, asResponse: true });
  const other = await otherRegistration.clone().json() as { user: { id: string } };
  await db.workspaceMember.create({ data: { workspaceId, userId: other.user.id, role: "EDITOR" } });
  const otherContext = await page.context().browser()!.newContext({ baseURL: process.env.APP_URL ?? "http://localhost:3000" });
  await otherContext.addCookies(sessionCookies(otherRegistration));
  const otherPage = await otherContext.newPage();
  await otherPage.goto(`/projects/${project.id}/studio`);
  await expect(otherPage.getByTestId("creation-feedback")).toHaveCount(0);
  expect((await otherPage.request.get(`/api/projects/${project.id}/feedback`)).status()).toBe(404);
  expect((await otherPage.request.put(`/api/projects/${project.id}/feedback`, { data: { motherContentVersion: 3, outcome: "NOT_USED" } })).status()).toBe(404);
  await otherContext.close();

  await page.goto(`/projects/${project.id}/studio`);
  await page.setViewportSize({ width: 390, height: 844 });
  await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
  expect(await page.locator("main.app-main").innerText()).not.toMatch(/CreationFeedback|MethodUsageFeedback|MethodUsage|AIRun|sourceAiRunId|outcome enum|Workspace|Version ID|aggregation|quality score|JSON|Prompt/i);
});
