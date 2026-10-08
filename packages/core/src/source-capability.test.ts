import { describe, expect, it } from "vitest";
import { sourceCapabilities, visionAvailability } from "./source-capability";

describe("source capabilities", () => {
  it("maps source type and document MIME without assuming a configured provider", () => {
    expect(sourceCapabilities("IMAGE", "image/png")).toEqual(["preview", "download", "understand"]);
    expect(sourceCapabilities("IMAGE", "application/octet-stream")).toEqual(["preview", "download"]);
    expect(sourceCapabilities("DOCUMENT", "application/pdf")).toEqual(["preview", "extractText", "understandPages", "download"]);
    expect(sourceCapabilities("DOCUMENT", "application/vnd.openxmlformats-officedocument.wordprocessingml.document")).toEqual(["extractText", "download"]);
    expect(sourceCapabilities("VIDEO")).toEqual(["preview", "download", "transcribe"]);
    expect(sourceCapabilities("AUDIO")).toEqual(["preview", "download", "transcribe"]);
    expect(sourceCapabilities("URL")).toEqual(["openOriginal", "readExtractedText"]);
    expect(sourceCapabilities("TEXT")).toEqual(["read", "edit", "export"]);
  });

  it("keeps intrinsic visual support separate from current model availability", () => {
    const image = sourceCapabilities("IMAGE", "image/jpeg");
    expect(visionAvailability(image, null)).toBe("UNAVAILABLE");
    expect(visionAvailability(image, { image: false })).toBe("UNAVAILABLE");
    expect(visionAvailability(image, { image: true })).toBe("AVAILABLE");
    expect(visionAvailability(sourceCapabilities("TEXT"), { image: true })).toBe("UNSUPPORTED");
  });
});
