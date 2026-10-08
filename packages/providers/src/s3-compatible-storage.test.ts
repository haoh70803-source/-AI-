import { describe, expect, it } from "vitest";
import { readS3CompatibleStorageConfig, S3CompatibleStorageProvider, storageHealthFromEnv } from "./s3-compatible-storage";

const baseEnv = {
  STORAGE_DRIVER: "S3_COMPATIBLE",
  S3_ENDPOINT: "http://localhost:9000",
  S3_REGION: "us-east-1",
  S3_BUCKET: "content-center",
  S3_ACCESS_KEY_ID: "access",
  S3_SECRET_ACCESS_KEY: "secret",
  S3_FORCE_PATH_STYLE: "true",
};

describe("S3-compatible storage configuration", () => {
  it("resolves MinIO and R2-style configuration to the same provider", () => {
    const minio = readS3CompatibleStorageConfig(baseEnv);
    const r2 = readS3CompatibleStorageConfig({
      ...baseEnv,
      S3_ENDPOINT: "https://account-id.r2.cloudflarestorage.com",
      S3_REGION: "auto",
      S3_BUCKET: "private-bucket",
      S3_FORCE_PATH_STYLE: "false",
    });

    expect(minio).toMatchObject({ endpoint: "http://localhost:9000", forcePathStyle: true });
    expect(r2).toMatchObject({ endpoint: "https://account-id.r2.cloudflarestorage.com", region: "auto", forcePathStyle: false });
    expect(new S3CompatibleStorageProvider(minio)).toBeInstanceOf(S3CompatibleStorageProvider);
    expect(new S3CompatibleStorageProvider(r2)).toBeInstanceOf(S3CompatibleStorageProvider);
  });

  it("reports only configured or unconfigured health without a network probe", () => {
    expect(storageHealthFromEnv(baseEnv)).toBe("CONFIGURED");
    expect(storageHealthFromEnv({ ...baseEnv, S3_SECRET_ACCESS_KEY: "" })).toBe("UNCONFIGURED");
  });

  it("fails closed for unsupported driver and invalid endpoint", () => {
    expect(() => readS3CompatibleStorageConfig({ ...baseEnv, STORAGE_DRIVER: "LOCAL_FILESYSTEM" })).toThrow("UNSUPPORTED_STORAGE_DRIVER");
    expect(() => readS3CompatibleStorageConfig({ ...baseEnv, S3_ENDPOINT: "file:///tmp/storage" })).toThrow("INVALID_STORAGE_ENDPOINT");
  });

  it("keeps signed URL TTL within the requested bounds", async () => {
    const provider = new S3CompatibleStorageProvider(readS3CompatibleStorageConfig(baseEnv));
    const signed = await provider.getSignedUrl("workspaces/w/sources/s/assets/a/original.mp4", 61, { disposition: "attachment", filename: "source-asset" });
    expect(new URL(signed.data.url).searchParams.get("X-Amz-Expires")).toBe("61");
    expect(new URL(signed.data.url).searchParams.get("response-content-disposition")).toContain("attachment");
    await expect(provider.getSignedUrl("workspaces/w/sources/s/assets/a/original.mp4", 0)).rejects.toThrow("INVALID_SIGNED_URL_TTL");
    await expect(provider.getSignedUrl("workspaces/w/sources/s/assets/a/original.mp4", 7 * 24 * 60 * 60 + 1)).rejects.toThrow("INVALID_SIGNED_URL_TTL");
  });
});
