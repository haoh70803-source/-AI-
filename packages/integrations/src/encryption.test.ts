import { randomBytes } from "node:crypto";
import { describe, expect, it } from "vitest";
import {
  decryptConfig,
  decryptSecret,
  encryptConfig,
  encryptSecret,
  maskSecret,
  parseMasterEncryptionKey,
} from "./encryption";

describe("integration secret encryption", () => {
  it("encrypts and decrypts with AES-256-GCM", () => {
    const key = randomBytes(32);
    const payload = encryptSecret("top-secret-value", key);
    expect(payload).toMatchObject({ version: 1, keyVersion: 1, algorithm: "AES-256-GCM" });
    expect(decryptSecret(payload, key)).toBe("top-secret-value");
    expect(decryptConfig(encryptConfig({ apiKey: "top-secret-value" }, key), key)).toEqual({ apiKey: "top-secret-value" });
  });

  it("uses a fresh IV so identical plaintext produces different ciphertext", () => {
    const key = randomBytes(32);
    const first = encryptSecret("same-secret", key);
    const second = encryptSecret("same-secret", key);
    expect(first.iv).not.toBe(second.iv);
    expect(first.ciphertext).not.toBe(second.ciphertext);
  });

  it("rejects tampered ciphertext and a wrong key", () => {
    const key = randomBytes(32);
    const payload = encryptSecret("protected", key);
    const changed = `${payload.ciphertext.slice(0, -2)}AA`;
    expect(() => decryptSecret({ ...payload, ciphertext: changed }, key)).toThrow("could not be decrypted");
    expect(() => decryptSecret(payload, randomBytes(32))).toThrow("could not be decrypted");
  });

  it("rejects missing, malformed, and incorrectly sized master keys", () => {
    expect(() => parseMasterEncryptionKey(undefined)).toThrow("not configured");
    expect(() => parseMasterEncryptionKey("dev-secret")).toThrow("32-byte base64");
    expect(() => parseMasterEncryptionKey(randomBytes(16).toString("base64"))).toThrow("32-byte base64");
    expect(parseMasterEncryptionKey(randomBytes(32).toString("base64"))).toHaveLength(32);
  });

  it("masks secrets consistently", () => {
    expect(maskSecret("abcdefghijklmnop")).toBe("abcd••••••mnop");
    expect(maskSecret("short")).toBe("••••••••");
  });
});
