const MIME_EXTENSIONS: Record<string, string> = {
  "audio/mpeg": "mp3",
  "audio/mp4": "m4a",
  "audio/wav": "wav",
  "text/markdown": "md",
  "text/plain": "txt",
  "application/pdf": "pdf",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
  "image/gif": "gif",
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "video/mp4": "mp4",
  "video/quicktime": "mov",
  "video/webm": "webm",
};

export type SourceAssetKeyInput = {
  workspaceId: string;
  sourceItemId: string;
  assetId: string;
  assetType: "VIDEO" | "IMAGE" | "AUDIO" | "DOCUMENT";
  mimeType?: string;
};

function safeId(value: string, field: string) {
  if (!/^[A-Za-z0-9_-]+$/.test(value)) throw new Error(`INVALID_STORAGE_KEY_${field.toUpperCase()}`);
  return value;
}

function extensionFor(input: SourceAssetKeyInput) {
  const normalized = input.mimeType?.split(";", 1)[0]?.trim().toLowerCase();
  if (normalized && MIME_EXTENSIONS[normalized]) return MIME_EXTENSIONS[normalized];
  return input.assetType === "AUDIO" ? "mp3" : input.assetType === "IMAGE" ? "jpg" : input.assetType === "DOCUMENT" ? "bin" : "mp4";
}

export class StorageObjectKeyBuilder {
  sourceAsset(input: SourceAssetKeyInput) {
    const workspaceId = safeId(input.workspaceId, "workspace_id");
    const sourceItemId = safeId(input.sourceItemId, "source_item_id");
    const assetId = safeId(input.assetId, "asset_id");
    const name = input.assetType === "AUDIO" ? "audio" : input.assetType === "IMAGE" ? "cover" : "original";
    return `workspaces/${workspaceId}/sources/${sourceItemId}/assets/${assetId}/${name}.${extensionFor(input)}`;
  }
}

export const storageObjectKeyBuilder = new StorageObjectKeyBuilder();

export function buildSourceAssetObjectKey(input: SourceAssetKeyInput) {
  return storageObjectKeyBuilder.sourceAsset(input);
}
