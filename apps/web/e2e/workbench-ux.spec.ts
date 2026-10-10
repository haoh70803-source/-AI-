import { randomUUID } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { createRequire } from "node:module";
import path from "node:path";
import { expect, test } from "@playwright/test";
import { db } from "@content-center/db";
import { auth } from "../lib/auth";

test("authenticated workbench audit at desktop and mobile widths", async ({ page, context }) => {
  const userId = "v4-ux-" + randomUUID(); let workspaceId = "";
  const phase = process.env.V4_UX_PHASE === "after" ? "after" : "before";
  const output = path.resolve("output/v4-ux", phase); await mkdir(output, { recursive: true });
  const observations: unknown[] = []; const errors: string[] = [];
  page.on("pageerror", error => errors.push(error.message));
  try {
    await db.user.create({ data: { id: userId, name: "V4运营体验", email: userId + "@test.invalid" } });
    workspaceId = (await db.workspace.create({ data: { name: "V4隔离体验", slug: userId, members: { create: { userId, role: "OWNER" } } } })).id;
    const project = await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "运营体验隔离项目" } });
    const branch = await db.draftBranch.create({ data: { workspaceId, projectId: project.id, createdById: userId, updatedById: userId, title: "课程内容", workingTitle: "课程内容", version: 1, workingBody: "# 课程介绍\n\n第一段保持不变。\n\n第二段需要修改。\n\n第三段保持不变。" } });
    const revision = await db.draftRevision.create({ data: { workspaceId, projectId: project.id, draftBranchId: branch.id, revision: 1, title: branch.title, body: branch.workingBody, outline: [], origin: "HUMAN", createdById: userId } });
    await db.draftBranch.update({ where: { id: branch.id }, data: { currentRevisionId: revision.id } });
    const artifact = await db.artifact.create({ data: { workspaceId, projectId: project.id, createdById: userId, draftBranchId: branch.id, title: branch.title } });
    const session = await db.session.create({ data: { userId, token: randomUUID() + randomUUID(), activeWorkspaceId: workspaceId, expiresAt: new Date(Date.now() + 3600000) } });
    const require = createRequire(path.resolve("apps/web/package.json"));
    const cookies = require(require.resolve("better-call", { paths: [path.dirname(require.resolve("better-auth/cookies"))] }));
    const signed = await cookies.serializeSignedCookie("teardown-test.session_token", session.token, (await auth.$context).secret, { path: "/", httpOnly: true, sameSite: "lax" }) as string;
    const pair = signed.split(";")[0]!, separator = pair.indexOf("=");
    await context.addCookies([{ name: pair.slice(0, separator), value: pair.slice(separator + 1), url: "http://localhost:3016" }]);
    const routes = ["/home", "/dashboard", "/projects", "/projects/new", "/short-video/tasks", "/topics", "/library", "/knowledge", "/research/new", "/research/teardown", "/settings", `/dashboard?project=${project.id}`, `/dashboard?project=${project.id}&node=artifact:${artifact.id}`];
    for (const width of [1440, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      for (let index = 0; index < routes.length; index++) {
        const route = routes[index]!; const response = await page.goto(route);
        expect(response?.status()).toBe(200);
        await expect(page.locator("body")).not.toContainText("This page could not be found");
        expect(new URL(page.url()).pathname).not.toBe("/login");
        if (route.includes("node=artifact")) await expect(page.getByLabel("成果正文", { exact: true })).toHaveValue(branch.workingBody);
        else await expect(page.locator("#main-content")).toBeVisible();
        await page.screenshot({ path: path.join(output, `${width}-${index}.png`), fullPage: true, caret: "initial" });
        observations.push({ width, route: route.replaceAll(project.id, "PROJECT").replaceAll(artifact.id, "ARTIFACT"), finalPath: new URL(page.url()).pathname, status: response?.status(), ...await page.evaluate(() => ({ overflow: document.documentElement.scrollWidth > innerWidth + 2, headings: Array.from(document.querySelectorAll("h1,h2")).map(x => x.textContent).slice(0, 8), alerts: Array.from(document.querySelectorAll('[role="alert"]')).map(x => x.textContent), visibleButtons: Array.from(document.querySelectorAll("button")).filter(x => x.getBoundingClientRect().width > 0).map(x => ({ text: x.textContent, label: x.getAttribute("aria-label"), disabled: x.disabled })).slice(0, 35), demoLabel: document.body.innerText.includes("演示数据"), text: document.querySelector("main")?.textContent?.slice(0, 1300) })) });
      }
    }
    if (phase === "after") {
      const source = await db.sourceItem.create({ data: { workspaceId, createdById: userId, title: "V4授权课程资料", sourceType: "TEXT", sourcePlatform: "GENERIC", status: "READY", rawText: "授权合成课程资料：6次课，每次60分钟，总价980元。" } });
      for (const width of [1440, 390]) {
        await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
        await page.goto("/dashboard");
        await page.getByLabel("描述你想完成的事情").fill(`按项目资料写课程介绍，V4验收${width}`);
        await page.getByRole("button", { name: "资料库", exact: true }).click();
        const picker = page.getByRole("dialog", { name: "从资料库选择", exact: true });
        await picker.getByLabel(source.title!).check();
        await picker.getByRole("button", { name: "关闭选择框", exact: true }).click();
        await page.getByRole("button", { name: "开始创作", exact: true }).click();
        await expect(page.getByRole("button", { name: "保存为成果", exact: true }).last()).toBeVisible({ timeout: 30000 });
        const id = new URL(page.url()).searchParams.get("project")!;
        expect(await db.projectSource.count({ where: { projectId: id, sourceItemId: source.id } })).toBe(1);
        const run = await db.aIRun.findFirstOrThrow({ where: { projectId: id, action: "PROJECT_ASSISTANT" } }); expect(run.provider).toBe("MOCK");
        await page.getByRole("button", { name: "保存为成果", exact: true }).last().click();
        await page.getByRole("button", { name: "保存成果", exact: true }).click();
        const editor = page.getByRole("dialog", { name: "项目成果", exact: true });
        const body = editor.getByLabel("成果正文", { exact: true });
        await expect(body).toBeVisible();
        const savedId = new URL(page.url()).searchParams.get("node")!.slice("artifact:".length);
        const artifactUrl = `/api/projects/${id}/artifacts/${savedId}`;
        const original = "# 课程介绍\n\n第一段保持原样。\n\n第二段需要修改。\n\n第三段保持原样。";
        await body.fill(original);
        await editor.getByRole("button", { name: "预览排版", exact: true }).click();
        await expect(editor.getByRole("heading", { name: "课程介绍", exact: true })).toBeVisible();
        await expect(editor.getByText(/含未保存修改/)).toBeVisible();
        await editor.getByRole("button", { name: "编辑正文", exact: true }).click(); await expect(body).toHaveValue(original);
        await page.route("**" + artifactUrl, async route => { if (route.request().method() === "PUT") await route.fulfill({ status: 503, json: { message: "测试保存失败，正文保留。" } }); else await route.continue(); });
        await editor.getByRole("button", { name: "保存修改", exact: true }).click();
        await expect(editor.getByRole("alert")).toContainText("测试保存失败");
        await expect(body).toHaveValue(original); await expect(editor.getByText("正在保存成果…", { exact: true })).toHaveCount(0);
        await page.unroute("**" + artifactUrl);
        await editor.getByRole("button", { name: "保存修改", exact: true }).click();
        await expect(editor.getByText("成果已保存，旧版本保留。", { exact: true })).toBeVisible();
        const stored = await db.artifact.findUniqueOrThrow({ where: { id: savedId } });
        const savedBranch = await db.draftBranch.findUniqueOrThrow({ where: { id: stored.draftBranchId! } });
        await expect(editor.getByRole("navigation", { name: "成果列表", exact: true }).getByText(`V${savedBranch.version}`, { exact: true })).toBeVisible();
        const manualRevision = await db.draftRevision.findFirstOrThrow({ where: { draftBranchId: stored.draftBranchId!, body: original }, orderBy: { revision: "desc" } });
        await editor.getByRole("button", { name: "查看版本历史", exact: true }).click();
        await expect(editor.getByRole("region", { name: "成果版本历史", exact: true })).toBeVisible();
        await body.fill(original + "\n\n保存后历史需要重新读取。");
        await editor.getByRole("button", { name: "保存修改", exact: true }).click();
        await expect(editor.getByRole("region", { name: "成果版本历史", exact: true })).toHaveCount(0);
        await body.fill(original); await editor.getByRole("button", { name: "保存修改", exact: true }).click();
        await expect(editor.getByText("成果已保存，旧版本保留。", { exact: true })).toBeVisible();
        await body.evaluate((element: HTMLTextAreaElement) => { element.focus(); const start = element.value.indexOf("第二段"); element.setSelectionRange(start, start); }); await body.press("Shift+End");
        await expect(editor.getByRole("button", { name: "通过 AI 修改选中内容", exact: true })).toBeVisible();
        await editor.getByRole("button", { name: "通过 AI 修改选中内容", exact: true }).click();
        await page.getByLabel("和鑫小助说", { exact: true }).fill("只修改选中的内容，更自然一点。");
        await page.getByRole("button", { name: "发送给鑫小助", exact: true }).click();
        await page.getByRole("button", { name: "应用到当前成果", exact: true }).last().click();
        await expect(page.getByText("已应用到当前产出，并保留上一版本。", { exact: true })).toBeVisible();
        await page.getByRole("button", { name: "打开项目成果", exact: true }).click();
        await expect(body).toBeVisible();
        const edited = await body.inputValue(); expect(edited.startsWith(original.slice(0, original.indexOf("第二段")))).toBe(true); expect(edited.endsWith("\n\n第三段保持原样。")).toBe(true);
        await editor.getByRole("button", { name: "查看版本历史", exact: true }).click();
        const history = editor.getByRole("region", { name: "成果版本历史", exact: true });
        const item = history.locator("details").filter({ has: page.locator("summary").filter({ hasText: `第 ${manualRevision.revision} 个保存版本` }) });
        await item.locator("summary").click(); await item.getByRole("button", { name: "恢复此版本", exact: true }).click();
        await expect(body).toHaveValue(original);
        await body.fill(original + "\n\n未保存的继续编辑。");
        await editor.getByRole("button", { name: "关闭成果", exact: true }).click();
        await page.getByRole("button", { name: "取消，保留编辑", exact: true }).click(); await expect(body).toHaveValue(original + "\n\n未保存的继续编辑。");
        await editor.getByRole("button", { name: "保存修改", exact: true }).click();
        await expect(editor.getByText("成果已保存，旧版本保留。", { exact: true })).toBeVisible();
        await page.screenshot({ path: path.join(output, `${width}-core-editor.png`), caret: "initial" });
        await page.goto("/projects"); await page.goto(`/dashboard?project=${id}&node=artifact:${savedId}`);
        await expect(body).toHaveValue(original + "\n\n未保存的继续编辑。");
        const downloadPromise = page.waitForEvent("download"); await editor.getByRole("button", { name: "导出已保存版本", exact: true }).click();
        const download = await downloadPromise; const exportPath = path.join(output, `${width}-export.md`); await download.saveAs(exportPath);
        expect(await readFile(exportPath, "utf8")).toContain(original + "\n\n未保存的继续编辑。");
        observations.push({ width, flow: "UI project + select scoped material + Mock generation + preview + failed save recovery + partial edit + restore + edit again + reopen + export", status: "PASS", provider: "MOCK" });
      }
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.goto("/home");
      await expect(page.getByText("演示模式", { exact: true })).toBeVisible();
      const demoDownload = page.waitForEvent("download"); await page.getByRole("button", { name: "导出作品", exact: true }).click();
      const demoFile = path.join(output, "demo-export.csv"); await (await demoDownload).saveAs(demoFile);
      expect(await readFile(demoFile, "utf8")).toContain("演示数据");
      await context.grantPermissions(["clipboard-read", "clipboard-write"]);
      await page.getByRole("button", { name: "复制复盘", exact: true }).click();
      await expect(page.getByText("复盘已复制。打开已有项目工作台后粘贴，继续整理选题或保存成果。", { exact: true })).toBeVisible();
      expect(await page.evaluate(() => navigator.clipboard.readText())).toContain("演示数据，不能作为真实经营依据");
      observations.push({ flow: "demo page, CSV export and copied summary retain demo provenance", status: "PASS" });
      const originalUrl = `/api/projects/${project.id}/artifacts/${artifact.id}`;
      let releaseRefresh!: () => void;
      const refreshGate = new Promise<void>(resolve => { releaseRefresh = resolve; });
      let completedRefresh!: () => void;
      const refreshed = new Promise<void>(resolve => { completedRefresh = resolve; });
      await page.route("**" + originalUrl, async route => {
        await refreshGate;
        await route.fulfill({ json: { artifactId: artifact.id, type: "TEXT", title: artifact.title, version: 1, content: branch.workingBody, excerpt: branch.workingBody, updatedAt: artifact.updatedAt.toISOString(), locked: false } });
        completedRefresh();
      });
      try {
        await page.goto(`/dashboard?project=${project.id}&node=artifact:${artifact.id}`);
        const body = page.getByLabel("成果正文", { exact: true });
        await expect(body).toHaveValue(branch.workingBody);
        await body.evaluate((element: HTMLTextAreaElement) => { element.focus(); const start = element.value.indexOf("第二段"); element.setSelectionRange(start, start); }); await body.press("Shift+End");
        await expect(page.getByRole("button", { name: "通过 AI 修改选中内容", exact: true })).toBeVisible();
        releaseRefresh(); await refreshed;
        await page.evaluate(() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve(null)))));
        await expect(page.getByRole("button", { name: "通过 AI 修改选中内容", exact: true })).toBeVisible();
        observations.push({ flow: "same-version asynchronous refresh preserves selected scope", status: "PASS" });
      } finally { releaseRefresh(); await page.unroute("**" + originalUrl); }
      await db.workspaceMember.update({ where: { workspaceId_userId: { workspaceId, userId } }, data: { role: "VIEWER" } });
      await page.reload();
      await expect(page.getByLabel("成果正文", { exact: true })).toBeDisabled();
      await expect(page.getByRole("button", { name: "保存修改", exact: true })).toBeDisabled();
      const rejected = await context.request.put(originalUrl, { data: { expectedVersion: 1, title: artifact.title, body: "只读成员不能改写" } });
      expect(rejected.status()).toBe(403);
      observations.push({ flow: "VIEWER reads Artifact but UI and server reject saving", status: "PASS", rejectedStatus: rejected.status() });
    }
    expect(errors).toEqual([]);
  } finally {
    await writeFile(path.join(output, "audit.json"), JSON.stringify({ observations, errors, provider: "MOCK", realModelQuality: "NOT TESTED", scope: "isolated synthetic workspace; page audit does not certify all buttons" }, null, 2));
    if (workspaceId) await db.workspace.delete({ where: { id: workspaceId } });
    await db.user.deleteMany({ where: { id: userId } }); await db.$disconnect();
  }
});
