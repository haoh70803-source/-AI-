import { createElement, cloneElement, isValidElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { ResearchTools } from "../components/research/research-tools";
import { BenchmarkWorkspace } from "../components/research/benchmark-workspace";
import NewResearch from "../app/(app)/research/new/page";

const state = vi.hoisted(() => ({ canWrite: true, offline: true, populated: false }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: ComponentProps<"a">) => createElement("a", props, children) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
vi.mock("@content-center/providers", () => ({ isLocalReviewOffline: () => state.offline }));
vi.mock("../server/access", () => ({ requireWorkspace: async () => ({ workspace: { id: "fixture" }, session: { user: { id: "fixture-user" } }, role: state.canWrite ? "OWNER" : "VIEWER" }) }));
vi.mock("../server/experience-account", () => ({ canAddResearchAccount: () => state.canWrite }));
vi.mock("../server/research/benchmark-workbench", () => ({ benchmarkWorkbench: async () => {
  const work = { id: "fixture-work", accountId: "fixture-account", accountName: "示例老师", title: "示例作品：如何解释一个问题", multiple: 3, publishedAt: "2026-10-01", durationMs: 60000, counts: { likes: 300, favorites: 40, shares: 20, comments: 10 } };
  const card = { id: "fixture-account", name: "示例老师", platform: "DOUYIN", purpose: "teacher", trend: [], works: [work], baseline: { median: 100, samples: 5 }, highCount: 1, _count: { contentSnapshots: 5 }, lastSyncedAt: null, originalUrl: null, collectionRuns: [] };
  return { cards: state.populated ? [card] : [], works: state.populated ? [work] : [], days: 30, threshold: 2.5, bounded: false };
} }));
vi.mock("../server/research/read-model", () => ({ researchWorkInbox: async () => ({ items: [] }), researchHomeInputs: async () => ({ requestedAccounts: [], accountIds: [], accounts: [], trend: null, selectedMaterial: null }) }));
vi.mock("../server/research/service", () => ({ listResearchMaterials: async () => [], listResearchSessions: async () => [{ id: "saved", title: "已保存的研究" }] }));

async function home(params = {}) {
  const element = await NewResearch({ searchParams: Promise.resolve(params) });
  const children = await Promise.all(element.props.children.map(async (child: ReactNode) => {
    if (isValidElement<ComponentProps<typeof BenchmarkWorkspace>>(child) && child.type === BenchmarkWorkspace) return await BenchmarkWorkspace(child.props);
    return child;
  }));
  return renderToStaticMarkup(cloneElement(element, {}, ...children));
}

describe("research Lite layout", () => {
  it("links all three tools to existing routes and selects the current tool", () => {
    const markup = renderToStaticMarkup(createElement(ResearchTools, { active: "teacher" }));
    expect(markup).toContain('href="/research/benchmarks?purpose=reference"');
    expect(markup).toContain('href="/research/teardown"');
    expect(markup).toContain('href="/research/benchmarks?purpose=teacher" aria-current="page"');
  });
  it("shows the existing account workspace before optional question research and retains history", async () => {
    const markup = await home();
    expect(markup.indexOf("当前研究工作区")).toBeLessThan(markup.indexOf("围绕自己的问题研究"));
    expect(markup).toContain("老师 · 学方法");
    expect(markup).toContain("当前暂无匹配账号");
    expect(markup).toContain('href="/research/session/saved"');
    expect(markup).toContain('href="/projects"');
    expect(markup).not.toContain("xin-research-hero");
    expect(markup).not.toMatch(/class="research-lite-question" open/);
  });
  it("opens question research for existing material and template links", async () => {
    const markup = await home({ entry: "BREAKDOWN", material: "saved-material" });
    expect(markup).toMatch(/class="research-lite-question" open/);
    expect(markup).toContain("先添加要研究的内容");
  });
  it("retains filter names, values, purpose links and account import dialog", async () => {
    const markup = renderToStaticMarkup(await BenchmarkWorkspace({ searchParams: Promise.resolve({ purpose: "reference", period: "7", q: "示例", sort: "time" }) }));
    for (const field of ["period", "viral", "q", "platform", "accountId", "threshold", "sort", "purpose"]) expect(markup).toContain(`name="${field}"`);
    expect(markup).toContain('value="7" selected');
    expect(markup).toContain('name="purpose" value="reference"');
    expect(markup).toContain("teacher-import-dialog");
    expect(markup).toContain("定位已有账号");
    expect(markup).toContain("作品榜");
  });
  it("keeps read-only restrictions and offline limitations visible", async () => {
    state.canWrite = false;
    try {
      const markup = await home();
      expect(markup).toContain("当前账号没有添加老师 / 对标的权限");
      expect(markup).toContain("当前为只读权限");
      expect(markup).toContain("当前查看已保存的数据");
      expect(markup).not.toContain("teacher-import-dialog");
    } finally { state.canWrite = true; }
  });
  it("renders saved account statistics and work ranking without replacing their actions", async () => {
    state.populated = true;
    try {
      const markup = await home();
      expect(markup).toContain("示例老师");
      expect(markup).toContain("示例作品：如何解释一个问题");
      expect(markup).toContain("3.0×");
      expect(markup).toContain('href="/research/benchmarks/fixture-account"');
      expect(markup).toContain("/research/benchmarks/fixture-account/works/fixture-work?returnTo=");
      expect(markup).not.toContain("当前暂无匹配账号");
    } finally { state.populated = false; }
  });
  it.skipIf(!process.env.RESEARCH_LITE_PREVIEW)("checks local fixture layouts in both themes and saves previews", async () => {
    const { chromium } = await import("@playwright/test");
    const { readFile, mkdir, writeFile, unlink } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const output = resolve("output/research-v5-lite");
    await mkdir(output, { recursive: true });
    const css = await Promise.all(["apps/web/app/globals.css", "apps/web/app/apple-workbench.css", "apps/web/components/research/research.css", "apps/web/components/research/benchmark-workbench.css"].map(file => readFile(file, "utf8")));
    const markup = await home();
    const html = (theme: string) => `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>研究中心 · UI 示例预览</title><style>${css.join("\n").replace(/@(import|source)[^;]+;/g, "")}body{margin:0;font-family:'Microsoft YaHei',sans-serif}.research-center{display:block;min-height:0}.research-main-pane{margin:auto;padding:24px;max-width:1100px}</style></head><body data-theme="${theme}"><div class="apple-workspace-marker"></div><div class="research-center"><main class="research-main-pane">${markup}</main></div></body></html>`;
    await writeFile(resolve(output, "preview.html"), html("black-titanium"));
    const { execFileSync } = await import("node:child_process");
    const original = execFileSync("git", ["show", "HEAD:apps/web/app/(app)/research/new/page.tsx"], { encoding: "utf8" });
    const originalPath = resolve("apps/web/tests/.research-lite-before.tsx");
    await writeFile(originalPath, original);
    const originalPage = await import(originalPath).finally(() => unlink(originalPath));
    const beforeMarkup = renderToStaticMarkup(await originalPage.default({ searchParams: Promise.resolve({}) }));
    const visual = await readFile("apps/web/public/brand/experience/research.svg", "utf8");
    const beforeHtml = html("black-titanium").replace(markup, beforeMarkup).replace('src="/brand/experience/research.svg"', `src="data:image/svg+xml;base64,${Buffer.from(visual).toString("base64")}"`);
    await writeFile(resolve(output, "before.html"), beforeHtml);
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    try {
      const page = await browser.newPage();
      await page.setViewportSize({ width: 1440, height: 1000 });
      await page.setContent(beforeHtml);
      await page.screenshot({ path: resolve(output, "before-1440.png"), fullPage: true });
      for (const theme of ["black-titanium", "light"]) {
        for (const width of [1440, 768, 390]) {
          await page.setViewportSize({ width, height: 1000 });
          await page.setContent(html(theme));
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          expect(await page.getByRole("navigation", { name: "选择研究方向" }).getByRole("link").count()).toBe(3);
          await page.getByText("围绕自己的问题研究 · 添加资料与依据", { exact: true }).click();
          expect(await page.getByLabel("你想研究什么？", { exact: true }).isVisible()).toBe(true);
          await page.getByText("围绕自己的问题研究 · 添加资料与依据", { exact: true }).click();
          await page.locator(".teacher-more-filters > summary").click();
          expect(await page.getByRole("combobox", { name: "平台", exact: true }).isVisible()).toBe(true);
          expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
          await page.locator(".teacher-more-filters > summary").click();
          await page.screenshot({ path: resolve(output, `${theme}-${width}.png`), fullPage: true });
        }
      }
      state.populated = true;
      try {
        const populatedMarkup = await home();
        const populatedHtml = html("black-titanium").replace(markup, populatedMarkup);
        await writeFile(resolve(output, "populated.html"), populatedHtml);
        await page.setViewportSize({ width: 1440, height: 1000 });
        await page.setContent(populatedHtml);
        await page.screenshot({ path: resolve(output, "populated-1440.png"), fullPage: true });
      } finally { state.populated = false; }
    } finally { await browser.close(); }
  }, 60000);
});
