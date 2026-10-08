import { randomUUID } from "node:crypto";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { expect, test, type Page } from "@playwright/test";
import { auth } from "../lib/auth";

async function expectClearReadingEdge(page: Page) {
  await expect.poll(() => page.evaluate(() => {
    const stream = document.querySelector(".studio-assistant-stream")!;
    const header = document.querySelector(".workbench-assistant > header")!;
    const top = stream.getBoundingClientRect().top;
    let partial = false;
    for (const body of stream.querySelectorAll(".assistant-markdown,.studio-assistant-message-content")) {
      const walker = document.createTreeWalker(body, NodeFilter.SHOW_TEXT);
      for (let node = walker.nextNode(); node; node = walker.nextNode()) {
        if (!node.textContent?.trim()) continue;
        const range = document.createRange(); range.selectNodeContents(node);
        if ([...range.getClientRects()].some(r => r.width > 0 && r.top < top - .5 && r.bottom > top + .5)) partial = true;
      }
    }
    return { overlap: header.getBoundingClientRect().bottom > top, partial };
  })).toEqual({ overlap: false, partial: false });
}

test("project chat: mention, streamed reply, follow-up, save Artifact, reload", async ({ page }) => {
  const suffix = randomUUID();
  const registration = await auth.api.signUpEmail({ body: { name: "Agent QA", email: `agent-ui-${suffix}@example.test`, password: `agent-test-${suffix}` }, asResponse: true });
  const userId = ((await registration.clone().json()) as { user: { id: string } }).user.id;
  const workspaceId = (await ensurePersonalWorkspaceForUser(db, { userId })).id;
  const cookies = registration.headers.getSetCookie().map(header => { const pair = header.split(";")[0]!; const index = pair.indexOf("="); return { name: pair.slice(0, index), value: pair.slice(index + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const }; });
  const project = await db.contentProject.create({ data: { workspaceId, createdById: userId, title: "项目 Agent 验收", goal: "从参考到长期成果" } });
  await db.sourceItem.create({ data: { workspaceId, createdById: userId, sourceType: "TEXT", sourcePlatform: "GENERIC", title: "产品手册验收", rawText: "产品可离线保存资料。", status: "READY" } });
  const errors: string[] = []; page.on("pageerror", e => errors.push(e.message));
  try {
    await page.context().addCookies(cookies);
    await page.setViewportSize({ width: 1440, height: 1000 });
    await page.goto(`/dashboard?project=${project.id}`);
    const input = page.getByLabel("和鑫小助说");
    await expect(input).toBeVisible();
    await expectClearReadingEdge(page);
    await expect(page.getByRole("button", { name: /语音/ })).toHaveCount(0);
    await expect(page.getByText("今天想先做什么？")).toBeVisible();
    await expect(page.locator(".workbench-assistant header").first()).not.toContainText("当前焦点");
    await page.screenshot({ path: "../../output/playwright/agent-ui-empty.png", fullPage: true });
    const compactHeight = (await input.boundingBox())!.height;
    await input.fill("一行较长的输入内容\n".repeat(12));
    expect((await input.boundingBox())!.height).toBeGreaterThan(compactHeight);
    await input.fill("");
    await page.getByRole("button", { name: "引用已有内容", exact: true }).click();
    await page.getByLabel("搜索引用").fill("产品手册验收");
    await page.getByRole("button", { name: /产品手册验收/ }).click();
    await input.fill("根据资料写一版介绍"); await input.press("Enter");
    await expect(page.locator(".assistant-markdown")).toContainText("我会基于当前项目", { timeout: 60_000 });
    await expect(page.getByText("已参考 1 个来源")).toBeVisible();
    await expect(page.locator(".studio-assistant-citations")).not.toHaveAttribute("open", "");
    await page.getByText("已参考 1 个来源").click();
    await expect(page.locator(".studio-assistant-citations a")).toHaveAttribute("href", /\/library\//);
    await page.getByText("已参考 1 个来源").click();
    await input.fill("缩短30%，保留重点"); await input.press("Enter");
    await expect(page.locator(".assistant-markdown")).toHaveCount(2);
    await expect(page.getByRole("button", { name: "保存为成果", exact: true })).toHaveCount(2);
    const firstAnswer = await db.assistantMessage.findFirstOrThrow({ where: { thread: { projectId: project.id }, role: "ASSISTANT" }, orderBy: { createdAt: "asc" } });
    await db.assistantMessage.update({ where: { id: firstAnswer.id }, data: { content: "可以从“随时接着工作”这个角度介绍。它的价值是让资料和创作留在同一个项目里。\n\n## 先把核心卖点说清楚\n\n产品支持离线保存资料，适合需要反复查阅和整理的工作。[1]\n\n- **资料随时可用**：把手册和参考内容留在项目中。\n- **对话持续推进**：从第一版介绍，接着修改开头和重点。\n- **成果可以沉淀**：满意的内容保存下来，下次继续编辑。\n\n| 使用场景 | 可以怎么做 |\n| --- | --- |\n| 准备产品介绍 | 引用手册，整理核心卖点 |\n| 优化已有文案 | 保留重点，调整长度与语气 |\n\n> 先给出有依据的介绍，再根据使用场景补充细节。" } });
    await page.reload(); await expect(input).toBeVisible();
    await expect(page.locator(".assistant-markdown")).toHaveCount(2);
    await expectClearReadingEdge(page);
    await page.goto("/projects"); await page.goBack();
    await expect(page.locator(".assistant-markdown")).toHaveCount(2);
    await expectClearReadingEdge(page);
    for (const width of [1680, 1366, 390]) {
      await page.setViewportSize({ width, height: width === 390 ? 844 : 1000 });
      await expectClearReadingEdge(page);
      const bubble = (await page.locator(".studio-assistant-message.is-user").first().boundingBox())!;
      const stream = (await page.locator(".studio-assistant-stream").boundingBox())!;
      expect(bubble.width).toBeLessThan(stream.width * .85);
      expect(bubble.x).toBeGreaterThan(stream.x + stream.width * .25);
      await expect(input).toBeInViewport();
      const composer = (await page.locator(".studio-assistant-composer").boundingBox())!;
      expect(composer.y + composer.height).toBeLessThanOrEqual(width === 390 ? 844 : 1000);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
      await page.screenshot({ path: `../../output/playwright/agent-ui-${width}.png`, fullPage: true });
    }
    await page.locator(".studio-assistant-stream").evaluate(element => {
      const paragraph = element.querySelector(".assistant-markdown p")!;
      element.scrollTop += paragraph.getBoundingClientRect().top - element.getBoundingClientRect().top + 8;
    });
    await expectClearReadingEdge(page);
    await expect(page.getByRole("button", { name: "回到最新消息" })).toBeVisible();
    await page.screenshot({ path: "../../output/playwright/agent-ui-history-edge.png", fullPage: true });
    await page.locator(".studio-assistant-stream").evaluate(element => { element.scrollTop = 0; });
    await expect(page.getByRole("button", { name: "回到最新消息" })).toBeVisible();
    await page.getByRole("button", { name: "回到最新消息" }).click();
    await expect(page.getByRole("button", { name: "回到最新消息" })).not.toBeVisible();
    await page.setViewportSize({ width: 1366, height: 1000 });
    await page.getByRole("button", { name: "保存为成果", exact: true }).last().click();
    await page.getByRole("dialog", { name: "保存为成果" }).getByLabel("名称").fill("Agent 验收成果");
    await page.getByRole("button", { name: "保存成果", exact: true }).click();
    await expect.poll(() => db.artifact.count({ where: { workspaceId, projectId: project.id, title: "Agent 验收成果" } })).toBe(1);
    await page.reload(); await expect(input).toBeVisible();
    await expect(page.locator(".assistant-markdown")).toHaveCount(2);
    await page.setViewportSize({ width: 390, height: 844 });
    await expect(input).toBeVisible();
    expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth)).toBe(true);
    expect(errors).toEqual([]);
  } finally { await db.workspace.delete({ where: { id: workspaceId } }); await db.user.delete({ where: { id: userId } }); await db.$disconnect(); }
});
