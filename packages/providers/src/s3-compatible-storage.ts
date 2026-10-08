import {
  CreateBucketCommand,
  DeleteObjectCommand,
  GetObjectCommand,
  HeadBucketCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { getSignedUrl } from "@aws-sdk/s3-request-presigner";
import type { StorageProvider, StorageSignedUrlOptions } from "./contracts";
import { renderMediaRelayStorageFromEnv, readRenderMediaRelayConfig } from "./render-media-relay";

export type S3CompatibleStorageConfig = {
  endpoint: string;
  region: string;
  bucket: string;
  accessKeyId: string;
  secretAccessKey: string;
  forcePathStyle: boolean;
};

export type StorageEnvironment = Record<string, string | undefined>;

const requiredEnvironmentKeys = [
  "S3_ENDPOINT",
  "S3_REGION",
  "S3_BUCKET",
  "S3_ACCESS_KEY_ID",
  "S3_SECRET_ACCESS_KEY",
] as const;

function isLocalEndpoint(endpoint: string) {
  try {
    const url = new URL(endpoint);
    return url.hostname === "localhost" || url.hostname === "127.0.0.1" || url.hostname === "::1";
  } catch {
    return false;
  }
}

export function readS3CompatibleStorageConfig(env: StorageEnvironment = process.env): S3CompatibleStorageConfig {
  const driver = env.STORAGE_DRIVER?.trim() || "S3_COMPATIBLE";
  if (driver !== "S3_COMPATIBLE") throw new Error(`UNSUPPORTED_STORAGE_DRIVER: ${driver}`);

  const missing = requiredEnvironmentKeys.filter((key) => !env[key]?.trim());
  if (missing.length > 0) throw new Error(`UNCONFIGURED: ${missing.join(", ")}`);

  const endpoint = env.S3_ENDPOINT!.trim();
  let parsedEndpoint: URL;
  try {
    parsedEndpoint = new URL(endpoint);
  } catch {
    throw new Error("INVALID_STORAGE_ENDPOINT");
  }
  if (parsedEndpoint.protocol !== "http:" && parsedEndpoint.protocol !== "https:") {
    throw new Error("INVALID_STORAGE_ENDPOINT");
  }

  return {
    endpoint,
    region: env.S3_REGION!.trim(),
    bucket: env.S3_BUCKET!.trim(),
    accessKeyId: env.S3_ACCESS_KEY_ID!.trim(),
    secretAccessKey: env.S3_SECRET_ACCESS_KEY!.trim(),
    forcePathStyle: env.S3_FORCE_PATH_STYLE ? env.S3_FORCE_PATH_STYLE.trim() !== "false" : isLocalEndpoint(endpoint),
  };
}

export function storageHealthFromEnv(env: StorageEnvironment = process.env): "CONFIGURED" | "UNCONFIGURED" {
  try {
    if (["RENDER_MEDIA_RELAY", "LOCAL_FILESYSTEM"].includes(env.STORAGE_DRIVER?.trim() || "")) readRenderMediaRelayConfig(env);
    else readS3CompatibleStorageConfig(env);
    return "CONFIGURED";
  } catch {
    return "UNCONFIGURED";
  }
}

export class S3CompatibleStorageProvider implements StorageProvider {
  private readonly client: S3Client;

  constructor(private readonly config: S3CompatibleStorageConfig) {
    this.client = new S3Client({
      endpoint: config.endpoint,
      region: config.region,
      forcePathStyle: config.forcePathStyle,
      credentials: {
        accessKeyId: config.accessKeyId,
        secretAccessKey: config.secretAccessKey,
      },
    });
  }

  async ensureBucket(): Promise<void> {
    try {
      await this.client.send(new HeadBucketCommand({ Bucket: this.config.bucket }));
    } catch {
      await this.client.send(new CreateBucketCommand({ Bucket: this.config.bucket }));
    }
  }

  async upload(input: Parameters<StorageProvider["upload"]>[0]) {
    await this.ensureBucket();
    await this.client.send(new PutObjectCommand({
      Bucket: this.config.bucket,
      Key: input.key,
      Body: input.body,
      ContentType: input.contentType,
      ContentLength: input.contentLength,
    }));
    return { providerMode: "REAL" as const, data: { key: input.key } };
  }

  async delete(key: string) {
    await this.client.send(new DeleteObjectCommand({ Bucket: this.config.bucket, Key: key }));
    return { providerMode: "REAL" as const, data: { key } };
  }

  async getSignedUrl(key: string, expiresInSeconds = 300, options?: StorageSignedUrlOptions) {
    if (!Number.isInteger(expiresInSeconds) || expiresInSeconds < 1 || expiresInSeconds > 7 * 24 * 60 * 60) {
      throw new Error("INVALID_SIGNED_URL_TTL");
    }
    const responseContentDisposition = options?.disposition === "attachment"
      ? `attachment${options.filename ? `; filename="${options.filename.replace(/["\\]/g, "")}"` : ""}`
      : options?.disposition === "inline" ? "inline" : undefined;
    const url = await getSignedUrl(
      this.client,
      new GetObjectCommand({
        Bucket: this.config.bucket,
        Key: key,
        ...(responseContentDisposition ? { ResponseContentDisposition: responseContentDisposition } : {}),
      }),
      { expiresIn: expiresInSeconds },
    );
    return { providerMode: "REAL" as const, data: { url } };
  }
}

export function getStorageProvider(): StorageProvider {
  const driver = process.env.STORAGE_DRIVER?.trim() || "S3_COMPATIBLE";
  if (driver === "RENDER_MEDIA_RELAY" || driver === "LOCAL_FILESYSTEM") return renderMediaRelayStorageFromEnv();
  return new S3CompatibleStorageProvider(readS3CompatibleStorageConfig());
}

/** @deprecated Use getStorageProvider. Kept for existing integrations and tests. */
export function minioStorageFromEnv(): S3CompatibleStorageProvider {
  return new S3CompatibleStorageProvider(readS3CompatibleStorageConfig());
}
