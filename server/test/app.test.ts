import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { ConfigError, loadConfig } from "../src/config";
import { createLogger } from "../src/lib/logger";

const logger = createLogger("error");

describe("GET /health", () => {
  test("reports ok when the database answers", async () => {
    const app = createApp({ logger, pingDb: async () => {}, version: "test" });
    const res = await app.request("/health");
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ status: "ok", db: "ok", version: "test", protocol: 1 });
  });

  test("returns 503 when the database is unreachable", async () => {
    const app = createApp({
      logger,
      pingDb: async () => {
        throw new Error("ECONNREFUSED");
      },
      version: "test",
    });
    const res = await app.request("/health");
    expect(res.status).toBe(503);
    expect(await res.json()).toMatchObject({ status: "degraded", db: "unreachable" });
  });

  test("sets security headers", async () => {
    const app = createApp({ logger, pingDb: async () => {}, version: "test" });
    const res = await app.request("/health");
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
  });

  test("unknown routes return a JSON 404", async () => {
    const app = createApp({ logger, pingDb: async () => {}, version: "test" });
    const res = await app.request("/nope");
    expect(res.status).toBe(404);
    expect(await res.json()).toEqual({ error: { code: "not_found", message: "route not found" } });
  });
});

describe("loadConfig", () => {
  const base = { DATABASE_URL: "postgres://u:p@localhost:5442/lumio", JWT_SECRET: "x".repeat(32) };

  test("applies defaults", () => {
    expect(loadConfig(base)).toEqual({
      port: 8787,
      host: "::",
      databaseUrl: base.DATABASE_URL,
      logLevel: "info",
      jwtSecret: base.JWT_SECRET,
      tokenTtlSeconds: 900,
    });
  });
  test("requires DATABASE_URL", () => {
    expect(() => loadConfig({ JWT_SECRET: base.JWT_SECRET })).toThrow(ConfigError);
  });
  test("rejects a bad port", () => {
    expect(() => loadConfig({ ...base, PORT: "99999" })).toThrow(ConfigError);
  });
  test("requires a long JWT_SECRET", () => {
    expect(() => loadConfig({ ...base, JWT_SECRET: "short" })).toThrow(ConfigError);
  });
  test("rejects an unknown log level", () => {
    expect(() => loadConfig({ ...base, LOG_LEVEL: "loud" })).toThrow(ConfigError);
  });
});
