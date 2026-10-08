import { randomUUID } from "node:crypto";
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { expect, test } from "@playwright/test";
import { auth } from "../lib/auth";

const runId = randomUUID();
const ownerEmail = `drafts-owner-${runId}@example.test`;
const viewerEmail = `drafts-viewer-${runId}@example.test`;
const password = "safe-drafts-e2e-password";
const outputDir = resolve(process.cwd(), "../../output/playwright/phase9c-2");
let ownerId = "";
let viewerId = "";
let workspaceId = "";
let projectId = "";
let ownerCookies: ReturnType<typeof sessionCookies> = [];
let viewerCookies: ReturnType<typeof sessionCookies> = [];

function sessionCookies(response: Response) {
  return response.headers.getSetCookie().map((header) => {
    const [pair] = header.split(";", 1); const separator = pair!.indexOf("=");
    return { name: pair!.slice(0, separator), value: pair!.slice(separator + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const };
  });
}

test.describe.serial("Phase 9C-2 multi-draft Workbench", () => {
  test.beforeAll(async () => {
    await mkdir(outputDir, { recursive: true });
    const ownerRegistration = await auth.api.signUpEmail({ body: { name: "Draft QA Owner", email: ownerEmail, password }, asResponse: true });
    const viewerRegistration = await auth.api.signUpEmail({ body: { name: "Draft QA Viewer", email: viewerEmail, password }, asResponse: true });
    ownerCookies = sessionCookies(ownerRegistration);
    viewerCookies = sessionCookies(viewerRegistration);
    ownerId = ((await ownerRegistration.clone().json()) as { user: { id: string } }).user.id;
    viewerId = ((await viewerRegistration.clone().json()) as { user: { id: string } }).user.id;
    const workspace = await ensurePersonalWorkspaceForUser(db, { userId: ownerId });
    workspaceId = workspace.id;
    await db.workspaceMember.create({ data: { workspaceId, userId: viewerId, role: "VIEWER" } });
    const project = await db.contentProject.create({ data: { workspaceId, createdById: ownerId, title: "Phase 9C-2 多稿件验收", creativeBrief: { create: { workspaceId, createdById: ownerId, topic: "多稿件如何服务真实创作", angle: "从工作方式切入", audience: "内容团队", coreMessage: "稿件分支和修改历史必须分开", keyPoints: [], structure: [], tone: "自然", risks: [] } } } });
    projectId = project.id;
    const branch = await db.draftBranch.create({ data: { workspaceId, projectId, title: "老板观点版", workingTitle: "多稿件不是多版本", workingBody: "同一份稿件的修改应该留在历史里，不同表达方向才是不同稿件。", workingOutline: ["问题", "判断", "行动"], version: 1, createdById: ownerId, updatedById: ownerId } });
    const revision = await db.draftRevision.create({ data: { workspaceId, projectId, draftBranchId: branch.id, revision: 1, title: "多稿件不是多版本", body: "同一份稿件的修改应该留在历史里，不同表达方向才是不同稿件。", outline: ["问题", "判断", "行动"], origin: "HUMAN", createdById: ownerId } });
    await db.$transaction([
      db.draftBranch.update({ where: { id: branch.id }, data: { currentRevisionId: revision.id } }),
      db.contentProject.update({ where: { id: projectId }, data: { primaryDraftBranchId: branch.id } }),
      db.motherContent.create({ data: { workspaceId, projectId, title: revision.title, body: revision.body, outline: ["问题", "判断", "行动"], origin: "HUMAN", createdById: ownerId } }),
      db.canvasObject.create({ data: { workspaceId, projectId, objectType: "TEXT", title: "自由节点回归", textContent: "Phase 9C-1 节点仍然存在。", positionX: 1120, positionY: 740, width: 360, height: 220, createdById: ownerId, updatedById: ownerId } }),
    ]);
    const mother = await db.motherContent.findUniqueOrThrow({ where: { projectId } });
    await db.platformVariant.create({ data: { workspaceId, projectId, motherContentId: mother.id, platform: "DOUYIN", title: "旧平台稿仍可审核", body: "这是一份已经人工批准的平台稿。", hashtags: [], mediaPlan: {}, metadata: {}, status: "APPROVED", sourceMotherVersion: 1, createdById: ownerId } });
  });

  test.afterAll(async () => {
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    if (ownerId || viewerId) await db.user.deleteMany({ where: { id: { in: [ownerId, viewerId].filter(Boolean) } } });
    await db.$disconnect();
  });

  test("creates, edits, reloads, promotes, histories and safely removes a second draft", async ({ page }) => {
    const consoleIssues: string[] = [];
    page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") consoleIssues.push(`${message.type()}: ${message.text()}`); });
    await page.context().addCookies(ownerCookies);
    await page.setViewportSize({ width: 1680, height: 1000 });
    await page.goto(`/dashboard?project=${projectId}`);
    await expect(page.getByText("自由节点回归", { exact: true })).toBeVisible();
    await page.getByTestId("rf__node-draft").getByRole("button", { name: "继续编辑", exact: true }).click();
    await expect(page.getByRole("dialog", { name: /编辑稿件 老板观点版/ }).getByText("老板观点版", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: resolve(outputDir, "1680-primary-draft.png"), fullPage: false });

    await page.getByRole("button", { name: "其他稿件" }).first().click();
    let drawer = page.getByRole("dialog", { name: "其他稿件" });
    await expect(drawer).toBeVisible();
    await page.screenshot({ path: resolve(outputDir, "1680-draft-list.png"), fullPage: false });
    await drawer.getByLabel("新建稿件").fill("故事版");
    await drawer.getByRole("button", { name: "从当前稿复制" }).click();
    await expect(drawer).toBeHidden();
    await expect(page.getByRole("dialog", { name: /编辑稿件 故事版/ }).getByText("故事版", { exact: true }).first()).toBeVisible();
    await page.screenshot({ path: resolve(outputDir, "1680-new-second-draft.png"), fullPage: false });

    const body = page.getByLabel("口播稿正文");
    await body.fill("故事从一次真实的内容返工开始：第一段编辑停顿。");
    await expect.poll(async () => (await db.draftBranch.findFirst({ where: { projectId, title: "故事版" } }))?.workingBody, { timeout: 10_000 }).toContain("第一段编辑停顿");
    expect(await db.draftRevision.count({ where: { draftBranch: { projectId, title: "故事版" } } })).toBe(1);
    await body.fill("故事从一次真实的内容返工开始：连续编辑停顿不应该污染历史。");
    await expect.poll(async () => (await db.draftBranch.findFirst({ where: { projectId, title: "故事版" } }))?.workingBody, { timeout: 10_000 }).toContain("不应该污染历史");
    expect(await db.draftRevision.count({ where: { draftBranch: { projectId, title: "故事版" } } })).toBe(1);
    await expect(db.motherContent.findUniqueOrThrow({ where: { projectId } })).resolves.toMatchObject({ version: 1 });
    await page.screenshot({ path: resolve(outputDir, "1680-second-draft-edit.png"), fullPage: false });

    await page.reload();
    await page.getByTestId("rf__node-draft").getByRole("button", { name: "继续编辑", exact: true }).click();
    await page.getByRole("button", { name: "其他稿件" }).first().click();
    drawer = page.getByRole("dialog", { name: "其他稿件" });
    const story = drawer.getByRole("listitem").filter({ hasText: "故事版" });
    await expect(story).toBeVisible();
    await story.getByRole("button").first().click();
    await expect(page.getByLabel("口播稿正文")).toHaveValue(/不应该污染历史/);

    await page.getByRole("button", { name: "其他稿件" }).first().click();
    drawer = page.getByRole("dialog", { name: "其他稿件" });
    await drawer.getByRole("listitem").filter({ hasText: "老板观点版" }).getByRole("button").first().click();
    await expect.poll(() => db.draftRevision.count({ where: { draftBranch: { projectId, title: "故事版" } } })).toBe(2);
    await page.getByRole("button", { name: "其他稿件" }).first().click();
    drawer = page.getByRole("dialog", { name: "其他稿件" });
    await drawer.getByRole("listitem").filter({ hasText: "故事版" }).getByRole("button").first().click();
    expect(await db.draftRevision.count({ where: { draftBranch: { projectId, title: "故事版" } } })).toBe(2);
    await page.getByRole("button", { name: "其他稿件" }).first().click();
    drawer = page.getByRole("dialog", { name: "其他稿件" });
    await drawer.getByRole("listitem").filter({ hasText: "故事版" }).getByRole("button", { name: "设为主稿" }).click();
    expect(await db.draftRevision.count({ where: { draftBranch: { projectId, title: "故事版" } } })).toBe(2);
    await expect(page.getByText("已设为当前主稿，平台适配会使用这份内容。")).toBeVisible();
    await page.screenshot({ path: resolve(outputDir, "1680-after-set-primary.png"), fullPage: false });

    await page.getByRole("button", { name: "历史记录" }).first().click();
    await expect(page.getByRole("dialog", { name: /故事版 · 历史记录/ })).toContainText("当前稿件");
    await expect(page.getByRole("dialog", { name: /故事版 · 历史记录/ })).toContainText("首次保存");
    await page.screenshot({ path: resolve(outputDir, "1680-current-draft-history.png"), fullPage: false });
    await page.getByRole("dialog", { name: /故事版 · 历史记录/ }).getByRole("button", { name: "关闭" }).click();

    await page.getByRole("button", { name: "其他稿件" }).first().click();
    drawer = page.getByRole("dialog", { name: "其他稿件" });
    await expect(drawer.getByRole("listitem").filter({ hasText: "故事版" }).getByRole("button", { name: "删除" })).toBeDisabled();
    page.once("dialog", (dialog) => dialog.accept());
    await drawer.getByRole("listitem").filter({ hasText: "老板观点版" }).getByRole("button", { name: "删除" }).click();
    await expect.poll(() => db.draftBranch.count({ where: { projectId, title: "老板观点版", deletedAt: null } })).toBe(0);
    await drawer.getByRole("button", { name: "关闭" }).click();
    await page.getByRole("button", { name: "返回画布" }).click();
    await expect(page.getByText("自由节点回归", { exact: true })).toBeVisible();
    await page.screenshot({ path: resolve(outputDir, "1680-workbench-free-node-regression.png"), fullPage: false });
    await page.getByTestId("rf__node-draft").getByRole("button", { name: "继续编辑", exact: true }).click();
    const motherBeforeConfirm = await db.motherContent.findUniqueOrThrow({ where: { projectId } });
    await page.getByLabel("口播稿正文").fill("故事从一次真实的内容返工开始：确认前的正式修改。");
    await expect.poll(async () => (await db.draftBranch.findFirst({ where: { projectId, title: "故事版" } }))?.workingBody).toContain("确认前的正式修改");
    expect(await db.draftRevision.count({ where: { draftBranch: { projectId, title: "故事版" } } })).toBe(2);
    await expect(db.motherContent.findUniqueOrThrow({ where: { projectId } })).resolves.toMatchObject({ version: motherBeforeConfirm.version });
    await page.getByRole("button", { name: "确认稿件，进入平台适配" }).click();
    await expect.poll(() => db.draftRevision.count({ where: { draftBranch: { projectId, title: "故事版" } } })).toBe(3);
    await expect(db.motherContent.findUniqueOrThrow({ where: { projectId } })).resolves.toMatchObject({ version: motherBeforeConfirm.version + 1 });
    await expect(page.getByText("口播稿已更新", { exact: true })).toBeVisible();
    await expect(page.getByRole("link", { name: "查看审核" })).toBeVisible();
    await page.screenshot({ path: resolve(outputDir, "1680-platform-compatibility.png"), fullPage: false });
    await page.getByRole("link", { name: "查看审核" }).click();
    await expect(page).toHaveURL(new RegExp(`/projects/${projectId}/review/DOUYIN`));
    expect(consoleIssues).toEqual([]);
  });

  test("keeps Viewer read-only and captures the 1680 state", async ({ page }) => {
    const consoleIssues: string[] = [];
    page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") consoleIssues.push(`${message.type()}: ${message.text()}`); });
    await page.context().addCookies(viewerCookies);
    await page.setViewportSize({ width: 1680, height: 1000 });
    await page.goto(`/dashboard?project=${projectId}`);
    await page.getByTestId("rf__node-draft").getByRole("button", { name: "继续编辑", exact: true }).click();
    await page.getByRole("button", { name: "其他稿件" }).first().click();
    const drawer = page.getByRole("dialog", { name: "其他稿件" });
    await expect(drawer.getByLabel("新建稿件")).toHaveCount(0);
    await expect(drawer.getByRole("button", { name: "设为主稿" })).toHaveCount(0);
    await expect(drawer.getByRole("button", { name: "删除" })).toHaveCount(0);
    await page.screenshot({ path: resolve(outputDir, "1680-viewer-readonly.png"), fullPage: false });
    expect(consoleIssues).toEqual([]);
  });

  for (const viewport of [{ width: 1440, height: 900 }, { width: 1920, height: 1080 }]) {
    test(`${viewport.width} desktop Workbench keeps the multi-draft entry and Canvas`, async ({ page }) => {
      const consoleIssues: string[] = [];
      page.on("console", (message) => { if (message.type() === "error" || message.type() === "warning") consoleIssues.push(`${message.type()}: ${message.text()}`); });
      await page.context().addCookies(ownerCookies);
      await page.setViewportSize(viewport);
      await page.goto(`/dashboard?project=${projectId}`);
      await expect(page.getByText("自由节点回归", { exact: true })).toBeVisible();
      await page.getByTestId("rf__node-draft").getByRole("button", { name: "继续编辑", exact: true }).click();
      await expect(page.getByRole("button", { name: "其他稿件" }).first()).toBeVisible();
      await page.screenshot({ path: resolve(outputDir, `${viewport.width}-multi-draft-workbench.png`), fullPage: false });
      expect(consoleIssues).toEqual([]);
    });
  }
});
