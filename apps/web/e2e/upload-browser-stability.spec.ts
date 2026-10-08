import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { promisify } from "node:util";
import { randomUUID } from "node:crypto";
import { db } from "@content-center/db";
import { createContentIngestWorker, createTranscribeSourceWorker } from "@content-center/worker/queue";
import { expect, test, type Locator, type Page } from "@playwright/test";

const execFileAsync = promisify(execFile);
const email = `browser-upload-${randomUUID()}@example.test`;
const password = "safe-browser-upload-password";
let temporaryDirectory = "";
let audioPath = "";
let longAudioPath = "";
let videoPath = "";
let ingestWorker: ReturnType<typeof createContentIngestWorker>;
let transcriptionWorker: ReturnType<typeof createTranscribeSourceWorker>;

function filePayload(name: string, mimeType: string, buffer: Buffer) {
  return { name, mimeType, base64: buffer.toString("base64") };
}

async function dispatchFiles(page: Page, eventType: "dragenter" | "dragleave" | "drop", files: Array<{ name: string; mimeType: string; base64: string }>, targetSelector = "body") {
  await page.evaluate(({ eventType: type, files: payload, targetSelector: selector }) => {
    const target = document.querySelector(selector) ?? document.body;
    const transfer = new DataTransfer();
    for (const file of payload) {
      const bytes = Uint8Array.from(atob(file.base64), (character) => character.charCodeAt(0));
      transfer.items.add(new File([bytes], file.name, { type: file.mimeType }));
    }
    target.dispatchEvent(new DragEvent(type, { bubbles: true, cancelable: true, dataTransfer: transfer }));
  }, { eventType, files, targetSelector });
}

async function waitForReady(dialog: Locator, title: string) {
  await expect(dialog.getByText(title, { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect.poll(async () => dialog.innerText(), { timeout: 120_000 }).toContain("已准备好");
}

test.beforeAll(async () => {
  const health = await fetch("http://127.0.0.1:8765/health");
  expect(health.ok, "Local ASR must be running for browser upload E2E").toBe(true);
  temporaryDirectory = await mkdtemp(join(tmpdir(), "content-center-browser-upload-"));
  const root = process.cwd().endsWith(join("apps", "web")) ? resolve(process.cwd(), "../..") : process.cwd();
  audioPath = join(root, "services/local-asr/benchmark/audio/normal_zh.wav");
  longAudioPath = join(temporaryDirectory, "long.wav");
  videoPath = join(temporaryDirectory, "short.mp4");
  await execFileAsync("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-stream_loop", "4", "-i", audioPath, "-t", "30", "-c:a", "pcm_s16le", "-y", longAudioPath]);
  await execFileAsync("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=160x90:d=3", "-i", audioPath, "-shortest", "-c:v", "libx264", "-c:a", "aac", "-y", videoPath]);
  ingestWorker = createContentIngestWorker();
  transcriptionWorker = createTranscribeSourceWorker();
  await Promise.all([ingestWorker.waitUntilReady(), transcriptionWorker.waitUntilReady()]);
});

test.afterAll(async () => {
  await Promise.all([ingestWorker.close(), transcriptionWorker.close()]);
  const user = await db.user.findUnique({ where: { email }, select: { id: true } });
  if (user) {
    const workspace = await db.workspace.findFirst({ where: { members: { some: { userId: user.id } } }, select: { id: true } });
    if (workspace) {
      await db.workspace.delete({ where: { id: workspace.id } });
    }
    await db.user.delete({ where: { id: user.id } });
  }
  await db.$disconnect();
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test("confirms file chooser, drag/drop, multi-file and unsupported-file browser behavior", async ({ page }) => {
  test.setTimeout(180_000);
  await expect((await page.request.post("/api/internal-signup", { data: { name: "Browser Upload E2E Owner", email, password, inviteCode: "test-invite" } })).ok()).toBe(true);
  await expect((await page.request.post("/api/auth/sign-in/email", { data: { email, password } })).ok()).toBe(true);
  await page.goto("/library", { waitUntil: "domcontentloaded" });

  await page.getByRole("button", { name: "添加资料" }).first().click();
  const pickerDialog = page.getByRole("dialog");
  await expect(pickerDialog).toBeVisible();
  const chooserPromise = page.waitForEvent("filechooser");
  await pickerDialog.getByRole("button", { name: "选择文件" }).click();
  const chooser = await chooserPromise;
  await chooser.setFiles({ name: "picker.txt", mimeType: "text/plain", buffer: Buffer.from("file chooser browser E2E") });
  await waitForReady(pickerDialog, "picker.txt");
  await expect(pickerDialog.getByRole("status")).toContainText("已完成 1 份资料");
  await pickerDialog.getByRole("button", { name: "关闭" }).click();

  const dragText = filePayload("drag.txt", "text/plain", Buffer.from("drag and drop browser E2E"));
  await dispatchFiles(page, "dragenter", [dragText]);
  await expect(page.getByText("松开鼠标即可添加").first()).toBeVisible();
  await dispatchFiles(page, "dragenter", [dragText], ".project-library-page");
  await dispatchFiles(page, "dragleave", [dragText], ".project-library-page");
  await expect(page.getByText("松开鼠标即可添加").first()).toBeVisible();
  await dispatchFiles(page, "drop", [dragText]);
  await expect(page.getByText("松开鼠标即可添加").first()).toHaveCount(0);
  const dragDialog = page.getByRole("dialog");
  await waitForReady(dragDialog, "drag.txt");
  await dragDialog.getByRole("button", { name: "关闭" }).click();

  const audio = filePayload("drag.wav", "audio/wav", await readFile(longAudioPath));
  await dispatchFiles(page, "dragenter", [audio]);
  await dispatchFiles(page, "drop", [audio]);
  const audioDialog = page.getByRole("dialog");
  await expect.poll(async () => {
    const text = await audioDialog.innerText();
    return text.includes("已准备好");
  }, { timeout: 120_000 }).toBe(true);
  await audioDialog.getByRole("button", { name: "关闭" }).click();

  const multiA = filePayload("multi-a.txt", "text/plain", Buffer.from("multi A"));
  const multiB = filePayload("multi-b.md", "text/markdown", Buffer.from("# multi B"));
  await dispatchFiles(page, "dragenter", [multiA, multiB]);
  await dispatchFiles(page, "drop", [multiA, multiB]);
  const multiDialog = page.getByRole("dialog");
  await expect(multiDialog.getByText("multi-a.txt", { exact: true })).toBeVisible();
  await expect(multiDialog.getByText("multi-b.md", { exact: true })).toBeVisible();
  await expect(multiDialog.getByRole("status")).toContainText("已完成 2 份资料", { timeout: 120_000 });
  await multiDialog.getByRole("button", { name: "关闭" }).click();

  const unsupported = filePayload("unsupported.exe", "application/octet-stream", Buffer.from("not supported"));
  await dispatchFiles(page, "dragenter", [unsupported]);
  await dispatchFiles(page, "drop", [unsupported]);
  const unsupportedDialog = page.getByRole("dialog");
  await expect(unsupportedDialog.getByText("不支持这种文件。", { exact: true })).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText("松开鼠标即可添加").first()).toHaveCount(0);
});
