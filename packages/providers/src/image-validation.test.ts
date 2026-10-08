import sharp from "sharp";
import { describe, expect, it } from "vitest";
import { validateImageBuffer } from "./image-validation";

async function image(format: "jpeg" | "png" | "webp") {
  const pipeline = sharp({ create: { width: 2, height: 2, channels: 3, background: { r: 40, g: 100, b: 220 } } });
  return format === "jpeg" ? pipeline.jpeg().toBuffer() : format === "png" ? pipeline.png().toBuffer() : pipeline.webp().toBuffer();
}

describe("image validation", () => {
  it("decodes JPEG, PNG and WEBP", async () => {
    await expect(validateImageBuffer(await image("jpeg"), "image/jpeg")).resolves.toMatchObject({ format: "jpeg", width: 2, height: 2 });
    await expect(validateImageBuffer(await image("png"), "image/png")).resolves.toMatchObject({ format: "png", width: 2, height: 2 });
    await expect(validateImageBuffer(await image("webp"), "image/webp")).resolves.toMatchObject({ format: "webp", width: 2, height: 2 });
  });

  it("rejects corrupted image bytes", async () => {
    await expect(validateImageBuffer(new Uint8Array([1, 2, 3]), "image/png")).rejects.toMatchObject({ code: "IMAGE_INVALID" });
  });
});
