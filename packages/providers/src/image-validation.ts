import sharp from "sharp";

export class ImageValidationError extends Error {
  readonly code = "IMAGE_INVALID";

  constructor(message = "无法读取这张图片。") {
    super(message);
    this.name = "ImageValidationError";
  }
}

export async function validateImageBuffer(data: Uint8Array, expectedMimeType: string) {
  if (data.byteLength === 0) throw new ImageValidationError("图片为空。");
  try {
    const metadata = await sharp(Buffer.from(data), { limitInputPixels: 40_000_000 }).metadata();
    const format = metadata.format;
    const expectedFormat = expectedMimeType === "image/png" ? "png" : expectedMimeType === "image/webp" ? "webp" : "jpeg";
    if (format !== expectedFormat || !metadata.width || !metadata.height) throw new ImageValidationError();
    return { format, width: metadata.width, height: metadata.height };
  } catch (error) {
    if (error instanceof ImageValidationError) throw error;
    throw new ImageValidationError();
  }
}

export async function prepareVisionImage(data: Uint8Array) {
  return sharp(Buffer.from(data), { limitInputPixels: 40_000_000 })
    .rotate().resize({ width: 1600, height: 1600, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "white" }).jpeg({ quality: 85 }).toBuffer();
}
