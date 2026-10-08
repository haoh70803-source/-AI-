import process from "node:process";
import console from "node:console";
import { existsSync, readFileSync } from "node:fs";
import { parseEnv } from "node:util";
import { dirname, resolve } from "node:path";
import { fileURLToPath, URL } from "node:url";
import { spawn } from "node:child_process";
import net from "node:net";
import { assertLegacyRuntime } from "./local-profile.mjs";
import tls from "node:tls";

const scriptDirectory = dirname(fileURLToPath(import.meta.url));
const repositoryRoot = resolve(scriptDirectory, "..");
const [expectedEnvironment, envFile, ...command] = process.argv.slice(2);

try { assertLegacyRuntime(expectedEnvironment); } catch (error) { console.error(error.message); process.exit(2); }

const usage = "Usage: node scripts/runtime-env.mjs <LOCAL_REAL|LOCAL_TEST> <env-file> <command> [args...]";
if (!expectedEnvironment || !envFile || command.length === 0) {
  console.error(usage);
  process.exit(2);
}

const envPath = resolve(repositoryRoot, envFile);
if (!existsSync(envPath)) {
  console.error(`RUNTIME_ENV_FILE_MISSING: ${envFile}`);
  console.error(`Create a reviewed ${envFile} from the matching template before starting this environment.`);
  process.exit(2);
}

const fileValues = parseEnv(readFileSync(envPath, "utf8"));
if (fileValues.ENVIRONMENT_ID !== expectedEnvironment) {
  console.error(`RUNTIME_ENVIRONMENT_MISMATCH: expected ${expectedEnvironment}, received ${fileValues.ENVIRONMENT_ID || "missing"}`);
  process.exit(2);
}

function fail(message) {
  console.error(message);
  process.exit(2);
}

function parseUrl(value, label) {
  if (!value) fail(`${label}_MISSING`);
  try {
    return new URL(value);
  } catch {
    fail(`${label}_INVALID`);
  }
}

function tcpReachable(raw, fallbackPort) {
  const url = parseUrl(raw, "RUNTIME_ENDPOINT");
  const port = url.port ? Number(url.port) : fallbackPort;
  const secure = url.protocol === "rediss:";
  return new Promise((resolve) => {
    const socket = secure
      ? tls.connect({ host: url.hostname, port, servername: url.hostname })
      : net.createConnection({ host: url.hostname, port });
    const finish = (value) => {
      socket.destroy();
      resolve(value);
    };
    socket.setTimeout(1_500, () => finish(false));
    socket.once("connect", () => finish(true));
    socket.once("secureConnect", () => finish(true));
    socket.once("error", () => finish(false));
  });
}

if (expectedEnvironment === "LOCAL_TEST") {
  const database = parseUrl(fileValues.DATABASE_URL, "LOCAL_TEST_DATABASE_URL");
  const databaseName = database.pathname.replace(/^\//u, "").split("?", 1)[0];
  if (/render\.com$/iu.test(database.hostname) || database.port === "55432" || !/(^|[_-])test($|[_-])/iu.test(databaseName)) {
    fail("LOCAL_TEST_DATABASE_GUARD_FAILED: use a dedicated non-Render database whose name contains test");
  }
  const app = parseUrl(fileValues.APP_URL, "LOCAL_TEST_APP_URL");
  if (app.port !== "3001") fail("LOCAL_TEST_APP_GUARD_FAILED: APP_URL must use the isolated port 3001");
  const redis = parseUrl(fileValues.REDIS_URL, "LOCAL_TEST_REDIS_URL");
  if (/render\.com$/iu.test(redis.hostname) || redis.port === "6379") {
    fail("LOCAL_TEST_REDIS_GUARD_FAILED: use a dedicated test Redis endpoint");
  }
}

if (expectedEnvironment === "LOCAL_REAL") {
  const database = parseUrl(fileValues.DATABASE_URL, "LOCAL_REAL_DATABASE_URL");
  const databaseName = database.pathname.replace(/^\//u, "").split("?", 1)[0];
  if (database.port === "55432" && /xsj-pg-one-screen|content_center/iu.test(databaseName) && fileValues.RUNTIME_GUARD !== "DOCKER_COMPOSE") {
    fail("LOCAL_REAL_DATABASE_GUARD_FAILED: 55432 content_center is allowed only for the reviewed Docker Compose runtime");
  }
  parseUrl(fileValues.REDIS_URL, "LOCAL_REAL_REDIS_URL");
}

const [databaseReachable, redisReachable] = await Promise.all([
  tcpReachable(fileValues.DATABASE_URL, 5432),
  tcpReachable(fileValues.REDIS_URL, 6379),
]);
if (!databaseReachable) fail(`${expectedEnvironment}_DATABASE_UNREACHABLE`);
if (!redisReachable) fail(`${expectedEnvironment}_REDIS_UNREACHABLE`);

const runtimeKeys = [
  "DATABASE_URL", "REDIS_URL", "AUTH_SECRET", "APP_URL", "APP_ENV", "NODE_ENV", "ENVIRONMENT_ID",
  "SYSTEM_MANAGED_PROVIDERS", "RUNTIME_GUARD", "WORKER_HEALTH_URL", "WORKER_HEALTH_PORT", "PORT", "STORAGE_DRIVER", "S3_ENDPOINT",
  "S3_REGION", "S3_BUCKET", "S3_ACCESS_KEY_ID", "S3_SECRET_ACCESS_KEY", "S3_FORCE_PATH_STYLE",
  "MEDIA_STORAGE_ROOT", "MEDIA_RELAY_INTERNAL_BASE_URL", "MEDIA_RELAY_BASE_URL", "MEDIA_RELAY_INTERNAL_SECRET",
  "MEDIA_RELAY_SIGNING_SECRET", "INTEGRATION_ENCRYPTION_KEY", "MOCK_MODE", "AI_PROVIDER", "AI_MODEL_ID",
  "AI_BASE_URL", "KIMI_API_KEY", "KIMI_BASE_URL", "KIMI_MODEL_ID", "DEEPSEEK_API_KEY", "DEEPSEEK_BASE_URL",
  "DEEPSEEK_MODEL_ID", "M8_AI_PROVIDER", "M8_AI_MODEL_ID", "M8_AI_BASE_URL", "REDFOX_API_KEY", "REDFOX_BASE_URL",
  "DOUBAO_API_KEY", "DOUBAO_APP_ID", "DOUBAO_ACCESS_TOKEN", "DOUBAO_ASR_BASE_URL", "DOUBAO_ASR_RESOURCE_ID",
  "TRANSCRIPTION_PRIMARY", "LOCAL_ASR_ENDPOINT",
];

const childEnvironment = { ...process.env };
for (const key of runtimeKeys) delete childEnvironment[key];
Object.assign(childEnvironment, fileValues, { ENVIRONMENT_ID: expectedEnvironment });
if (expectedEnvironment === "LOCAL_TEST") childEnvironment.RUNTIME_GUARD = "LOCAL_TEST";

console.log(`RUNTIME_ENVIRONMENT=${expectedEnvironment}`);
console.log(`RUNTIME_ENV_FILE=${envFile}`);
console.log(`RUNTIME_COMMAND=${command.join(" ")}`);

const executable = process.platform === "win32" && command[0] === "pnpm" ? "pnpm.cmd" : command[0];
const child = process.platform === "win32"
  ? spawn(process.env.ComSpec ?? "cmd.exe", ["/d", "/s", "/c", [executable, ...command.slice(1)].map((part) => /[\s"]/u.test(part) ? `"${part.replaceAll('"', '\\"')}"` : part).join(" ")], {
      cwd: repositoryRoot,
      env: childEnvironment,
      stdio: "inherit",
    })
  : spawn(executable, command.slice(1), {
      cwd: repositoryRoot,
      env: childEnvironment,
      stdio: "inherit",
    });

child.on("exit", (code, signal) => {
  if (signal) process.kill(process.pid, signal);
  process.exit(code ?? 1);
});
