import { createHash } from "node:crypto";
import { extname } from "node:path";
import { extractDocxText, extractPdfText, validateImageBuffer } from "@content-center/providers";

export const MAX_UPLOADS_PER_REQUEST = 10;

const LIMITS = {
  VIDEO: 50 * 1024 * 1024,
  AUDIO: 50 * 1024 * 1024,
  TEXT: 25 * 1024 * 1024,
  DOCUMENT: 25 * 1024 * 1024,
  IMAGE: 25 * 1024 * 1024,
} as const;

export type UploadedFileKind = keyof typeof LIMITS;

export type ValidatedUpload = {
  kind: UploadedFileKind;
  sourceType: "VIDEO" | "AUDIO" | "TEXT" | "DOCUMENT" | "IMAGE";
  assetType: "VIDEO" | "AUDIO" | "DOCUMENT" | "IMAGE";
  mimeType: string;
  originalName: string;
  title: string;
  bytes: Uint8Array;
  sha256: string;
  contentText?: string;
};

function normalizedName(name: string) {
  return name.replace(/[\\/]/g, "_").replaceAll(String.fromCharCode(0), "_").trim().slice(0, 240) || "未命名资料";
}

function titleOf(name: string) {
  const normalized = normalizedName(name);
  return normalized.replace(/\.[^.]+$/, "") || normalized;
}

function hasMagic(bytes: Uint8Array, text: string, offset = 0) {
  return [...text].every((character, index) => bytes[offset + index] === character.charCodeAt(0));
}

function hasFtyp(bytes: Uint8Array) {
  return hasMagic(bytes, "ftyp", 4);
}

function looksLikeMp3(bytes: Uint8Array) {
  return hasMagic(bytes, "ID3") || (bytes.length >= 2 && bytes[0] === 0xff && (bytes[1]! & 0xe0) === 0xe0);
}

function extension(name: string) {
  return extname(name).toLowerCase();
}

function declaredMimeAllowed(kind: UploadedFileKind, mime: string) {
  if (!mime || mime === "application/octet-stream") return true;
  if (kind === "VIDEO") return ["video/mp4", "video/quicktime"].includes(mime);
  if (kind === "AUDIO") return ["audio/mpeg", "audio/mp4", "audio/x-m4a", "audio/wav", "audio/x-wav", "audio/wave"].includes(mime);
  if (kind === "DOCUMENT") return ["application/pdf", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(mime);
  if (kind === "IMAGE") return ["image/jpeg", "image/jpg", "image/png", "image/webp"].includes(mime);
  return ["text/plain", "text/markdown", "text/x-markdown"].includes(mime);
}

function classify(name: string): { kind: UploadedFileKind; sourceType: ValidatedUpload["sourceType"]; assetType: ValidatedUpload["assetType"]; mimeType: string } | null {
  const ext = extension(name);
  if ([".mp4", ".mov"].includes(ext)) return { kind: "VIDEO", sourceType: "VIDEO", assetType: "VIDEO", mimeType: ext === ".mov" ? "video/quicktime" : "video/mp4" };
  if ([".mp3", ".wav", ".m4a"].includes(ext)) return { kind: "AUDIO", sourceType: "AUDIO", assetType: "AUDIO", mimeType: ext === ".mp3" ? "audio/mpeg" : ext === ".wav" ? "audio/wav" : "audio/mp4" };
  if (ext === ".pdf") return { kind: "DOCUMENT", sourceType: "DOCUMENT", assetType: "DOCUMENT", mimeType: "application/pdf" };
  if (ext === ".docx") return { kind: "DOCUMENT", sourceType: "DOCUMENT", assetType: "DOCUMENT", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" };
  if ([".jpg", ".jpeg", ".png", ".webp"].includes(ext)) return { kind: "IMAGE", sourceType: "IMAGE", assetType: "IMAGE", mimeType: ext === ".png" ? "image/png" : ext === ".webp" ? "image/webp" : "image/jpeg" };
  if (ext === ".txt" || ext === ".md" || ext === ".markdown") return { kind: "TEXT", sourceType: "TEXT", assetType: "DOCUMENT", mimeType: ext === ".txt" ? "text/plain" : "text/markdown" };
  return null;
}

export async function validateUploadedFile(file: File): Promise<ValidatedUpload> {
  const spec = classify(file.name);
  if (!spec) throw new Error("UNSUPPORTED_FILE_TYPE");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (bytes.byteLength === 0) throw new Error("EMPTY_FILE");
  if (bytes.byteLength > LIMITS[spec.kind]) throw new Error("FILE_TOO_LARGE");
  const declared = file.type.trim().toLowerCase();
  if (!declaredMimeAllowed(spec.kind, declared)) throw new Error("MIME_MISMATCH");
  if (spec.kind === "VIDEO" && !hasFtyp(bytes)) throw new Error("MIME_MISMATCH");
  if (spec.kind === "AUDIO" && !((extension(file.name) === ".wav" && hasMagic(bytes, "RIFF") && hasMagic(bytes, "WAVE", 8)) || (extension(file.name) === ".m4a" && hasFtyp(bytes)) || (extension(file.name) === ".mp3" && looksLikeMp3(bytes)))) throw new Error("MIME_MISMATCH");
  if (spec.kind === "DOCUMENT" && extension(file.name) === ".pdf" && !hasMagic(bytes, "%PDF-")) throw new Error("MIME_MISMATCH");
  if (spec.kind === "DOCUMENT" && extension(file.name) === ".docx" && !hasMagic(bytes, "PK\u0003\u0004")) throw new Error("MIME_MISMATCH");
  if (spec.kind === "IMAGE") {
    const validMagic = extension(file.name) === ".png"
      ? hasMagic(bytes, "\x89PNG\r\n\x1a\n")
      : extension(file.name) === ".webp"
        ? hasMagic(bytes, "RIFF") && hasMagic(bytes, "WEBP", 8)
        : bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!validMagic) throw new Error("MIME_MISMATCH");
  }
  let contentText: string | undefined;
  if (spec.kind === "TEXT") {
    try {
      contentText = new TextDecoder("utf-8", { fatal: true }).decode(bytes).replace(/^\uFEFF/u, "").trim();
    } catch {
      throw new Error("TEXT_ENCODING_UNSUPPORTED");
    }
    if (!contentText) throw new Error("EMPTY_FILE");
  }
  if (spec.kind === "DOCUMENT") {
    try {
      contentText = (await (extension(file.name) === ".pdf" ? extractPdfText(bytes) : extractDocxText(bytes))).trim();
    } catch {
      throw new Error(extension(file.name) === ".pdf" ? "PDF_INVALID" : "DOCX_TEXT_EMPTY");
    }
    if (!contentText && extension(file.name) !== ".pdf") throw new Error("DOCX_TEXT_EMPTY");
  }
  if (spec.kind === "IMAGE") {
    try {
      await validateImageBuffer(bytes, spec.mimeType);
    } catch {
      throw new Error("IMAGE_INVALID");
    }
  }
  return {
    ...spec,
    mimeType: spec.mimeType,
    originalName: normalizedName(file.name),
    title: titleOf(file.name),
    bytes,
    sha256: createHash("sha256").update(bytes).digest("hex"),
    contentText,
  };
}

export function uploadErrorMessage(code: string) {
  return {
    UPLOAD_TIMEOUT: "上传时间过长，已停止处理。请重新上传或重试。",
    UNSUPPORTED_FILE_TYPE: "不支持这种文件。",
    EMPTY_FILE: "文件为空。",
    FILE_TOO_LARGE: "文件太大：音视频最多 50 MB，文档和图片最多 25 MB。",
    MIME_MISMATCH: "文件内容与扩展名不匹配。",
    TEXT_ENCODING_UNSUPPORTED: "暂时只支持 UTF-8 文本文件。",
    PDF_INVALID: "无法打开这份 PDF，请检查文件是否损坏或已加密。",
    DOCX_TEXT_EMPTY: "无法读取这份 Word 文档的文字。",
    IMAGE_INVALID: "无法读取这张图片，请更换文件后重试。",
  }[code] ?? "上传失败，请重试。";
}

// Bound the body before multipart parsing, including requests without Content-Length.
export async function readUploadFormData(request: Request, maxBytes = 52 * 1024 * 1024, timeoutMs = 120_000) {
  request.signal.throwIfAborted();
  const declared = Number(request.headers.get("content-length"));
  if (Number.isFinite(declared) && declared > maxBytes) throw new Error("UPLOAD_BATCH_TOO_LARGE");
  if (!request.headers.get("content-type")?.toLowerCase().startsWith("multipart/form-data")) throw new Error("INVALID_UPLOAD_FORM");
  const reader = request.body?.getReader();
  if (!reader) throw new Error("INVALID_UPLOAD_FORM");
  const signal = AbortSignal.any([request.signal, AbortSignal.timeout(timeoutMs)]);
  const cancel = () => { void reader.cancel().catch(() => undefined); };
  signal.addEventListener("abort", cancel, { once: true });
  const chunks: Uint8Array[] = []; let size = 0;
  try {
    while (true) {
      signal.throwIfAborted();
      const { value, done } = await reader.read();
      signal.throwIfAborted();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) throw new Error("UPLOAD_BATCH_TOO_LARGE");
      chunks.push(value);
    }
  } finally { signal.removeEventListener("abort", cancel); await reader.cancel().catch(() => undefined); }
  return new Response(Buffer.concat(chunks), { headers: { "content-type": request.headers.get("content-type")! } }).formData();
}
