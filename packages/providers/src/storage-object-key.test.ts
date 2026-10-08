import { describe, expect, it } from "vitest";
import { buildSourceAssetObjectKey } from "./storage-object-key";

describe("StorageObjectKeyBuilder", () => {
  it("scopes every source asset by workspace, source and asset IDs", () => {
    expect(buildSourceAssetObjectKey({ workspaceId: "workspace-1", sourceItemId: "source-1", assetId: "asset-1", assetType: "VIDEO", mimeType: "video/mp4" }))
      .toBe("workspaces/workspace-1/sources/source-1/assets/asset-1/original.mp4");
    expect(buildSourceAssetObjectKey({ workspaceId: "workspace-1", sourceItemId: "source-1", assetId: "asset-2", assetType: "AUDIO", mimeType: "audio/mpeg" }))
      .toBe("workspaces/workspace-1/sources/source-1/assets/asset-2/audio.mp3");
    expect(buildSourceAssetObjectKey({ workspaceId: "workspace-1", sourceItemId: "source-1", assetId: "asset-3", assetType: "IMAGE", mimeType: "image/png" }))
      .toBe("workspaces/workspace-1/sources/source-1/assets/asset-3/cover.png");
  });

  it("keeps document extensions in server-owned keys", () => {
    expect(buildSourceAssetObjectKey({ workspaceId: "workspace-1", sourceItemId: "source-1", assetId: "asset-4", assetType: "DOCUMENT", mimeType: "application/pdf" }))
      .toBe("workspaces/workspace-1/sources/source-1/assets/asset-4/original.pdf");
    expect(buildSourceAssetObjectKey({ workspaceId: "workspace-1", sourceItemId: "source-1", assetId: "asset-5", assetType: "DOCUMENT", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document" }))
      .toBe("workspaces/workspace-1/sources/source-1/assets/asset-5/original.docx");
  });

  it("rejects traversal and arbitrary path segments", () => {
    expect(() => buildSourceAssetObjectKey({ workspaceId: "workspace/../../other", sourceItemId: "source-1", assetId: "asset-1", assetType: "VIDEO" })).toThrow("INVALID_STORAGE_KEY_WORKSPACE_ID");
    expect(() => buildSourceAssetObjectKey({ workspaceId: "workspace-1", sourceItemId: "../source", assetId: "asset-1", assetType: "VIDEO" })).toThrow("INVALID_STORAGE_KEY_SOURCE_ITEM_ID");
    expect(() => buildSourceAssetObjectKey({ workspaceId: "workspace-1", sourceItemId: "source-1", assetId: "../../asset", assetType: "VIDEO" })).toThrow("INVALID_STORAGE_KEY_ASSET_ID");
  });
});
