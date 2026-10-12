import { act, createElement, type ComponentProps } from "react";
import { createRoot } from "react-dom/client";
import { renderToStaticMarkup } from "react-dom/server";
import { createRequire } from "node:module";
import { readFile, mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { chromium } from "@playwright/test";
import { expect, it, vi } from "vitest";
import { AppShell } from "../components/app-shell";

vi.mock("next/navigation", () => ({ usePathname: () => "/home", useSearchParams: () => new URLSearchParams() }));
vi.mock("next/link", () => ({ default: ({ children, ...props }: ComponentProps<"a">) => createElement("a", props, children) }));
vi.mock("../components/logout-button", () => ({ LogoutButton: () => null }));
vi.mock("../components/global-search", () => ({ GlobalSearch: () => null }));
vi.mock("../components/sidebar/new-project-dialog", () => ({ NewProjectDialog: () => null }));
vi.mock("../components/sidebar/project-sections", () => ({ SidebarProjectSections: () => null }));

const props = {
  userName: "布局预览", workspaceName: "隔离预览", isSystemAdmin: false, initialPinned: false,
  initialProjectListView: { workspaceId: "preview", canCreateProject: false, canRenameProject: false, pinned: [], recent: [], folders: [], ungrouped: [] },
};

it("opens help from the sidebar, preserves fullscreen failures and closes with Escape", async () => {
  const { JSDOM } = createRequire(import.meta.url)("jsdom") as { JSDOM: new (html: string, options: { url: string }) => { window: Window & typeof globalThis } };
  const dom = new JSDOM('<div id="root"></div>', { url: "http://localhost" });
  vi.stubGlobal("window", dom.window);
  vi.stubGlobal("document", dom.window.document);
  vi.stubGlobal("Element", dom.window.Element);
  vi.stubGlobal("IS_REACT_ACT_ENVIRONMENT", true);
  dom.window.matchMedia = vi.fn().mockReturnValue({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() });
  dom.window.requestAnimationFrame = vi.fn();
  const root = createRoot(document.getElementById("root")!);
  try {
    await act(async () => root.render(createElement(AppShell, props)));
    expect(document.querySelector(".xsj-app-topbar")).toBeNull();
    const help = document.querySelector<HTMLButtonElement>(".app-sidebar-help")!;
    await act(async () => help.click());
    expect(help.getAttribute("aria-expanded")).toBe("true");
    expect(document.getElementById("app-shell-help-menu")?.textContent).toContain("展开侧栏");
    const fullscreen = [...document.querySelectorAll("#app-shell-help-menu button")].find(button => button.textContent === "切换全屏") as HTMLButtonElement;
    await act(async () => fullscreen.click());
    expect(document.querySelector('[role="status"]')?.textContent).toContain("当前浏览器不支持全屏");
    await act(async () => help.click());
    await act(async () => window.dispatchEvent(new dom.window.KeyboardEvent("keydown", { key: "Escape" })));
    expect(document.getElementById("app-shell-help-menu")).toBeNull();
    expect(help.getAttribute("aria-expanded")).toBe("false");
    await act(async () => help.click());
    const toggle = [...document.querySelectorAll("#app-shell-help-menu button")].find(button => button.textContent === "展开侧栏") as HTMLButtonElement;
    await act(async () => toggle.click());
    expect(document.querySelector(".xsj-app-sidebar.is-pinned")).not.toBeNull();
    expect(document.cookie).toContain("xsj_sidebar_pinned=1");
  } finally {
    await act(async () => root.unmount());
    dom.window.close();
    vi.unstubAllGlobals();
  }
});

it("starts content at the top and leaves sidebar icons unobstructed in both themes", async () => {
  const taskRoot = resolve(import.meta.dirname, "../../..");
  const output = resolve(taskRoot, "output/remove-topbar");
  await mkdir(output, { recursive: true });
  const css = (await Promise.all([
    "apps/web/app/globals.css", "apps/web/components/product-v3.css", "apps/web/app/black-titanium.css", "apps/web/app/apple-workbench.css", "apps/web/components/app-shell.css",
  ].map(file => readFile(resolve(taskRoot, file), "utf8")))).join("\n").replace(/@import[^;]+;/g, "");
  const brand = await readFile(resolve(taskRoot, "apps/web/public/brand/xin-world-mark-dark.svg"), "utf8");
  const browser = await chromium.launch({ channel: "msedge", headless: true });
  try {
    const page = await browser.newPage();
    await page.route("**/*", route => route.abort());
    for (const theme of ["black-titanium", "light"]) for (const width of [390, 1024, 1440, 2494]) for (const pinned of [false, true]) {
      await page.setViewportSize({ width, height: 850 });
      const markup = renderToStaticMarkup(createElement("div", { className: "app-shell", "data-shell": "v4" },
        createElement(AppShell, { ...props, initialPinned: pinned }),
        createElement("main", { id: "main-content", className: "app-main" }, createElement("h1", null, "项目工作台"))));
      await page.setContent(`<html><head><style>${css}\nbody{margin:0}h1{margin:0}</style></head><body data-theme="${theme}">${markup.replace('/brand/xin-world-mark-dark.svg', `data:image/svg+xml;base64,${Buffer.from(brand).toString("base64")}`)}</body></html>`);
      expect(await page.locator(".xsj-app-topbar").count()).toBe(0);
      expect((await page.locator(".app-main").boundingBox())?.y).toBe(0);
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
      if (width > 700) {
        const sidebar = await page.locator(".xsj-app-sidebar").boundingBox();
        expect((await page.locator(".app-main").boundingBox())?.x).toBe(sidebar!.width);
        const icon = await page.getByRole("link", { name: "首页", exact: true }).boundingBox();
        expect(await page.evaluate(({ x, y }) => Boolean(document.elementFromPoint(x, y)?.closest('.app-sidebar-navigation > a[href="/home"]')), { x: icon!.x + icon!.width / 2, y: icon!.y + icon!.height / 2 })).toBe(true);
        await page.screenshot({ path: resolve(output, `${theme}-${width}-${pinned ? "expanded" : "collapsed"}.png`) });
      } else {
        await page.locator(".app-sidebar-account").evaluate(element => element.setAttribute("open", ""));
        expect(await page.locator(".app-account-help").isVisible()).toBe(true);
      }
    }
  } finally { await browser.close(); }
}, 60000);
