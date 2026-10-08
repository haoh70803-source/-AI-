import { describe, expect, it } from "vitest";
import { extractPdfText, PdfTextExtractionError, renderPdfPreviewPage } from "./pdf-text";

function fixturePdf() {
  const objects = [
    "<< /Type /Catalog /Pages 2 0 R >>",
    "<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
    "<< /Type /Page /Parent 2 0 R /MediaBox [0 0 300 100] /Contents 4 0 R /Resources << /Font << /F1 5 0 R >> >> >>",
    "<< /Length 49 >>\nstream\nBT /F1 18 Tf 20 50 Td (PDF fixture text) Tj ET\nendstream",
    "<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
  ];
  let body = "%PDF-1.4\n";
  const offsets = [0];
  objects.forEach((object, index) => {
    offsets.push(Buffer.byteLength(body, "latin1"));
    body += `${index + 1} 0 obj\n${object}\nendobj\n`;
  });
  const xref = Buffer.byteLength(body, "latin1");
  body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets.slice(1).map((offset) => `${String(offset).padStart(10, "0")} 00000 n `).join("\n")}\ntrailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  return new TextEncoder().encode(body);
}

describe("PDF text extraction", () => {
  it("extracts text from a text PDF", async () => {
    await expect(extractPdfText(fixturePdf())).resolves.toContain("PDF fixture text");
  });

  it("rejects an empty PDF input", async () => {
    await expect(extractPdfText(new Uint8Array())).rejects.toBeInstanceOf(PdfTextExtractionError);
  });
});

describe("PDF preview pages", () => {
  it("renders a real PNG without browser PDF plugins", async () => { const result = await renderPdfPreviewPage(fixturePdf(), 1); expect(result.total).toBe(1); expect([...result.data.slice(0,8)]).toEqual([137,80,78,71,13,10,26,10]); });
  it("rejects missing pages without rendering another page", async () => { await expect(renderPdfPreviewPage(fixturePdf(), 2)).rejects.toThrow("PDF_PAGE_NOT_FOUND"); await expect(renderPdfPreviewPage(fixturePdf(), 0)).rejects.toThrow("PDF_PREVIEW_INVALID"); });
});
