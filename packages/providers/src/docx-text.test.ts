import JSZip from "jszip";
import { describe, expect, it } from "vitest";
import { extractDocxText } from "./docx-text";

async function docxFixture(text: string) {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  zip.file("word/document.xml", `<?xml version="1.0" encoding="UTF-8"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>${text}</w:t></w:r></w:p></w:body></w:document>`);
  return zip.generateAsync({ type: "uint8array" });
}

describe("DOCX text extraction", () => {
  it("extracts readable paragraph text", async () => {
    await expect(extractDocxText(await docxFixture("这是一段 Word 正文。"))).resolves.toContain("这是一段 Word 正文");
  });

  it("rejects corrupted and empty documents", async () => {
    await expect(extractDocxText(new Uint8Array())).rejects.toMatchObject({ code: "DOCX_TEXT_EXTRACTION_FAILED" });
    await expect(extractDocxText(new Uint8Array([80, 75, 3, 4, 1]))).rejects.toMatchObject({ code: "DOCX_TEXT_EXTRACTION_FAILED" });
  });
});
