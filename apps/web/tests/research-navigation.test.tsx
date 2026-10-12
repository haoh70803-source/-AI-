import { createElement, type ComponentProps, type ReactNode } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import { SidebarFoundation } from "../components/sidebar-foundation";
import { ResearchShell } from "../components/research/research-shell";
import { isResearchNavigationActive, isResearchPath, researchNavigation } from "../components/research/navigation";

const route = vi.hoisted(() => ({ pathname: "/research/teardown" }));
vi.mock("next/navigation", () => ({ usePathname: () => route.pathname }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: ComponentProps<"a">) => createElement("a", props, children) }));
vi.mock("../components/logout-button", () => ({ LogoutButton: () => null }));
vi.mock("../components/sidebar/new-project-dialog", () => ({ NewProjectDialog: () => null }));
vi.mock("../components/sidebar/project-sections", () => ({ SidebarProjectSections: () => null }));

const noop = () => undefined;
function sidebar(visualState: ComponentProps<typeof SidebarFoundation>["visualState"] = "PINNED_EXPANDED") {
  return createElement(SidebarFoundation, {
    visualState, hoverCapable: true,
    onPointerEnter: noop, onPointerLeave: noop, onTogglePinned: noop,
    onToggleTouch: noop, onCloseTouch: noop, onInteractionLockChange: noop,
    currentProjectId: null, activeNavigation: null,
    projectListView: { workspaceId: "preview", canCreateProject: false, canRenameProject: false, pinned: [], recent: [], folders: [], ungrouped: [] },
    onProjectListViewChange: noop, onRefreshProjectList: async () => undefined,
    userName: "导航预览", workspaceName: "本地预览", isSystemAdmin: false, accountRef: { current: null },
  });
}
function shell(children: ReactNode = null) {
  return createElement(ResearchShell, { sessions: [], children });
}

describe("research navigation", () => {
  it.each([
    ["/research", "/research"],
    ["/research/teardown", "/research/teardown"],
    ["/research/benchmarks/teacher/works/video", "/research/benchmarks"],
    ["/research/trends/topic", "/research/trends"],
    ["/research/results/run/report", "/research/results"],
    ["/research/sources/material", "/research/sources"],
    ["/research/session/private-session", "/research/new"],
    ["/research/focus/private-run", "/research/new"],
  ])("selects exactly one destination for %s", (pathname, href) => {
    expect(researchNavigation.filter(item => isResearchNavigationActive(pathname, item.href)).map(item => item.href)).toEqual([href]);
    expect(isResearchPath(pathname)).toBe(true);
  });

  it("has exactly five primary destinations and keeps review routes inside project navigation", () => {
    const markup = renderToStaticMarkup(sidebar());
    const main = markup.split('aria-label="主导航"')[1]!.split("</nav>")[0]!;
    expect([...main.matchAll(/href="([^"]+)"/g)].map(match => match[1])).toEqual(["/home", "/projects", "/library", "/research/new", "/library/methods"]);
    expect(main).not.toContain("内容审核");
    for (const path of ["/content-review", "/topics", "/projects/p/review/DOUYIN"]) {
      route.pathname = path; expect(renderToStaticMarkup(sidebar())).toMatch(/href="\/projects"[^>]*aria-current="page"/);
    }
  });
  it("hides the news discovery mode unless its authorization is supplied", () => {
    expect(renderToStaticMarkup(shell())).not.toContain('href="/research"');
    expect(renderToStaticMarkup(createElement(ResearchShell, { sessions: [], children: null, canReadNews: true }))).toContain('href="/research"');
  });
  it("does not select destinations that merely share a URL prefix", () => {
    for (const pathname of ["/researcher", "/research-old", "/research/teardown-old", "/research/results-old"]) {
      expect(researchNavigation.some(item => isResearchNavigationActive(pathname, item.href))).toBe(false);
    }
    expect(isResearchPath("/researcher")).toBe(false);
  });

  it("keeps research modes inside the workspace and selects its single primary entry", () => {
    route.pathname = "/research/teardown";
    const primary = renderToStaticMarkup(sidebar());
    expect(primary).toMatch(/href="\/research\/new"[^>]*aria-current="page"/);
    expect(primary).not.toContain('href="/research/teardown"');
    const workspace = renderToStaticMarkup(shell());
    expect(workspace).toMatch(/href="\/research\/teardown" aria-current="page"/);
    expect(workspace).toContain("作品拆解");
    const markup = renderToStaticMarkup(shell());
    for (const group of ["发现与收集", "分析与理解", "留存与应用"]) expect(markup).toContain(`aria-label="${group}"`);
  });

  it("selects research on deep report and saved-source routes", () => {
    for (const pathname of ["/research/benchmarks/teacher/works/video", "/research/sources/material", "/research/session/task"]) {
      route.pathname = pathname;
      expect(renderToStaticMarkup(sidebar())).toMatch(/href="\/research\/new"[^>]*aria-current="page"/);
    }
  });

  it.skipIf(!process.env.RESEARCH_NAVIGATION_PREVIEW)("keeps narrow layouts scrollable and renders a navigation preview", async () => {
    const { chromium } = await import("@playwright/test");
    const { readFile, mkdir, writeFile } = await import("node:fs/promises");
    const { resolve } = await import("node:path");
    const root = resolve(import.meta.dirname, "../../..");
    const output = resolve(root, "output/research-navigation-preview");
    await mkdir(output, { recursive: true });
    const css = await Promise.all([
      "apps/web/app/globals.css", "apps/web/components/app-shell.css", "apps/web/app/apple-workbench.css",
      "apps/web/components/research/research.css", "apps/web/components/research/teardown/teardown.css",
    ].map(file => readFile(resolve(root, file), "utf8")));
    route.pathname = "/research/teardown";
    const brand = await readFile(resolve(root, "apps/web/public/brand/xin-world-mark-dark.svg"), "utf8");
    const html = (width: number) => {
      const markup = renderToStaticMarkup(createElement("div", { className: "app-shell", "data-shell": "v4" },
        sidebar(width < 700 ? "COLLAPSED" : "PINNED_EXPANDED"), createElement("main", { className: "app-main" }, shell(createElement("article", { className: "teardown-workspace" },
          createElement("h1", null, "作品拆解"), createElement("p", null, "导航效果预览 · 未连接业务数据"))))));
      return `<!doctype html><html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><style>${css.join("\n").replace(/@import[^;]+;/g, "")}\nbody{margin:0;font-family:'Microsoft YaHei',sans-serif}a{text-decoration:none}button{font:inherit}</style></head><body data-theme="light">${markup.replace('/brand/xin-world-mark-dark.svg', `data:image/svg+xml;base64,${Buffer.from(brand).toString("base64")}`)}</body></html>`;
    };
    await writeFile(resolve(output, "navigation.html"), html(1440));
    const browser = await chromium.launch({ channel: "msedge", headless: true });
    try {
      const page = await browser.newPage();
      await page.route("**/*", route => route.abort());
      for (const width of [1440, 1024, 390]) {
        await page.setViewportSize({ width, height: 850 });
        await page.setContent(html(width));
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
        const navigation = page.getByRole("navigation", { name: "研究中心导航" });
        await navigation.getByRole("link", { name: "作品拆解", exact: true }).scrollIntoViewIfNeeded();
        expect(await navigation.getByRole("link", { name: "作品拆解", exact: true }).getAttribute("aria-current")).toBe("page");
        await navigation.getByRole("link", { name: "研究记录", exact: true }).scrollIntoViewIfNeeded();
        expect(await navigation.getByRole("link", { name: "研究记录", exact: true }).isVisible()).toBe(true);
        await navigation.getByRole("link", { name: "作品拆解", exact: true }).scrollIntoViewIfNeeded();
        await page.screenshot({ path: resolve(output, `navigation-${width}.png`) });
      }
    } finally { await browser.close(); }
  }, 30000);
});
