import { describe, expect, it } from "vitest";
import { sourceUploadStatusLabel } from "../lib/source-upload-client";
import { readUploadFormData, uploadErrorMessage, validateUploadedFile } from "../server/source-upload";
import { materialPdf } from "./fixtures/material-files";

describe("source upload validation", () => {
  it("reads UTF-8 TXT into source content", async () => {
    const file = new File([new TextEncoder().encode("这是一段可交给 LLM 的正文。")], "notes.txt", { type: "text/plain" });
    await expect(validateUploadedFile(file)).resolves.toMatchObject({ kind: "TEXT", sourceType: "TEXT", assetType: "DOCUMENT", contentText: "这是一段可交给 LLM 的正文。", mimeType: "text/plain" });
  });

  it("rejects malformed office files and empty files", async () => {
    await expect(validateUploadedFile(new File(["x"], "notes.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))).rejects.toThrow("MIME_MISMATCH");
    await expect(validateUploadedFile(new File([], "notes.txt", { type: "text/plain" }))).rejects.toThrow("EMPTY_FILE");
    expect(uploadErrorMessage("PDF_INVALID")).toContain("损坏");
  });

  it("checks a media magic header instead of trusting browser MIME", async () => {
    const fakeMp4 = new Uint8Array([0, 0, 0, 24, 102, 116, 121, 112, 109, 112, 52, 50]);
    await expect(validateUploadedFile(new File([fakeMp4], "clip.mp4", { type: "video/mp4" }))).resolves.toMatchObject({ kind: "VIDEO", assetType: "VIDEO" });
    await expect(validateUploadedFile(new File([new TextEncoder().encode("not a video")], "clip.mp4", { type: "video/mp4" }))).rejects.toThrow("MIME_MISMATCH");
  });

  it("preserves PDFs without a text layer and extracts native text without page markers", async () => {
    await expect(validateUploadedFile(new File([materialPdf()], "scan.pdf", { type: "application/pdf" }))).resolves.toMatchObject({ sourceType: "DOCUMENT", contentText: "" });
    await expect(validateUploadedFile(new File([materialPdf(1, "Native text")], "text.pdf", { type: "application/pdf" }))).resolves.toMatchObject({ contentText: "Native text" });
    await expect(validateUploadedFile(new File(["%PDF-invalid"], "broken.pdf", { type: "application/pdf" }))).rejects.toThrow("PDF_INVALID");
  });

  it("accepts decoded PNG images and validates DOCX signatures", async () => {
    const png = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=", "base64");
    await expect(validateUploadedFile(new File([png], "cover.png", { type: "image/png" }))).resolves.toMatchObject({ kind: "IMAGE", sourceType: "IMAGE", assetType: "IMAGE", mimeType: "image/png" });
    await expect(validateUploadedFile(new File([new Uint8Array([80, 75, 3, 4, 1])], "brief.docx", { type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))).rejects.toThrow("DOCX_TEXT_EMPTY");
  });

  it("shows upload success before and after background reading", () => {
    expect(sourceUploadStatusLabel({ status: "QUEUED", processingStatus: "QUEUED" })).toBe("已上传，正在读取");
    expect(sourceUploadStatusLabel({ status: "QUEUED", processingStatus: "SUCCEEDED" })).toBe("已准备好");
    expect(sourceUploadStatusLabel({ status: "QUEUED", processingStatus: "FAILED" })).toBe("上传成功 · 读取失败");
  });
});

describe("bounded upload request", () => {
  it("reads an ordinary multipart form", async () => {
    const form = new FormData(); form.append("files", new File(["hello"], "note.txt"));
    const parsed = await readUploadFormData(new Request("http://localhost/upload", {method:"POST",body:form}));
    expect((parsed.get("files") as File).name).toBe("note.txt");
  });
  it("rejects oversized declared and chunked bodies before parsing", async () => {
    const form = new FormData(); form.append("files", new File(["x".repeat(256)], "note.txt"));
    const encoded = new Response(form);
    const bytes = await encoded.arrayBuffer();
    await expect(readUploadFormData(new Request("http://localhost/upload", {method:"POST",body:bytes,headers:encoded.headers}),128)).rejects.toThrow("UPLOAD_BATCH_TOO_LARGE");
    await expect(readUploadFormData(new Request("http://localhost/upload", {method:"POST",body:"x",headers:{"content-length":"999","content-type":"multipart/form-data; boundary=x"}}),128)).rejects.toThrow("UPLOAD_BATCH_TOO_LARGE");
  });
});

it('cancels a stalled request body after the upload deadline', async () => {
  let cancelled = false;
  const body = new ReadableStream({ cancel() { cancelled = true; } });
  const request = new Request('http://localhost/upload', { method: 'POST', body, headers: { 'content-type': 'multipart/form-data; boundary=test' }, duplex: 'half' } as RequestInit);
  await expect(readUploadFormData(request, 1024, 20)).rejects.toMatchObject({ name: 'TimeoutError' });
  expect(cancelled).toBe(true);
});
