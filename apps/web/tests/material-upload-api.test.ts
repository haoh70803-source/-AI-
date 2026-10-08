import { randomUUID } from "node:crypto";
import { afterAll, beforeAll, describe, expect, it, vi } from "vitest";
vi.mock("server-only", () => ({}));
const mocks = vi.hoisted(() => ({ context: vi.fn(), upload: vi.fn(async () => ({ data: {} })), delete: vi.fn(async () => ({})) }));
vi.mock("@/server/api-access", () => ({ getApiWorkspaceContext: mocks.context, apiError: (error: string, status: number) => Response.json({ error }, { status }) }));
vi.mock("@/server/source-upload", () => import("../server/source-upload"));
vi.mock("@/server/material-detail/understanding", () => import("../server/material-detail/understanding"));
vi.mock("@content-center/providers", async (original) => ({ ...await original<typeof import("@content-center/providers")>(), getStorageProvider: () => ({ upload: mocks.upload, delete: mocks.delete }) }));
import { db } from "@content-center/db";
import { POST } from "../app/api/source-items/upload/route";
import { POST as understand } from "../app/api/source-items/[id]/understanding/route";
import { materialPdf, tinyPng } from "./fixtures/material-files";

describe("Material upload API", () => {
  const userId = `material-upload-${randomUUID()}`;
  let workspaceId = "";
  beforeAll(async () => {
    await db.user.create({ data: { id: userId, name: "Uploader", email: `${userId}@example.test` } });
    workspaceId = (await db.workspace.create({ data: { name: "Upload gate", slug: userId, members: { create: { userId, role: "OWNER" } } } })).id;
    mocks.context.mockResolvedValue({ session: { user: { id: userId } }, workspace: { id: workspaceId }, role: "OWNER" });
  });
  afterAll(async () => { await db.workspace.delete({ where: { id: workspaceId } }); await db.user.delete({ where: { id: userId } }); await db.$disconnect(); });

  it("stores VIDEO, AUDIO, IMAGE, native PDF, scanned PDF, TEXT and Markdown without AI or transcription jobs", async () => {
    const form = new FormData();
    const files = [
      new File([new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50])], "clip.mp4", { type: "video/mp4" }),
      new File(["RIFF0000WAVE"], "audio.wav", { type: "audio/wav" }),
      new File([tinyPng], "image.png", { type: "image/png" }),
      new File([materialPdf(1, "Native PDF")], "native.pdf", { type: "application/pdf" }),
      new File([materialPdf()], "scan.pdf", { type: "application/pdf" }),
      new File(["Text original"], "text.txt", { type: "text/plain" }),
      new File(["# Markdown original"], "notes.md", { type: "text/markdown" }),
    ];
    files.forEach((file) => form.append("files", file));
    const response = await POST(new Request("http://localhost/api/source-items/upload", { method: "POST", body: form }));
    expect(response.status).toBe(202);
    const body = await response.json();
    expect(body.results).toHaveLength(7);
    expect(body.results.every((item: { status: string }) => item.status === "READY")).toBe(true);
    expect(body.results.find((item: { name: string }) => item.name === "scan.pdf").contentState).toBe("NO_TEXT");
    const sources = await db.sourceItem.findMany({ where: { workspaceId }, include: { assets: true } });
    expect(sources.every((source) => source.status === "READY" && source.assets[0]?.status === "STORED")).toBe(true);
    expect(await db.ingestJob.count({ where: { workspaceId } })).toBe(0);
    expect(await db.transcript.count({ where: { workspaceId } })).toBe(0);
    expect(await db.sourceUnderstanding.count({ where: { workspaceId } })).toBe(0);
    expect(await db.materialAnalysis.count({ where: { workspaceId } })).toBe(0);
  });

  it("fails safely on storage failure and denies upload/understanding for viewers", async () => {
    mocks.upload.mockRejectedValueOnce(new Error("storage offline"));
    const form = new FormData(); form.append("files", new File(["failed original"], "fail.txt", { type: "text/plain" }));
    expect((await POST(new Request("http://localhost/upload", { method: "POST", body: form }))).status).toBe(400);
    expect(await db.sourceItem.count({ where: { workspaceId, title: "fail" } })).toBe(0);
    mocks.context.mockResolvedValueOnce({ role: "VIEWER" });
    expect((await POST(new Request("http://localhost/upload", { method: "POST" }))).status).toBe(403);
    mocks.context.mockResolvedValueOnce({ role: "VIEWER" });
    expect((await understand(new Request("http://localhost/understanding", { method: "POST" }), { params: Promise.resolve({ id: "unknown" }) })).status).toBe(403);
  });
});
