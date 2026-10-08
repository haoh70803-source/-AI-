/** @deprecated Storage is S3-compatible; use `s3-compatible-storage` exports. */
export {
  minioStorageFromEnv,
  S3CompatibleStorageProvider as MinioStorageProvider,
  type S3CompatibleStorageConfig as MinioStorageConfig,
} from "./s3-compatible-storage";
