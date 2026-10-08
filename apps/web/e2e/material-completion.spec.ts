import { randomUUID } from "node:crypto";
import { createServer, type Server } from "node:http";
import { db, ensurePersonalWorkspaceForUser } from "@content-center/db";
import { IntegrationService } from "@content-center/integrations";
import { getStorageProvider, prepareVisionImage } from "@content-center/providers";
import { expect, test, type BrowserContext, type Page } from "@playwright/test";
import { auth } from "../lib/auth";
import { materialPdf } from "../tests/fixtures/material-files";

let server: Server;
let workspaceId = "";
let userId = "";
let calls = 0;
let fail = false;
let cookies: Parameters<BrowserContext["addCookies"]>[0] = [];
test.beforeAll(async () => {
  server = createServer((request, response) => {
    let body = "";
    request.on("data", (chunk) => { body += String(chunk); });
    request.on("end", () => {
      calls++;
      const data = JSON.parse(body);
      const image = data.messages.at(-1).content.find((item: { type: string }) => item.type === "image_url");
      setTimeout(() => {
        if (fail || !data.stream || !image?.image_url?.url?.startsWith("data:image/")) {
          response.writeHead(400, { "content-type": "application/json" });
          response.end(JSON.stringify({ error: "fixture failure" }));
          return;
        }
        response.writeHead(200, { "content-type": "text/event-stream" });
        response.end(`data: ${JSON.stringify({ id: "vision-fixture", model: "deepseek-flash", choices: [{ delta: { content: "## 画面文字\n\nMaterial Gate 2026。\n\n| 项目 | 数量 |\n| --- | --- |\n| A | 12 |\n\n<script>alert(1)</script>\n\n![tracking](https://example.test/tracking.png)" }, finish_reason: "stop" }] })}\n\ndata: [DONE]\n\n`);
      }, 700);
    });
  });
  await new Promise<void>((resolve) => server.listen(0, "127.0.0.1", resolve));
  const address = server.address();
  if (!address || typeof address === "string") throw new Error("fixture unavailable");
  const response = await auth.api.signUpEmail({ body: { name: "Material gate", email: `material-gate-${randomUUID()}@example.test`, password: "material-gate-safe-password" }, asResponse: true });
  userId = (await response.clone().json() as { user: { id: string } }).user.id;
  workspaceId = (await ensurePersonalWorkspaceForUser(db, { userId })).id;
  cookies = response.headers.getSetCookie().map((value) => { const pair = value.split(";")[0]!; const index = pair.indexOf("="); return { name: pair.slice(0, index), value: pair.slice(index + 1), domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" as const }; });
  await new IntegrationService().saveIntegrationConfig({ workspaceId, userId, provider: "LLM", config: { provider: "DEEPSEEK", modelId: "deepseek-flash", baseUrl: `http://127.0.0.1:${address.port}/v1`, apiKey: "local-fixture-only" } });
});
test.afterAll(async () => {
  if (workspaceId) {
    const storage = getStorageProvider();
    const assets = await db.sourceAsset.findMany({ where: { workspaceId } });
    for (const asset of assets) if (asset.storageKey) await storage.delete(asset.storageKey, { workspaceId, sourceItemId: asset.sourceItemId, assetId: asset.id }).catch(() => undefined);
    await db.workspace.delete({ where: { id: workspaceId } });
  }
  if (userId) await db.user.delete({ where: { id: userId } });
  if (server) await new Promise<void>((resolve) => server.close(() => resolve()));
  await db.$disconnect();
});
async function upload(page: Page, name: string, mimeType: string, buffer: Buffer) {
  const response = await page.request.post("/api/source-items/upload", { multipart: { files: { name, mimeType, buffer } } });
  const body = await response.json();
  expect(response.status(), JSON.stringify(body)).toBe(202);
  expect(body.results[0].status).toBe("READY");
  return body.results[0].sourceItemId as string;
}

test("image understanding is explicit, readable, downloadable, searchable and recoverable", async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.context().addCookies(cookies);
  const picture = await prepareVisionImage(Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="1800" height="1100"><rect width="1800" height="1100" fill="white"/><text x="120" y="300" font-size="120">Material Gate 2026</text></svg>'));
  const id = await upload(page, "gate-image.jpg", "image/jpeg", picture);
  await page.goto(`/library/${id}`);
  await expect(page.getByTestId("source-workspace")).toHaveAttribute("data-ready", "true");
  await expect(page.getByRole("button", { name: "理解图片", exact: true })).toBeEnabled();
  await expect(page.locator(".source-viewer img")).toBeVisible();
  expect(calls).toBe(0);
  await page.getByRole("button", { name: "理解图片", exact: true }).click();
  await expect(page.getByRole("button", { name: "处理中…", exact: true })).toBeDisabled();
  await expect(page.locator(".source-text-content")).toContainText("Material Gate 2026");
  expect(calls).toBe(1);
  await expect(page.locator(".source-markdown h2")).toHaveText("画面文字");
  await expect(page.locator(".source-markdown table")).toBeVisible();
  await expect(page.locator(".source-markdown img, .source-markdown script")).toHaveCount(0);
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "TXT", exact: true }).click();
  expect((await download).suggestedFilename()).toContain("理解结果");
  fail = true;
  await page.getByRole("button", { name: "重新理解", exact: true }).click();
  await expect(page.getByRole("button", { name: "重试理解", exact: true })).toBeEnabled();
  await expect(page.locator(".source-text-content")).toContainText("Material Gate 2026");
  expect((await db.sourceItem.findUniqueOrThrow({ where: { id } })).status).toBe("READY");
  fail = false;
  await page.getByRole("button", { name: "重试理解", exact: true }).click();
  await expect(page.getByText("理解已完成", { exact: true })).toBeVisible();
  for (const width of [1920, 1440, 768, 390]) {
    await page.setViewportSize({ width, height: 900 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
    await expect.poll(() => page.locator(".source-workspace-actions").evaluate((bar) => [...bar.children].every((child) => child.getBoundingClientRect().right <= innerWidth))).toBe(true);
    await expect.poll(() => page.locator(".source-image-scroll").evaluate((viewport) => {
      const image = viewport.querySelector("img")!;
      const rect = image.getBoundingClientRect(); const box = viewport.getBoundingClientRect();
      return rect.width <= box.width + 1 && rect.height <= box.height + 1 && Math.abs(rect.width / rect.height - image.naturalWidth / image.naturalHeight) < .01;
    })).toBe(true);
  }
  await page.screenshot({ path: info.outputPath("image-mobile.png") });
  await page.goto("/library?search=Material%20Gate%202026");
  await expect(page.getByRole("heading", { name: "gate-image", exact: true })).toBeVisible();
  await db.integrationConfig.update({ where: { workspaceId_provider: { workspaceId, provider: "LLM" } }, data: { status: "DISABLED" } });
  await page.goto(`/library/${id}`);
  await expect(page.getByTestId("source-workspace")).toHaveAttribute("data-ready", "true");
  await expect(page.getByText("当前未配置可用的视觉模型。", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "重新理解", exact: true })).toBeDisabled();
  await db.integrationConfig.update({ where: { workspaceId_provider: { workspaceId, provider: "LLM" } }, data: { status: "CONFIGURED" } });
});

test("scanned PDF saves original, reads pages on demand and rejects excessive pages; TEXT retains its original", async ({ page }, info) => {
  test.setTimeout(120_000);
  await page.context().addCookies(cookies);
  const before = calls;
  const scan = await upload(page, "gate-scan.pdf", "application/pdf", materialPdf(2));
  await page.goto(`/library/${scan}`);
  await expect(page.getByTestId("source-workspace")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "提取正文", exact: true }).click();
  await expect(page.getByText("暂无可提取文字。原件已保存，可以主动理解页面。", { exact: true })).toBeVisible();
  await expect(page.getByTitle("PDF 原始文件")).toBeVisible();
  expect(calls).toBe(before);
  await page.getByRole("button", { name: "理解 PDF 页面", exact: true }).click();
  await expect(page.locator(".source-text-content")).toContainText("第 2 页");
  expect(calls).toBe(before + 2);
  await page.screenshot({ path: info.outputPath("pdf-understanding.png") });
  const tooMany = await upload(page, "gate-large.pdf", "application/pdf", materialPdf(5));
  await page.goto(`/library/${tooMany}`);
  await expect(page.getByTestId("source-workspace")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "理解 PDF 页面", exact: true }).click();
  await expect(page.getByRole("region", { name: "资料理解" }).getByRole("alert")).toContainText("一次最多处理 4 页");
  expect(calls).toBe(before + 2);
  const text = await upload(page, "gate-original.md", "text/markdown", Buffer.from("# Original Markdown\n保持原始文件"));
  await page.goto(`/library/${text}`);
  await expect(page.getByTestId("source-workspace")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "资料信息", exact: true }).click();
  await expect(page.getByRole("button", { name: "下载原文件", exact: true })).toBeVisible();
  const asset = await db.sourceAsset.findFirstOrThrow({ where: { sourceItemId: text } });
  const access = await page.request.get(`/api/source-items/${text}/assets/${asset.id}/access?disposition=attachment`);
  expect(access.ok()).toBe(true);
  const file = await page.request.get((await access.json()).url);
  expect((await file.body()).toString()).toContain("# Original Markdown");
});
