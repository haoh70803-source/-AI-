import { test, expect } from "@playwright/test";
import { createRequire } from "node:module";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve, dirname } from "node:path";
import { createServer, type Server } from "node:http";
import type { AddressInfo } from "node:net";
const require = createRequire(resolve("package.json"));
const output = resolve("../../output/workspace-ui");
let server: Server, origin: string;
test.beforeAll(async () => {
  await mkdir(output, { recursive: true });
  const esbuild = require(require.resolve("esbuild", { paths: [dirname(require.resolve("tsx/package.json"))] }));
  await esbuild.build({ entryPoints: [resolve("tests/fixtures/workspace-ui.tsx")], bundle: true, outfile: resolve(output, "fixture.js"), platform: "browser", external: ["/brand/*"], jsx: "automatic", tsconfig: resolve("tsconfig.json"), plugins: [{ name: "next-fixtures", setup(builder: { onResolve: (options: { filter: RegExp }, callback: (args: { path: string }) => { path: string; namespace: string; external?: boolean }) => void; onLoad: (options: { filter: RegExp; namespace: string }, callback: (args: { path: string }) => { contents: string; loader: string; resolveDir: string }) => void }) {
    builder.onResolve({ filter: /(?:^next\/navigation$|\/app-shell$)/ }, args => ({ path: args.path, namespace: "fixture-navigation" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture-navigation" }, args => ({ loader: "js", resolveDir: process.cwd(), contents: args.path === "next/navigation" ? "const router={push:href=>document.body.setAttribute('data-next-route',href),replace:()=>{},refresh:()=>{}}; export const useRouter=()=>router; export const useSearchParams=()=>new URLSearchParams(location.search); export const usePathname=()=>location.pathname;" : "export const useSidebarLockController=()=>()=>{}; export const useSidebarInteractionLock=()=>{};" }));
    builder.onResolve({ filter: /^next\/(link|image|dynamic)$/ }, args => ({ path: args.path, namespace: "fixture-next" }));
    builder.onLoad({ filter: /.*/, namespace: "fixture-next" }, args => ({ loader: "jsx", resolveDir: process.cwd(), contents: args.path === "next/dynamic" ? "export default () => () => null" : "import React from 'react'; export default ({children,scroll,fill,priority,unoptimized,...props}) => React.createElement('" + (args.path === "next/image" ? "img" : "a") + "',props,children)" }));
  } }] });
  const styles = await Promise.all(["app/globals.css", "components/product-v3.css", "app/black-titanium.css", "app/apple-workbench.css"].map(file => readFile(resolve(file), "utf8")));
  await writeFile(resolve(output, "theme.css"), styles.join("\n").replace(/@import[^;]*;|@source[^;]*;/g, ""));
  server = createServer((request, response) => {
    const pathname = new URL(request.url!, "http://localhost").pathname;
    const file = ["/fixture.js", "/fixture.css", "/theme.css"].includes(pathname) ? resolve(output, pathname.slice(1)) : null;
    response.setHeader("Content-Type", file ? pathname.endsWith(".js") ? "text/javascript" : "text/css" : "text/html");
    if (file) void readFile(file).then(data => response.end(data));
    else if (pathname.startsWith("/brand/") && !pathname.includes("..")) { response.setHeader("Content-Type", pathname.endsWith(".svg") ? "image/svg+xml" : "image/png"); void readFile(resolve("public", pathname.slice(1))).then(data => response.end(data)).catch(() => { response.statusCode = 404; response.end(); }); }
    else response.end('<html><head><meta charset="utf-8"><link rel="stylesheet" href="/theme.css"><link rel="stylesheet" href="/fixture.css"></head><body data-theme="black-titanium"><div id="root"></div><script src="/fixture.js"></script></body></html>');
  });
  await new Promise<void>(done => server.listen(0, "127.0.0.1", done));
  origin = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
});
test.afterAll(async () => { if (!server) return; await new Promise<void>((done, reject) => server.close(error => error ? reject(error) : done())); });

test("Home composer is immediately usable and keeps neutral focus in both themes", async ({ page }) => {
  await page.route("**/api/**", route => route.fulfill({ json: { configured: false, models: [], items: [] } }));
  await page.goto(origin + "/?fixture=home");
  await page.evaluate(() => {
    const marker = document.createElement("div"); marker.className = "apple-workspace-marker"; document.body.append(marker);
  });
  const input = page.getByLabel("描述你想完成的事情", { exact: true });
  await expect(input).toBeVisible();
  await expect(page.getByRole("button", { name: "收起创作输入" })).toHaveCount(0);
  for (const theme of ["black-titanium", "light"]) {
    await page.locator("body").evaluate((body, value) => body.setAttribute("data-theme", value), theme);
    await page.getByRole("heading", { name: "今天，想把什么变成现实？" }).click();
    const restingBorder = await page.locator(".home-composer").evaluate(node => getComputedStyle(node).borderColor);
    await input.fill("保留这份工作草稿");
    const focused = await input.evaluate(node => ({ outline: getComputedStyle(node).outlineStyle, shadow: getComputedStyle(node).boxShadow }));
    expect(focused).toEqual({ outline: "none", shadow: "none" });
    expect(await page.locator(".home-composer").evaluate(node => getComputedStyle(node).borderColor)).toBe(restingBorder);
    expect(await page.locator(".home-composer").evaluate(node => getComputedStyle(node).boxShadow)).toBe("none");
    await page.keyboard.press("Tab");
    const keyboardFocus = await page.locator(":focus").evaluate(node => {
      const probe = document.createElement("span"); probe.style.color = "var(--focus-ring)"; node.append(probe);
      const expected = getComputedStyle(probe).color; probe.remove();
      return { color: getComputedStyle(node).outlineColor, width: getComputedStyle(node).outlineWidth, expected };
    });
    expect(keyboardFocus.width).toBe("2px");
    expect(keyboardFocus.color).toBe(keyboardFocus.expected);
    await page.locator(".xin-home-composer").screenshot({ path: resolve(output, `home-composer-neutral-${theme}.png`) });
  }
  await page.reload();
  await expect(input).toBeVisible();
  await expect(input).toHaveValue("保留这份工作草稿");
});

test("Home opens a paginated picker in place, preserves selection across search, and shows failures", async ({ page }) => {
  const errors: string[] = []; page.on("pageerror", error => errors.push(error.message));
  await page.route("**/api/**", async route => {
    const url = new URL(route.request().url());
    if (url.pathname === "/api/source-items") {
      if (url.searchParams.get("search") === "fail") return route.fulfill({ status: 500, json: { message: "资料读取失败" } });
      const page = Number(url.searchParams.get("page") || 1);
      return route.fulfill({ json: { page, pages: 3, total: 30, items: Array.from({ length: page === 3 ? 6 : 12 }, (_, i) => ({ id: `source-${(page - 1) * 12 + i + 1}`, title: `资料 ${(page - 1) * 12 + i + 1}` })) } });
    }
    if (url.pathname === "/api/creation/sources") return route.fulfill({ json: { items: [{ id: "source-1", title: "资料 1", state: "READY", message: "可用" }] } });
    return route.fulfill({ json: { configured: false, models: [], items: [] } });
  });
  await page.goto(origin + "/?fixture=home");
  await page.getByRole("button", { name: "带着资料开始" }).click();
  const picker = page.getByRole("dialog", { name: "从资料库选择" }); await expect(picker).toBeVisible();
  await expect(picker.getByRole("checkbox")).toHaveCount(12);
  for (const theme of ["black-titanium", "light"]) {
    await page.locator("body").evaluate((body, value) => body.setAttribute("data-theme", value), theme);
    const trigger = page.getByRole("button", { name: "带着资料开始" });
    await trigger.scrollIntoViewIfNeeded();
    if (await picker.isHidden()) await trigger.click();
    await expect(picker).toBeVisible();
    await expect.poll(async () => { const box = await picker.boundingBox(); return Boolean(box && box.y >= 0 && box.y + box.height <= 901); }).toBe(true);
    const surface = await picker.evaluate(node => getComputedStyle(node).backgroundColor);
    if (theme === "black-titanium") expect(surface).not.toBe("rgb(255, 255, 255)");
    await page.screenshot({ path: resolve(output, `material-picker-${theme}.png`) });
  }
  await page.locator("body").evaluate(body => body.setAttribute("data-theme", "black-titanium"));
  await picker.getByRole("checkbox").first().check();
  await picker.getByRole("button", { name: "下一页" }).click();
  await expect(picker.getByText("资料 13", { exact: true })).toBeVisible();
  await picker.getByRole("button", { name: "下一页" }).click(); await expect(picker.getByRole("checkbox")).toHaveCount(6);
  await picker.getByRole("button", { name: "下一页" }).isDisabled().then(value => expect(value).toBe(true));
  await picker.getByLabel("搜索已有资料").fill("重置"); await expect(picker.getByText("第 1 / 3 页", { exact: false })).toBeVisible();
  await expect(picker.getByRole("checkbox").first()).toBeChecked();
  await picker.getByLabel("搜索已有资料").fill("fail"); await expect(picker.getByRole("alert")).toHaveText("资料读取失败");
  await page.keyboard.press("Escape"); await expect(picker).toBeHidden();
  await expect(page.getByRole("button", { name: "带着资料开始" })).toBeFocused();
  expect(new URL(page.url()).pathname).toBe("/"); expect(errors).toEqual([]);
  await page.setViewportSize({ width: 1280, height: 768 });
  await page.locator("body").evaluate(body => body.setAttribute("data-theme", "light"));
  await page.getByRole("button", { name: "带着资料开始" }).click();
  await expect(picker).toBeVisible();
  await expect.poll(async () => { const box = await picker.boundingBox(); return Boolean(box && box.y >= 0 && box.y + box.height <= 769); }).toBe(true);
  await page.screenshot({ path: resolve(output, "home-short-light.png") });
  expect(errors).toEqual([]);
});

test("artifact pages keep full editor text and save the full document", async ({ page }) => {
  let saved = "";
  await page.route("**/api/projects/ui-project/artifacts/ui-artifact", async route => {
    const data = route.request().postDataJSON(); saved = data.body;
    await route.fulfill({ json: { artifactId: "ui-artifact", type: "TEXT", title: data.title, content: saved, version: 2, excerpt: "保存", updatedAt: "2026-10-10T00:00:00Z" } });
  });
  await page.goto(origin + "/?fixture=editor");
  const field = page.getByLabel("成果正文", { exact: true }); const full = await field.inputValue();
  await page.getByRole("button", { name: "预览排版", exact: true }).click();
  const pagination = page.getByRole("navigation", { name: "正文分页", exact: true }); await expect(pagination).toBeVisible();
  await expect(page.getByTestId("generic-artifact-view")).not.toContainText("第 160 节");
  await pagination.getByRole("button", { name: "下一页" }).click(); await expect(pagination).toContainText("第 2 /");
  await page.getByRole("button", { name: "编辑正文", exact: true }).click(); expect(await field.inputValue()).toBe(full);
  await field.fill(full + "最终新增内容"); await page.getByRole("button", { name: "保存修改" }).click();
  await expect(page.getByRole("status").first()).toContainText("已保存"); expect(saved).toBe(full + "最终新增内容");
});

for (const theme of ["light", "black-titanium"]) test(`layout, image fit, dropdown and teardown follow ${theme}`, async ({ page }) => {
  await page.goto(origin + "/?fixture=layout"); await page.locator("body").evaluate((body, theme) => body.setAttribute("data-theme", theme), theme);
  await expect(page.getByRole("button", { name: "切换侧栏" })).toBeVisible();
  const before = await page.locator(".app-main").boundingBox(); await page.getByRole("button", { name: "切换侧栏" }).click();
  await expect.poll(async () => (await page.locator(".app-main").boundingBox())!.x).toBe(236);
  expect(before!.x).toBe(64);
  const chat = (await page.getByRole("region", { name: "项目持续对话" }).boundingBox())!;
  const reference = (await page.locator(".project-material-reference").boundingBox())!; expect(chat.width).toBeGreaterThan(reference.width * 1.5);
  expect(await page.getByAltText("完整图片").evaluate(image => getComputedStyle(image).objectFit)).toBe("contain");
  const colors = await page.locator(".teardown-history").evaluate(node => ({ text: getComputedStyle(node).color, surface: getComputedStyle(node).backgroundColor }));
  if (theme === "black-titanium") expect(colors.surface).not.toBe("rgb(255, 255, 255)");
  await page.getByLabel("统一下拉").selectOption("two"); await expect(page.getByLabel("统一下拉")).toHaveValue("two");
  expect(await page.getByLabel("统一下拉").evaluate(node => getComputedStyle(node).color)).toBe(colors.text);
  const selected = await page.locator(".teardown-report blockquote.is-selected").evaluate(node => ({ border: getComputedStyle(node).borderColor, expected: getComputedStyle(document.body).getPropertyValue("--border-strong").trim() }));
  expect(selected.border).not.toBe("rgb(197, 53, 50)");
  await page.screenshot({ path: resolve(output, `layout-${theme}.png`), fullPage: true });
});

test("work performance pagination does not alter statistics and resets on ranking", async ({ page }) => {
  await page.goto(origin + "/?fixture=analytics"); await page.getByRole("button", { name: "作品表现", exact: true }).click();
  const pagination = page.getByRole("navigation", { name: "作品表现分页" }); await expect(pagination).toBeVisible();
  await expect(page.locator(".va-work-table tbody tr")).toHaveCount(10);
  await pagination.getByRole("button", { name: "下一页" }).click(); await expect(page.locator(".va-work-table tbody tr")).toHaveCount(6);
  await page.getByRole("button", { name: "互动榜", exact: true }).click(); await expect(pagination).toContainText("第 1 / 2 页");
  await page.screenshot({ path: resolve(output, "analytics-dark.png"), fullPage: true });
});

test("material conversation carries its source and conversation destination", async ({ page }) => {
  let input: Record<string, unknown> = {};
  await page.route("**/api/projects", async route => { input = route.request().postDataJSON(); await route.fulfill({ json: { id: "created-ui-project" } }); });
  await page.goto(origin + "/?fixture=source");
  await page.getByRole("button", { name: "基于此资料对话", exact: true }).click();
  await expect(page.locator("body")).toHaveAttribute("data-next-route", "/dashboard?project=created-ui-project&source=source-ui&focus=conversation");
  expect(input.sourceItemId).toBe("source-ui");
});
test("saved artifact list paginates without dropping entries", async ({ page }) => {
  await page.goto(origin + "/?fixture=artifacts");
  const list = page.getByRole("navigation", { name: "成果列表", exact: true });
  const pagination = page.getByRole("navigation", { name: "成果列表分页", exact: true });
  await expect(list.getByRole("link")).toHaveCount(5);
  await pagination.getByRole("button", { name: "下一页" }).click(); await expect(list.getByRole("link")).toHaveCount(5);
  await pagination.getByRole("button", { name: "下一页" }).click(); await expect(list.getByRole("link")).toHaveCount(3);
  await expect(list.getByRole("link", { name: /成果 13/ })).toBeVisible();
  await page.route("**/api/projects/ui-project/artifacts/artifact-12", route => route.fulfill({ json: { artifactId: "artifact-12", type: "TEXT", title: "成果 13", version: 1, excerpt: "示例", updatedAt: "2026-10-10T00:00:00Z", content: "已保存正文" } }));
  await page.goto(origin + "/?fixture=artifacts&active=late");
  await expect(pagination).toContainText("第 3 / 3 页");
  await expect(list.getByRole("link", { name: /成果 13/ })).toHaveAttribute("aria-current", "page");
});

test("account pages preserve the complete donut total and reset after filtering", async ({ page }) => {
  await page.route("**/api/video-data?*", route => route.fulfill({ json: {
    today: "2026-10-10", observedAt: "2026-10-10T00:00:00Z", role: "VIEWER", projects: [],
    accounts: Array.from({ length: 13 }, (_, i) => ({ id: `account-${i}`, handle: `测试账号 ${i + 1}`, platform: "DOUYIN", archivedAt: null })),
    records: Array.from({ length: 13 }, (_, i) => ({ accountId: `account-${i}`, day: "2026-10-10", plays: 100, likes: 2, comments: 1, saves: 1, shares: 1, netFollowers: 1, observedAt: "2026-10-10T00:00:00Z", source: "MANUAL" })),
  } }));
  await page.goto(origin + "/?fixture=analytics-real");
  const pagination = page.getByRole("navigation", { name: "账号表现分页", exact: true });
  await expect(page.locator(".va-account-list .va-account")).toHaveCount(5);
  const total = await page.locator(".va-donut-value").textContent(); expect(total).toBe("1,300");
  await pagination.getByRole("button", { name: "下一页" }).click(); await pagination.getByRole("button", { name: "下一页" }).click();
  await expect(page.locator(".va-account-list .va-account")).toHaveCount(3);
  expect(await page.locator(".va-donut-value").textContent()).toBe(total);
  await page.locator(".va-account-list .va-account").first().click();
  await expect(page.locator(".va-account-list .va-account")).toHaveCount(1); await expect(pagination).toHaveCount(0);
  await expect(page.locator(".va-donut-value")).toHaveText("100");
});


test("chat keeps contextual notes collapsed and still exposes actual loading failures", async ({ page }) => {
  let fail = false;
  await page.route("**/api/**", route => {
    if (new URL(route.request().url()).pathname === "/api/projects/ui-project/assistant") {
      return route.fulfill(fail ? { status: 403, json: { message: "无权读取此项目对话" } } : { json: { id: "fixture-thread", messages: [{ id: "fixture-message", role: "ASSISTANT", content: "这是保存的回答。", status: "COMPLETED", createdAt: "2026-10-10T00:00:00Z", artifactId: null, sources: [], warnings: ["部分上下文超过预算，已保留优先内容；可减少引用后重试。"], resultType: "TEXT", structuredResult: null, actions: [] }] } });
    }
    return route.fulfill({ json: { models: [], items: [] } });
  });
  await page.goto(origin + "/?fixture=chat");
  await expect(page.getByText("这是保存的回答。", { exact: true })).toBeVisible();
  await expect(page.locator(".studio-assistant-warnings")).toHaveCount(0);
  await expect(page.getByText("直接描述需求即可", { exact: false })).toHaveCount(0);
  const note = page.getByText("部分上下文超过预算", { exact: false });
  await expect(note).toBeHidden();
  await page.getByText("回答详情", { exact: true }).click();
  await expect(note).toBeVisible();
  await page.getByText("回答详情", { exact: true }).click();
  await expect(note).toBeHidden();
  await expect(page.getByLabel("和鑫小助说", { exact: true })).toBeVisible();
  fail = true;
  await page.reload();
  await expect(page.getByRole("alert")).toContainText("无权读取此项目对话");
});
