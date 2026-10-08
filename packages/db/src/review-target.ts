/** Guard the database at package initialization, including direct Next startup. */
export function reviewDatabaseTarget(env: NodeJS.ProcessEnv): string | undefined {
  if (env.ENVIRONMENT_ID !== "LOCAL_REVIEW" && env.LOCAL_REVIEW_OFFLINE !== "true") return undefined;
  if (env.ENVIRONMENT_ID !== "LOCAL_REVIEW" || env.LOCAL_REVIEW_OFFLINE !== "true" || env.FREE_WORKER_MODE !== "false") {
    throw new Error("REVIEW_SAFETY_FLAGS_REQUIRED");
  }
  let target: URL;
  try { target = new URL(env.DATABASE_URL ?? ""); }
  catch { throw new Error("REVIEW_DATABASE_MISMATCH"); }
  if (!["postgresql:", "postgres:"].includes(target.protocol) ||
      !["127.0.0.1", "localhost"].includes(target.hostname) ||
      target.port !== "55438" || target.pathname !== "/content_center_12_review") {
    throw new Error("REVIEW_DATABASE_MISMATCH");
  }
  return env.DATABASE_URL;
}
