import type { SourceType } from "./source-domain";

export type SourceCapability = "preview" | "download" | "understand" | "extractText" | "understandPages" | "transcribe" | "openOriginal" | "readExtractedText" | "read" | "edit" | "export";

export function sourceCapabilities(sourceType: SourceType, assetMimeType?: string | null): readonly SourceCapability[] {
  if (sourceType === "IMAGE") {
    const image = ["image/jpeg", "image/png", "image/gif", "image/webp"].includes(assetMimeType?.toLowerCase() ?? "");
    return image ? ["preview", "download", "understand"] : ["preview", "download"];
  }
  if (sourceType === "DOCUMENT") {
    if (assetMimeType?.toLowerCase() === "application/pdf") return ["preview", "extractText", "understandPages", "download"];
    if (assetMimeType?.toLowerCase() === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return ["extractText", "download"];
    return ["download"];
  }
  if (sourceType === "VIDEO" || sourceType === "AUDIO") return ["preview", "download", "transcribe"];
  if (sourceType === "URL") return ["openOriginal", "readExtractedText"];
  return ["read", "edit", "export"];
}

export function visionAvailability(capabilities: readonly SourceCapability[], model: { image: boolean } | null): "AVAILABLE" | "UNAVAILABLE" | "UNSUPPORTED" {
  if (!capabilities.includes("understand") && !capabilities.includes("understandPages")) return "UNSUPPORTED";
  return model?.image ? "AVAILABLE" : "UNAVAILABLE";
}
