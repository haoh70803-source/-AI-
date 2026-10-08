import mammoth from "mammoth";

export class DocxTextExtractionError extends Error {
  readonly code = "DOCX_TEXT_EXTRACTION_FAILED";

  constructor(message = "无法读取这份 Word 文档的文字。") {
    super(message);
    this.name = "DocxTextExtractionError";
  }
}

function normalizeDocxText(value: string) {
  return value
    .replace(/\r/g, "")
    .split("\n")
    .map((line) => line.replace(/[\t ]+/g, " ").trim())
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

export async function extractDocxText(data: Uint8Array) {
  if (data.byteLength === 0) throw new DocxTextExtractionError("Word 文档为空。");
  try {
    const result = await mammoth.extractRawText({ buffer: Buffer.from(data) });
    const text = normalizeDocxText(result.value);
    if (!text) throw new DocxTextExtractionError();
    return text;
  } catch (error) {
    if (error instanceof DocxTextExtractionError) throw error;
    throw new DocxTextExtractionError();
  }
}
