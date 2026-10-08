import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

const ALGORITHM = "aes-256-gcm";
const PAYLOAD_ALGORITHM = "AES-256-GCM";
const PAYLOAD_VERSION = 1;
const DEFAULT_KEY_VERSION = 1;

export type EncryptedPayload = {
  version: 1;
  keyVersion: number;
  algorithm: "AES-256-GCM";
  iv: string;
  authTag: string;
  ciphertext: string;
};

export class IntegrationSecretError extends Error {
  constructor(
    readonly code: "INTEGRATION_ENCRYPTION_NOT_CONFIGURED" | "INVALID_INTEGRATION_ENCRYPTION_KEY" | "INTEGRATION_SECRET_DECRYPT_FAILED",
    message: string,
  ) {
    super(message);
    this.name = "IntegrationSecretError";
  }
}

export function parseMasterEncryptionKey(value?: string): Buffer {
  if (!value?.trim()) {
    throw new IntegrationSecretError(
      "INTEGRATION_ENCRYPTION_NOT_CONFIGURED",
      "Secret encryption is not configured.",
    );
  }
  const encoded = value.trim();
  if (!/^(?:[A-Za-z0-9+/]{4}){10}[A-Za-z0-9+/]{3}=$/.test(encoded)) {
    throw new IntegrationSecretError(
      "INVALID_INTEGRATION_ENCRYPTION_KEY",
      "INTEGRATION_ENCRYPTION_KEY must be a 32-byte base64 key.",
    );
  }
  const key = Buffer.from(encoded, "base64");
  if (key.length !== 32 || key.toString("base64") !== encoded) {
    throw new IntegrationSecretError(
      "INVALID_INTEGRATION_ENCRYPTION_KEY",
      "INTEGRATION_ENCRYPTION_KEY must be a 32-byte base64 key.",
    );
  }
  return key;
}

function associatedData(payloadVersion: number, keyVersion: number) {
  return Buffer.from(`integration-secret:v${payloadVersion}:key-${keyVersion}`, "utf8");
}

export function encryptSecret(secret: string, key: Buffer, keyVersion = DEFAULT_KEY_VERSION): EncryptedPayload {
  if (key.length !== 32) {
    throw new IntegrationSecretError("INVALID_INTEGRATION_ENCRYPTION_KEY", "Encryption key must contain exactly 32 bytes.");
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  cipher.setAAD(associatedData(PAYLOAD_VERSION, keyVersion));
  const ciphertext = Buffer.concat([cipher.update(secret, "utf8"), cipher.final()]);
  return {
    version: PAYLOAD_VERSION,
    keyVersion,
    algorithm: PAYLOAD_ALGORITHM,
    iv: iv.toString("base64"),
    authTag: cipher.getAuthTag().toString("base64"),
    ciphertext: ciphertext.toString("base64"),
  };
}

function parseEncryptedPayload(value: string | EncryptedPayload): EncryptedPayload {
  try {
    const payload = typeof value === "string" ? JSON.parse(value) : value;
    if (
      payload?.version !== PAYLOAD_VERSION ||
      payload?.algorithm !== PAYLOAD_ALGORITHM ||
      !Number.isInteger(payload?.keyVersion) ||
      payload.keyVersion < 1 ||
      typeof payload?.iv !== "string" ||
      typeof payload?.authTag !== "string" ||
      typeof payload?.ciphertext !== "string"
    ) {
      throw new Error("Invalid encrypted payload");
    }
    return payload as EncryptedPayload;
  } catch {
    throw new IntegrationSecretError("INTEGRATION_SECRET_DECRYPT_FAILED", "Stored integration secret could not be decrypted.");
  }
}

export function decryptSecret(value: string | EncryptedPayload, key: Buffer): string {
  if (key.length !== 32) {
    throw new IntegrationSecretError("INVALID_INTEGRATION_ENCRYPTION_KEY", "Encryption key must contain exactly 32 bytes.");
  }
  const payload = parseEncryptedPayload(value);
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(payload.iv, "base64"));
    decipher.setAAD(associatedData(payload.version, payload.keyVersion));
    decipher.setAuthTag(Buffer.from(payload.authTag, "base64"));
    return Buffer.concat([
      decipher.update(Buffer.from(payload.ciphertext, "base64")),
      decipher.final(),
    ]).toString("utf8");
  } catch {
    throw new IntegrationSecretError("INTEGRATION_SECRET_DECRYPT_FAILED", "Stored integration secret could not be decrypted.");
  }
}

export function encryptConfig(config: Record<string, unknown>, key: Buffer, keyVersion = DEFAULT_KEY_VERSION): string {
  return JSON.stringify(encryptSecret(JSON.stringify(config), key, keyVersion));
}

export function decryptConfig(value: string, key: Buffer): Record<string, unknown> {
  try {
    const parsed = JSON.parse(decryptSecret(value, key));
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) throw new Error("Invalid config payload");
    return parsed as Record<string, unknown>;
  } catch (error) {
    if (error instanceof IntegrationSecretError) throw error;
    throw new IntegrationSecretError("INTEGRATION_SECRET_DECRYPT_FAILED", "Stored integration secret could not be decrypted.");
  }
}

export function maskSecret(secret: string): string {
  if (!secret) return "••••••••";
  if (secret.length <= 8) return "••••••••";
  return `${secret.slice(0, 4)}••••••${secret.slice(-4)}`;
}

export function secretLastFour(secret: string): string {
  return secret.length <= 8 ? "••••" : secret.slice(-4);
}
