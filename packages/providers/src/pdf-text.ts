import { PDFParse } from "pdf-parse";
import { getData } from "pdf-parse/worker";

// The packaged data URL survives both server bundling and worker execution.
PDFParse.setWorker(getData());

export class PdfTextExtractionError extends Error {
  readonly code = "PDF_TEXT_EXTRACTION_FAILED";

  constructor(message = "PDF 正文读取失败。") {
    super(message);
    this.name = "PdfTextExtractionError";
  }
}

function normalizePdfText(value: string) {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export async function extractPdfText(data: Uint8Array) {
  if (data.byteLength === 0) throw new PdfTextExtractionError("PDF 文件为空。");
  const parser = new PDFParse({ data: Buffer.from(data) });
  try {
    const result = await parser.getText({ pageJoiner: "" });
    return normalizePdfText(result.text);
  } catch {
    throw new PdfTextExtractionError();
  } finally {
    await parser.destroy();
  }
}

// Render every page or reject explicitly; never silently truncate a document.
export async function renderPdfForUnderstanding(data: Uint8Array) {
  if (data.byteLength > 25 * 1024 * 1024) throw new Error("VISION_FILE_TOO_LARGE");
  const parser = new PDFParse({ data: Buffer.from(data) });
  try {
    const info = await parser.getInfo({ parsePageInfo: true });
    if (!info.total || info.total > 4) throw new Error("VISION_PAGE_LIMIT");
    const pages: Array<{ page: number; data: Uint8Array }> = [];
    let bytes = 0;
    for (let page = 1; page <= info.total; page++) {
      const dimensions = info.pages.find((item) => item.pageNumber === page);
      if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) throw new Error("VISION_PDF_INVALID");
      const result = await parser.getScreenshot({ partial: [page], scale: Math.min(2, 1600 / Math.max(dimensions.width, dimensions.height)), imageDataUrl: false, imageBuffer: true });
      const screenshot = result.pages[0];
      if (!screenshot?.data.length) throw new Error("VISION_PDF_INVALID");
      bytes += Math.ceil(screenshot.data.byteLength / 3) * 4;
      if (bytes > 12 * 1024 * 1024) throw new Error("VISION_PAYLOAD_LIMIT");
      pages.push({ page, data: screenshot.data });
    }
    return pages;
  } finally {
    await parser.destroy();
  }
}

/** Single-page display rendering, independent of browser PDF plugins and AI. */
export async function renderPdfPreviewPage(data: Uint8Array, page: number) {
  if (!data.byteLength || data.byteLength > 25 * 1024 * 1024 || !Number.isInteger(page) || page < 1) throw new Error("PDF_PREVIEW_INVALID");
  const parser = new PDFParse({ data: Buffer.from(data) });
  try {
    const info = await parser.getInfo({ parsePageInfo: true });
    if (page > info.total) throw new Error("PDF_PAGE_NOT_FOUND");
    const dimensions = info.pages.find(item => item.pageNumber === page);
    if (!dimensions || dimensions.width <= 0 || dimensions.height <= 0) throw new Error("PDF_PREVIEW_INVALID");
    const image = await parser.getScreenshot({ partial: [page], scale: Math.min(2, 1600 / Math.max(dimensions.width, dimensions.height)), imageDataUrl: false, imageBuffer: true });
    if (!image.pages[0]?.data.length) throw new Error("PDF_PREVIEW_INVALID");
    return { data: image.pages[0].data, page, total: info.total };
  } finally { await parser.destroy(); }
}
