import { act, createElement, type ComponentProps } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { createRoot } from "react-dom/client";
import { createRequire } from "node:module";
import { readFile, writeFile, mkdir, unlink } from "node:fs/promises";
import { resolve } from "node:path";
import { afterEach, expect, it, vi } from "vitest";
import LibraryPage from "../app/(app)/library/page";
import { LibraryToolbar } from "../components/library/library-toolbar";
import { FeishuLibrary } from "../components/library/feishu-library";
import { LibraryCardMenu } from "../components/library/library-card-controls";

const fixture = vi.hoisted(() => ({ role: "OWNER", empty: false, params: new URLSearchParams(), replace: vi.fn(), list: vi.fn() }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: ComponentProps<"a">) => createElement("a", props, children) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ replace: fixture.replace, push: vi.fn(), refresh: vi.fn() }), useSearchParams: () => fixture.params }));
vi.mock("../components/app-shell", () => ({ useSidebarLockController: () => () => {} }));
vi.mock("../components/library/ingest-dialog", () => ({ IngestDialog: () => <button>添加资料</button> }));
vi.mock("../components/library/library-poller", () => ({ LibraryPoller: () => null }));
vi.mock("../server/access", () => ({ requireWorkspace: async () => ({ workspace: { id: "fixture-workspace" }, session: { user: { id: "fixture-user" } }, role: fixture.role }) }));
vi.mock("../server/library", () => ({ listLibrarySources: async (...args: unknown[]) => {
  fixture.list(...args);
  return { items: fixture.empty ? [] : ["DOCUMENT", "VIDEO", "IMAGE", "TEXT"].map((sourceType, index) => ({ id: `fixture-source-${index}`, sourceType, sourceProvider: index === 3 ? "FEISHU" : "UPLOAD", title: ["品牌定位研究", "产品讲解视频", "视觉参考", "飞书授权文档"][index], status: "READY", rawText: "示例正文", createdAt: new Date("2026-10-01T00:00:00Z"), assets: [], ingestJobs: [], transcript: null })), total: fixture.empty ? 0 : 4, page: 1, pages: 2 };
} }));
vi.mock("../server/sidebar/service", () => ({ getProjectListView: async () => ({ recent: [{ projectId: "fixture-project", label: "示例项目" }] }) }));
vi.mock("../server/artifacts/service", () => ({ listArtifacts: async () => [{ artifactId: "fixture-artifact", title: "示例成果" }] }));
afterEach(() => { fixture.empty = false; fixture.role = "OWNER"; fixture.params = new URLSearchParams(); vi.clearAllMocks(); });
async function render(params: Record<string, string> = {}) {
  fixture.params = new URLSearchParams(params);
  return renderToStaticMarkup(await LibraryPage({ searchParams: Promise.resolve(params) }));
}

it("keeps three core views, visible filters and separate knowledge / source destinations", async () => {
  const html = await render({ content: "materials", search: "品牌", status: "ARCHIVED", layout: "LIST" });
  expect(html).not.toContain("<details");
  for (const label of ["全部资源", "创作成果", "资料库", "资料类型", "资料状态", "知识管理入口"]) expect(html).toContain(label);
  expect(html).toContain('href="/library/feishu#feishu-connection"');
  expect(html).toContain("status=ARCHIVED&amp;layout=LIST&amp;sourceType=VIDEO");
  expect(fixture.list).toHaveBeenCalledWith("fixture-workspace", expect.objectContaining({ search: "品牌", status: "ARCHIVED", pageSize: "30" }));
  expect(html).toContain('href="/library/fixture-source-0"');
  expect(html).toContain("更多资料操作：品牌定位研究");
  expect(html).not.toContain("更多资料操作：飞书授权文档");
});

it("preserves artifact project/ID links without pretending material filters apply", async () => {
  const html = await render({ content: "artifacts", sourceType: "VIDEO", status: "ARCHIVED" });
  expect(html).toContain("project=fixture-project&amp;node=artifact:fixture-artifact");
  expect(html).toContain("1 份近期成果");
  expect(html).not.toContain('aria-label="资料状态"');
  expect(html).not.toContain('aria-label="资料类型"');
  expect(html).not.toContain('aria-label="分页"');
  expect(html).not.toContain('aria-label="资料列表"');
});

it("renders honest filtered empty states and retains viewer restrictions", async () => {
  fixture.empty = true; fixture.role = "VIEWER";
  const html = await render({ content: "materials", sourceType: "VIDEO", status: "ARCHIVED" });
  expect(html).toContain("没有符合条件的资料");
  expect(html).toContain("清除筛选与搜索");
  expect(html).not.toContain("添加资料");
  fixture.empty = false;
  expect(await render()).not.toContain("更多资料操作");
});

type TestDOM = { window: Window & typeof globalThis & { close: () => void } };
const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string, options: { url: string }) => TestDOM };
async function withDOM(run: (container: HTMLElement, root: ReturnType<typeof createRoot>, dom: TestDOM) => Promise<void>) {
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost/library" });
  vi.stubGlobal("window", dom.window); vi.stubGlobal("document", dom.window.document); vi.stubGlobal("Event", dom.window.Event); vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  dom.window.HTMLDialogElement.prototype.showModal = function () { this.setAttribute("open", ""); };
  const container = document.getElementById("root")!, root = createRoot(container);
  try { await run(container, root, dom); } finally { await act(async () => root.unmount()); dom.window.close(); vi.unstubAllGlobals(); }
}

it("combines search/status/sort and releases the old RECENT override", async () => {
  fixture.params = new URLSearchParams("content=materials&search=品牌&sourceType=VIDEO&view=RECENT&page=3");
  await withDOM(async (container, root, dom) => {
    await act(async () => root.render(<LibraryToolbar count={4} />));
    const sort = container.querySelector<HTMLSelectElement>('[aria-label="资料排序"]')!;
    await act(async () => { sort.value = "title"; sort.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    const result = new URL(fixture.replace.mock.calls[0]![0], "http://localhost");
    expect(Object.fromEntries(result.searchParams)).toEqual({ content: "materials", search: "品牌", sourceType: "VIDEO", sort: "title" });
    const status = container.querySelector<HTMLSelectElement>('[aria-label="资料状态"]')!;
    await act(async () => { status.value = "ARCHIVED"; status.dispatchEvent(new dom.window.Event("change", { bubbles: true })); });
    expect(fixture.replace.mock.lastCall![0]).toContain("status=ARCHIVED");
    expect(fixture.replace.mock.lastCall![0]).toContain("sourceType=VIDEO");
  });
});

it("distinguishes disconnected, read failure, disabled and active Feishu states", async () => {
  for (const scenario of ["disconnected", "failure", "disabled", "active"]) {
    await withDOM(async (container, root) => {
      vi.stubGlobal("fetch", vi.fn(async () => new Response(JSON.stringify(scenario === "failure" ? { message: "无权访问飞书配置" } : { role: "VIEWER", connection: scenario === "disconnected" ? null : { id: "fixture", enabled: scenario === "active", autoSync: false, lastSyncedAt: null, lastError: null }, documents: [], subscriptions: [], maxDocuments: 50 }), { status: scenario === "failure" ? 403 : 200 })));
      await act(async () => { root.render(<FeishuLibrary />); await new Promise(done => setTimeout(done, 0)); });
      const status = container.querySelector('#feishu-connection [role="status"]')!.textContent;
      expect(status).toBe(({ disconnected: "尚未连接飞书知识库", failure: "连接状态读取失败", disabled: "连接已断开", active: "连接已启用" })[scenario]);
      if (scenario !== "failure") expect(container.textContent).not.toContain("保存连接");
      if (scenario === "failure") expect(container.querySelector('[role="alert"]')?.textContent).toContain("无权访问");
    });
  }
});

it("keeps archive/restore/delete requests scoped to the selected source and exposes failures", async () => {
  for (const operation of ["archive", "restore", "delete", "failure"]) {
    await withDOM(async (container, root, dom) => {
      const request = vi.fn(async () => new Response(operation === "failure" ? JSON.stringify({ message: "资料已被引用，无法删除" }) : null, { status: operation === "failure" ? 409 : 204 }));
      vi.stubGlobal("fetch", request);
      await act(async () => root.render(<LibraryCardMenu sourceId="fixture-selected" title="示例资料" archived={operation === "restore"} />));
      await act(async () => container.querySelector<HTMLButtonElement>("button")!.click());
      const label = operation === "archive" ? "归档资料" : operation === "restore" ? "恢复资料" : "删除资料";
      const button = [...document.querySelectorAll<HTMLButtonElement>('[role="dialog"] button')].find(button => button.textContent === label)!;
      await act(async () => button.click());
      await act(async () => { document.querySelector("dialog form")!.dispatchEvent(new dom.window.Event("submit", { bubbles: true, cancelable: true })); await new Promise(done => setTimeout(done, 0)); });
      expect(request).toHaveBeenCalledWith("/api/source-items/fixture-selected", expect.objectContaining({ method: ["delete", "failure"].includes(operation) ? "DELETE" : "PATCH" }));
      if (operation === "restore") expect(request.mock.calls[0]).toEqual(["/api/source-items/fixture-selected", { method: "PATCH", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "RESTORE" }) }]);
      if (operation === "failure") expect(document.querySelector('dialog [role="alert"]')?.textContent).toContain("资料已被引用");
      else expect(document.querySelector("dialog")).toBeNull();
    });
  }
});

it.skipIf(!process.env.RESOURCE_LITE_PREVIEW)("captures actual page markup in two themes at desktop/tablet/mobile sizes", async () => {
  const { chromium } = await import("@playwright/test");
  const output = resolve("output/resource-center-lite"); await mkdir(output, { recursive: true });
  const styles = await Promise.all(["apps/web/app/globals.css", "apps/web/components/product-v3.css", "apps/web/app/black-titanium.css", "apps/web/app/apple-workbench.css", "apps/web/components/library/asset-library.css"].map(file => readFile(file, "utf8")));
  const image = await readFile("apps/web/public/brand/experience/horizon.png");
  const htmlDocument = (markup: string, theme: string, css = styles.join("\n")) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.replace(/@(import|source)[^;]+;/g, "")}body{margin:0;font-family:'Microsoft YaHei',sans-serif}</style></head><body data-theme="${theme}"><div class="apple-workspace-marker"></div>${markup.replace('src="/brand/experience/horizon.png"', `src="data:image/png;base64,${image.toString("base64")}"`)}</body></html>`;
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    for (const theme of ["black-titanium", "light"]) for (const width of [1440, 768, 390]) {
      await page.setViewportSize({ width, height: 960 });
      await page.setContent(htmlDocument(await render({ content: "materials" }), theme));
      expect(await page.getByRole("navigation", { name: "资料类型", exact: true }).isVisible()).toBe(true);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      const card = page.locator(".asset-library-card").first();
      const bounds = () => card.evaluate(node => { const box = node.getBoundingClientRect(); return { x: box.x + scrollX, y: box.y + scrollY, width: box.width, height: box.height }; });
      const before = await bounds();
      await card.hover(); expect(await bounds()).toEqual(before);
      await page.screenshot({ path: resolve(output, `${theme}-${width}.png`), fullPage: true });
      if (width === 1440 && theme === "black-titanium") await writeFile(resolve(output, "preview.html"), htmlDocument(await render({ content: "materials" }), theme));
    }
    const originalPath = resolve("apps/web/tests/.resource-before.tsx");
    const toolbarPath = resolve("apps/web/tests/.resource-toolbar-before.tsx");
    const { execFileSync } = await import("node:child_process");
    await writeFile(toolbarPath, execFileSync("git", ["show", "HEAD:apps/web/components/library/library-toolbar.tsx"]));
    await writeFile(originalPath, (await readFile(resolve(output, "before-page.tsx"), "utf8")).replace('"@/components/library/library-toolbar"', '"./.resource-toolbar-before"'));
    try {
      const original = await import(originalPath);
      fixture.params = new URLSearchParams("content=materials");
      const markup = renderToStaticMarkup(await original.default({ searchParams: Promise.resolve({ content: "materials" }) }));
      const beforeHtml = htmlDocument(markup, "black-titanium", [...styles.slice(0, -1), await readFile(resolve(output, "before.css"), "utf8")].join("\n"));
      await page.setViewportSize({ width: 1440, height: 960 }); await page.setContent(beforeHtml);
      await page.screenshot({ path: resolve(output, "before-1440.png"), fullPage: true });
      await writeFile(resolve(output, "before.html"), beforeHtml);
    } finally { await unlink(originalPath); await unlink(toolbarPath); }
  } finally { await browser.close(); }
}, 60000);
