import { execFile } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { basename, join, resolve } from "node:path";
import { promisify } from "node:util";
import { db } from "@content-center/db";
import { minioStorageFromEnv } from "@content-center/providers";
import { createContentIngestWorker, createTranscribeSourceWorker } from "@content-center/worker/queue";
import { expect, test } from "@playwright/test";
import JSZip from "jszip";

const execFileAsync = promisify(execFile);
const runId = randomUUID();
const email = `source-inputs-${runId}@example.test`;
const password = "safe-e2e-password";
let temporaryDirectory = "";
let videoPath = "";
let audioPath = "";
let ingestWorker: ReturnType<typeof createContentIngestWorker>;
let transcriptionWorker: ReturnType<typeof createTranscribeSourceWorker>;

function pdfFixture() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "<< /Length 49 >>\nstream\nBT /F1 18 Tf 20 50 Td (P4.6 PDF fixture) Tj ET\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => { offsets.push(Buffer.byteLength(body, "latin1")); body += `${index + 1} 0 obj\n${object}\nendobj\n`; });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return Buffer.from(body, "latin1");
}

async function docxFixture() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>这是 P4.7 DOCX 正文。</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: "nodebuffer" });
}

function pngFixture() {
  return Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
}

async function waitForSource(title: string, requireContent = true) {
  let sourceId = "";
  await expect.poll(async () => {
    const source = await db.sourceItem.findFirst({ where: { workspace: { members: { some: { user: { email } } } }, title }, select: { id: true, status: true, rawText: true } });
    sourceId = source?.id ?? "";
    return source?.status === "READY" && (!requireContent || Boolean(source.rawText?.trim()));
  }, { timeout: 60_000 }).toBe(true);
  return sourceId;
}

test.beforeAll(async () => {
  const health = await fetch("http://127.0.0.1:8765/health");
  expect(health.ok, "Local ASR must be running for source input E2E").toBe(true);
  temporaryDirectory = await mkdtemp(join(tmpdir(), "content-center-source-inputs-"));
  const root = process.cwd().endsWith(join("apps", "web")) ? resolve(process.cwd(), "../..") : process.cwd();
  audioPath = join(root, "services/local-asr/benchmark/audio/normal_zh.wav");
  videoPath = join(temporaryDirectory, "short.mp4");
  await execFileAsync("ffmpeg", ["-nostdin", "-hide_banner", "-loglevel", "error", "-f", "lavfi", "-i", "color=c=black:s=160x90:d=7", "-i", audioPath, "-shortest", "-c:v", "libx264", "-c:a", "aac", "-y", videoPath]);
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
      const assets = await db.sourceAsset.findMany({ where: { workspaceId: workspace.id }, select: { storageKey: true } });
      for (const asset of assets) if (asset.storageKey) await minioStorageFromEnv().delete(asset.storageKey);
      await db.workspace.delete({ where: { id: workspace.id } });
    }
    await db.user.delete({ where: { id: user.id } });
  }
  await db.$disconnect();
  await rm(temporaryDirectory, { recursive: true, force: true });
});

test("uploads TXT, PDF, DOCX, audio, video and image through one file entry", async ({ page }) => {
  test.setTimeout(180_000);
  await expect((await page.request.post("/api/internal-signup", { data: { name: "Source Input E2E Owner", email, password, inviteCode: "test-invite" } })).ok()).toBe(true);
  await expect((await page.request.post("/api/auth/sign-in/email", { data: { email, password } })).ok()).toBe(true);
  await page.goto("/library", { waitUntil: "networkidle" });

  async function upload(name: string, value: string | { name: string; mimeType: string; buffer: Buffer }) {
    const file = typeof value === "string" ? { name: basename(value), mimeType: value.endsWith(".wav") ? "audio/wav" : "video/mp4", buffer: await readFile(value) } : value;
    const response = await page.request.post("/api/source-items/upload", { multipart: { files: file } });
    const body = await response.json();
    expect(response.status(), JSON.stringify(body)).toBe(202);
    expect(["QUEUED", "READY"]).toContain(body.results?.[0]?.status);
    return waitForSource(name, typeof value !== "string");
  }

  await upload("notes", { name: "notes.txt", mimeType: "text/plain", buffer: Buffer.from("这是 TXT 资料正文，应该直接进入统一内容读取和 LLM 分析输入。") });
  await upload("brief", { name: "brief.md", mimeType: "text/markdown", buffer: Buffer.from("# Markdown\n\n这是 Markdown 正文。") });
  await upload("P4.6 PDF fixture", { name: "P4.6 PDF fixture.pdf", mimeType: "application/pdf", buffer: pdfFixture() });
  await upload("P4.7 DOCX fixture", { name: "P4.7 DOCX fixture.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: await docxFixture() });

  const imageResponse = await page.request.post("/api/source-items/upload", { multipart: { files: { name: "cover.png", mimeType: "image/png", buffer: pngFixture() } } });
  const imageBody = await imageResponse.json();
  expect(imageResponse.status(), JSON.stringify(imageBody)).toBe(202);
  expect(imageBody.results?.[0]?.status).toBe("READY");
  const imageSourceId = await waitForSource("cover", false);
  const imageAsset = await db.sourceAsset.findFirst({ where: { sourceItemId: imageSourceId, assetType: "IMAGE" }, select: { id: true } });
  expect(imageAsset).not.toBeNull();
  const imageAccess = await page.request.get(`/api/source-items/${imageSourceId}/assets/${imageAsset!.id}/access?disposition=inline`);
  expect(imageAccess.ok()).toBe(true);
  await page.goto(`/library/${imageSourceId}`, { waitUntil: "domcontentloaded" });
  await expect(page.locator(".source-viewer img").first()).toBeVisible();
  await page.getByRole("button", { name: "资料信息" }).click();
  await expect(page.getByRole("dialog", { name: "资料信息" }).getByRole("button", { name: "开始转录" })).toHaveCount(0);

  const audioSourceId = await upload("normal_zh", audioPath);
  expect(await db.ingestJob.count({ where: { sourceItemId: audioSourceId, jobType: "TRANSCRIBE" } })).toBe(0);
  await expect(db.transcript.findUnique({ where: { sourceItemId: audioSourceId } })).resolves.toBeNull();
  await page.goto(`/library/${audioSourceId}`);
  await expect(page.getByTestId("source-workspace")).toHaveAttribute("data-ready", "true");
  const audioRail = page.getByRole("region", { name: "转录状态" });
  await expect(audioRail.getByText("未转录", { exact: true })).toBeVisible();
  await audioRail.getByRole("button", { name: "开始转录" }).click();
  await expect.poll(async () => (await db.transcript.findUnique({ where: { sourceItemId: audioSourceId }, select: { provider: true, fullText: true } }))?.provider === "LOCAL_FUNASR", { timeout: 120_000 }).toBe(true);
  expect(await db.materialAnalysis.count({ where: { sourceItemId: audioSourceId } })).toBe(0);
  await page.reload();
  await expect(page.getByTestId("source-workspace")).toHaveAttribute("data-ready", "true");
  await page.getByRole("button", { name: "资料信息" }).click();
  await expect(page.getByRole("dialog", { name: "资料信息" }).getByText("已完成", { exact: true }).first()).toBeVisible();

  const videoSourceId = await upload("short", videoPath);
  expect(await db.ingestJob.count({ where: { sourceItemId: videoSourceId, jobType: "TRANSCRIBE" } })).toBe(0);
  await expect(db.transcript.findUnique({ where: { sourceItemId: videoSourceId } })).resolves.toBeNull();
  await page.goto(`/library/${videoSourceId}`);
  await expect(page.getByTestId("source-workspace")).toHaveAttribute("data-ready", "true");
  const videoRail = page.getByRole("region", { name: "转录状态" });
  await expect(videoRail.getByText("未转录", { exact: true })).toBeVisible();
  await videoRail.getByRole("button", { name: "开始转录" }).click();
  await expect.poll(async () => (await db.transcript.findUnique({ where: { sourceItemId: videoSourceId }, select: { provider: true, fullText: true } }))?.provider === "LOCAL_FUNASR", { timeout: 120_000 }).toBe(true);
  expect(await db.materialAnalysis.count({ where: { sourceItemId: videoSourceId } })).toBe(0);
  expect(await db.apiUsage.count({ where: { provider: "DOUBAO_ASR", workspace: { members: { some: { user: { email } } } } } })).toBe(0);
});
