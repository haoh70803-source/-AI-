import { randomUUID } from "node:crypto";
import { describe, expect, it } from "vitest";
import { minioStorageFromEnv } from "./minio-storage";

describe("MinioStorageProvider integration", () => {
  it("uploads, signs and deletes a test object", async () => {
    const provider = minioStorageFromEnv();
    const key = `integration/${randomUUID()}.txt`;
    const uploaded = await provider.upload({
      key,
      body: new TextEncoder().encode("storage integration test"),
      contentType: "text/plain",
    });
    const signed = await provider.getSignedUrl(key, 60);
    const response = await fetch(signed.data.url);

    expect(uploaded.providerMode).toBe("REAL");
    expect(response.ok).toBe(true);
    expect(await response.text()).toBe("storage integration test");
    await expect(provider.delete(key)).resolves.toMatchObject({ providerMode: "REAL" });
  });
});
