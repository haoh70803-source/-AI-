import { expect, it } from "vitest";
import { assertTestDatabaseTarget } from "./test-target";
const valid = { ENVIRONMENT_ID: "LOCAL_REVIEW", LOCAL_REVIEW_OFFLINE: "true", FREE_WORKER_MODE: "false", DATABASE_URL: "postgresql://fixture:fixture@127.0.0.1:55438/content_center_12_review" };
it("accepts only the two registered local isolated databases", () => {
  expect(assertTestDatabaseTarget(valid)).toBe(valid.DATABASE_URL);
  const test = { ENVIRONMENT_ID: "LOCAL_TEST", DATABASE_URL: "postgresql://fixture:fixture@localhost:55433/content_center_test" };
  expect(assertTestDatabaseTarget(test)).toBe(test.DATABASE_URL);
});
it.each(["postgresql://fixture:fixture@localhost:55432/content_center", "postgresql://fixture:fixture@localhost:55435/content_center_agent_test_integration", "postgresql://fixture:fixture@remote.invalid:55438/content_center_12_review", "postgresql://fixture:fixture@localhost:55438/unknown", "postgresql://fixture:fixture@localhost:55438/content_center_12_review?schema=other", "", "invalid"])("rejects a target without disclosing credentials", DATABASE_URL => {
  expect(() => assertTestDatabaseTarget({ ...valid, DATABASE_URL })).toThrow("TEST_DATABASE_TARGET_REJECTED");
});
it("rejects incomplete safety flags and ordinary environments", () => {
  for (const patch of [{ ENVIRONMENT_ID: "LOCAL_REAL" }, { FREE_WORKER_MODE: "true" }, { LOCAL_REVIEW_OFFLINE: "false" }])
    expect(() => assertTestDatabaseTarget({ ...valid, ...patch })).toThrow("TEST_DATABASE_TARGET_REJECTED");
});

it("accepts only the explicit 1.2 agent test database under LOCAL_TEST",()=>{expect(assertTestDatabaseTarget({ENVIRONMENT_ID:"LOCAL_TEST",DATABASE_URL:"postgresql://fixture:fixture@127.0.0.1:55438/content_center_agent_test_12"})).toContain("content_center_agent_test_12");expect(()=>assertTestDatabaseTarget({ENVIRONMENT_ID:"LOCAL_TEST",DATABASE_URL:"postgresql://fixture:fixture@127.0.0.1:55438/content_center_12_review"})).toThrow();});
