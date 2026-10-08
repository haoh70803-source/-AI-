import type { BootstrapResult } from "./bootstrap";

export const STAGING_ADMIN_BOOTSTRAP_DISABLED = "STAGING_ADMIN_BOOTSTRAP_DISABLED";
export const STAGING_ADMIN_BOOTSTRAP_STAGING_ONLY = "STAGING_ADMIN_BOOTSTRAP_STAGING_ONLY";
export const STAGING_ADMIN_BOOTSTRAP_EMAIL_REQUIRED = "STAGING_ADMIN_BOOTSTRAP_EMAIL_REQUIRED";
export const STAGING_ADMIN_BOOTSTRAP_EMAIL_INVALID = "STAGING_ADMIN_BOOTSTRAP_EMAIL_INVALID";
export const STAGING_ADMIN_BOOTSTRAP_PASSWORD_REQUIRED = "STAGING_ADMIN_BOOTSTRAP_PASSWORD_REQUIRED";
export const STAGING_ADMIN_BOOTSTRAP_PASSWORD_WEAK = "STAGING_ADMIN_BOOTSTRAP_PASSWORD_WEAK";

type DisabledConfig = { enabled: false };
type EnabledConfig = { enabled: true; email: string; password: string };
export type StagingAdminBootstrapConfig = DisabledConfig | EnabledConfig;
export type StagingAdminBootstrapEnvironment = Readonly<Record<string, string | undefined>>;

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

function isEnabled(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

export function isStrongStagingAdminPassword(password: string) {
  const classes = [/[a-z]/, /[A-Z]/, /\d/, /[^A-Za-z\d]/].filter((pattern) => pattern.test(password)).length;
  return password.length >= 12 && classes >= 3;
}

export function resolveStagingAdminBootstrapConfig(env: StagingAdminBootstrapEnvironment = process.env): StagingAdminBootstrapConfig {
  if (!isEnabled(env.STAGING_ADMIN_BOOTSTRAP_ENABLED)) return { enabled: false };

  if (env.APP_ENV?.trim().toLowerCase() !== "staging") {
    throw new Error(STAGING_ADMIN_BOOTSTRAP_STAGING_ONLY);
  }

  const email = env.STAGING_ADMIN_BOOTSTRAP_EMAIL?.trim().toLowerCase() ?? "";
  if (!email) throw new Error(STAGING_ADMIN_BOOTSTRAP_EMAIL_REQUIRED);
  if (!EMAIL_PATTERN.test(email)) throw new Error(STAGING_ADMIN_BOOTSTRAP_EMAIL_INVALID);

  const password = env.STAGING_ADMIN_BOOTSTRAP_PASSWORD ?? "";
  if (!password) throw new Error(STAGING_ADMIN_BOOTSTRAP_PASSWORD_REQUIRED);
  if (!isStrongStagingAdminPassword(password)) throw new Error(STAGING_ADMIN_BOOTSTRAP_PASSWORD_WEAK);

  return { enabled: true, email, password };
}

export async function runStagingAdminBootstrap(
  env: StagingAdminBootstrapEnvironment,
  bootstrap: (input: { email: string; password: string }) => Promise<BootstrapResult>,
) {
  const config = resolveStagingAdminBootstrapConfig(env);
  if (!config.enabled) return { status: "DISABLED" as const };
  return bootstrap({ email: config.email, password: config.password });
}
