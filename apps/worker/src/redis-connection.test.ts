import { describe, expect, it } from "vitest";
import { createRedisConnection } from "./redis-connection";

describe("createRedisConnection", () => {
  it("enables TLS for a rediss URL", () => {
    const connection = createRedisConnection("rediss://worker:password@redis.example.test:6380/2");

    expect(connection).toMatchObject({
      host: "redis.example.test",
      port: 6380,
      username: "worker",
      password: "password",
      db: 2,
      tls: {},
    });
  });

  it("keeps the existing non-TLS behavior for a redis URL", () => {
    const connection = createRedisConnection("redis://worker:password@redis.example.test:6379/1");

    expect(connection).toMatchObject({
      host: "redis.example.test",
      port: 6379,
      username: "worker",
      password: "password",
      db: 1,
    });
    expect(connection).not.toHaveProperty("tls");
  });
});
