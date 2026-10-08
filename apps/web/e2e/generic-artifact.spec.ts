import { randomUUID } from "node:crypto";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";

const suffix = randomUUID();
const email = `generic-artifact-${suffix}@example.test`;
const password = "safe-generic-artifact-password";
let userId = "";
let workspaceId = "";
let projectId = "";
let sourceMessageA = "";
let sourceMessageB = "";
let cookies: Array<{ name: string; value: string; domain: string; path: string; httpOnly: boolean; sameSite: "Lax" }> = [];

test.beforeAll(async () => {
  const registration = await auth.api.signUpEmail({ body: { name: "Generic Artifact QA", email, password }, asResponse: true });
  expect(registration.ok).toBe(true);
  userId = ((await registration.clone().json()) as { user: { id: string } }).user.id;
  workspaceId = (await ensurePersonalWorkspaceForUser(db, { userId })).id;
  projectId = (await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "多产出验收项目" } })).id;
  const primaryDraft = await db.draftBranch.create({ data: { workspaceId, projectId, title: "主稿", createdById: userId, updatedById: userId } });
  await db.contentProject.update({ where: { id: projectId }, data: { primaryDraftBranchId: primaryDraft.id } });
  const thread = await db.assistantThread.create({ data: { workspaceId, projectId, createdById: userId } });
  const [messageA, messageB] = await db.$transaction([
    db.assistantMessage.create({ data: { threadId: thread.id, role: "ASSISTANT", status: "COMPLETED", content: "第一段：项目已完成资料整理。\n第二段：这里是一段需要缩短的详细总结。\n第三段：下一步进入交付。", metadata: { resultType: "TEXT", structuredResult: { type: "TEXT", content: "第一段：项目已完成资料整理。\n第二段：这里是一段需要缩短的详细总结。\n第三段：下一步进入交付。" } } } }),
    db.assistantMessage.create({ data: { threadId: thread.id, role: "ASSISTANT", status: "COMPLETED", content: "执行计划第一步。\n执行计划第二步。\n执行计划第三步。", metadata: { resultType: "TEXT", structuredResult: { type: "TEXT", content: "执行计划第一步。\n执行计划第二步。\n执行计划第三步。" } } } }),
  ]);
  sourceMessageA = messageA.id;
  sourceMessageB = messageB.id;
  cookies = registration.headers.getSetCookie().map((value) => {
    const pair = value.split(";")[0]!;
    const index = pair.indexOf("=");
    return { name: pair.slice(0, index), value: pair.slice(index + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
  });
});

test.afterAll(async () => {
  if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
  if (userId) await db.user.delete({ where: { id: userId } });
  await db.$disconnect();
});

test("creates A and B, targets A through Conversation, and leaves B unchanged", async ({ page }) => {
  test.setTimeout(120_000);
  await page.context().addCookies(cookies);
  const responseA = await page.request.post(`/api/projects/${projectId}/artifacts`, { data: { type: "TEXT", title: "项目总结", sourceMessageId: sourceMessageA } });
  const responseB = await page.request.post(`/api/projects/${projectId}/artifacts`, { data: { type: "TEXT", title: "执行计划", sourceMessageId: sourceMessageB } });
  expect(responseA.status()).toBe(201);
  expect(responseB.status()).toBe(201);
  const artifactA = await responseA.json() as { artifactId: string; version: number; content: string };
  const artifactB = await responseB.json() as { artifactId: string; version: number; content: string };
  const beforeA = await db.artifact.findUniqueOrThrow({ where: { id: artifactA.artifactId }, include: { draftBranch: { include: { revisions: true } } } });
  const beforeB = await db.artifact.findUniqueOrThrow({ where: { id: artifactB.artifactId }, include: { draftBranch: { include: { revisions: true } } } });

  await page.goto(`/dashboard?project=${projectId}`);
  await expect(page.getByRole("link", { name: /项目总结 · V1/ })).toBeVisible();
  await expect(page.getByRole("link", { name: /执行计划 · V1/ })).toBeVisible();
  await page.reload();
  await page.getByRole("link", { name: /项目总结 · V1/ }).click();
  await expect(page).toHaveURL(new RegExp(`node=artifact%3A${artifactA.artifactId}|node=artifact:${artifactA.artifactId}`));
  await expect(page.getByTestId("generic-artifact-view")).toContainText("这里是一段需要缩短的详细总结");

  await page.getByLabel("和鑫小助说").fill("把第二段缩短一半");
  await page.getByLabel("和鑫小助说").press("Enter");
  const apply = page.getByRole("button", { name: "应用到当前产出" }).last();
  await expect(apply).toBeVisible({ timeout: 30_000 });
  await apply.click();
  await expect(page.getByText("已应用到当前产出，并保留上一版本。")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("link", { name: /项目总结 · V2/ })).toBeVisible();
  await expect(page.getByTestId("generic-artifact-view")).not.toContainText("这里是一段需要缩短的详细总结");

  await page.getByRole("link", { name: /执行计划 · V1/ }).click();
  await expect(page.getByTestId("generic-artifact-view")).toContainText(artifactB.content);

  const [afterA, afterB] = await Promise.all([
    db.artifact.findUniqueOrThrow({ where: { id: artifactA.artifactId }, include: { draftBranch: { include: { revisions: true } } } }),
    db.artifact.findUniqueOrThrow({ where: { id: artifactB.artifactId }, include: { draftBranch: { include: { revisions: true } } } }),
  ]);
  expect(afterA.id).toBe(beforeA.id);
  expect(afterA.draftBranchId).toBe(beforeA.draftBranchId);
  expect(afterA.draftBranch.version).toBe(beforeA.draftBranch.version + 1);
  expect(afterA.draftBranch.revisions).toHaveLength(beforeA.draftBranch.revisions.length + 1);
  expect(afterA.draftBranch.revisions.find(({ revision }) => revision === 1)?.body).toBe(beforeA.draftBranch.revisions.find(({ revision }) => revision === 1)?.body);
  expect(afterB.id).toBe(beforeB.id);
  expect(afterB.draftBranch.version).toBe(beforeB.draftBranch.version);
  expect(afterB.draftBranch.workingBody).toBe(beforeB.draftBranch.workingBody);
  expect(afterB.draftBranch.revisions).toHaveLength(beforeB.draftBranch.revisions.length);
});
