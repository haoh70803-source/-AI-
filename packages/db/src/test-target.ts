/** Reject unknown targets before any test fixture or Prisma client is created. */
export function assertTestDatabaseTarget(env: NodeJS.ProcessEnv): string {
  let target: URL;
  try { target = new URL(env.DATABASE_URL ?? ""); } catch { throw new Error("TEST_DATABASE_TARGET_REJECTED"); }
  const local = ["postgres:", "postgresql:"].includes(target.protocol) &&
    ["localhost", "127.0.0.1"].includes(target.hostname) && !target.hash && [...target.searchParams].every(([key, value]) => key === "schema" && value === "public") && [...target.searchParams].length <= 1;
  const test = env.ENVIRONMENT_ID === "LOCAL_TEST" && ((target.port === "55433" && target.pathname === "/content_center_test") || (target.port === "55438" && target.pathname === "/content_center_agent_test_12"));
  const review = env.ENVIRONMENT_ID === "LOCAL_REVIEW" && env.LOCAL_REVIEW_OFFLINE === "true" &&
    env.FREE_WORKER_MODE === "false" && target.port === "55438" && target.pathname === "/content_center_12_review";
  if (!local || (!test && !review)) throw new Error("TEST_DATABASE_TARGET_REJECTED");
  return env.DATABASE_URL!;
}
