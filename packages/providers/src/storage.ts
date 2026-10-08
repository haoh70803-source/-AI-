export type {
  StorageAssetScope,
  StorageProvider,
  StorageSignedUrlOptions,
} from "./contracts";

export {
  getStorageProvider,
  minioStorageFromEnv,
  readS3CompatibleStorageConfig,
  S3CompatibleStorageProvider,
  storageHealthFromEnv,
} from "./s3-compatible-storage";
export type { S3CompatibleStorageConfig, StorageEnvironment } from "./s3-compatible-storage";

export {
  createMediaRelayToken,
  hasValidMediaRelayInternalAuthorization,
  readRenderMediaRelayConfig,
  readRenderMediaRelayConfigWithOptions,
  renderMediaRelayStorageFromEnv,
  RenderMediaRelayStorageProvider,
  verifyMediaRelayToken,
} from "./render-media-relay";
export type { MediaRelayTokenPayload, RenderMediaRelayStorageConfig } from "./render-media-relay";

export {
  buildSourceAssetObjectKey,
  StorageObjectKeyBuilder,
  storageObjectKeyBuilder,
} from "./storage-object-key";
export type { SourceAssetKeyInput } from "./storage-object-key";

export { resolveStoragePath, StoragePathSecurityError } from "./storage-path";
