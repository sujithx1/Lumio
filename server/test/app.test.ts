import { describe, expect, test } from "bun:test";
import { createApp } from "../src/app";
import { ConfigError, loadConfig } from "../src/config";
import { normalizeDatabaseUrl } from "../src/db/client";
import { resolveClientIp } from "../src/lib/client-ip";
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
      filesDir: "./data/transfers",
      maxFileBytes: 1024 ** 3,
      trustedProxies: 0,
    });
  });
  test("rejects a bad TRUSTED_PROXIES", () => {
    expect(loadConfig({ ...base, TRUSTED_PROXIES: "1" }).trustedProxies).toBe(1);
    expect(() => loadConfig({ ...base, TRUSTED_PROXIES: "-1" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, TRUSTED_PROXIES: "many" })).toThrow(ConfigError);
  });
  test("rejects a bad MAX_FILE_BYTES", () => {
    expect(() => loadConfig({ ...base, MAX_FILE_BYTES: "0" })).toThrow(ConfigError);
    expect(() => loadConfig({ ...base, MAX_FILE_BYTES: "1.5" })).toThrow(ConfigError);
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

describe("resolveClientIp", () => {
  const h = (xff?: string) => new Headers(xff ? { "x-forwarded-for": xff } : {});
  test("ignores X-Forwarded-For when no proxy is trusted", () => {
    expect(resolveClientIp(h("6.6.6.6"), "10.0.0.1", 0)).toBe("10.0.0.1");
  });
  test("takes the address the trusted proxy saw", () => {
    expect(resolveClientIp(h("203.0.113.7"), "10.0.0.1", 1)).toBe("203.0.113.7");
  });
  test("a client cannot spoof its address by sending its own header", () => {
    expect(resolveClientIp(h("6.6.6.6, 203.0.113.7"), "10.0.0.1", 1)).toBe("203.0.113.7");
  });
  test("two proxies", () => {
    expect(resolveClientIp(h("6.6.6.6, 203.0.113.7, 172.16.0.2"), "10.0.0.1", 2)).toBe("203.0.113.7");
  });
  test("falls back to the socket when the header is missing", () => {
    expect(resolveClientIp(h(), "10.0.0.1", 1)).toBe("10.0.0.1");
    expect(resolveClientIp(h(), undefined, 1)).toBe("unknown");
  });
});

describe("normalizeDatabaseUrl", () => {
  test("drops channel_binding and keeps sslmode", () => {
    expect(normalizeDatabaseUrl("postgresql://u:p@ep-x.neon.tech/db?sslmode=require&channel_binding=require")).toBe(
      "postgresql://u:p@ep-x.neon.tech/db?sslmode=require",
    );
  });
  test("leaves other URLs alone", () => {
    expect(normalizeDatabaseUrl("postgres://u:p@localhost:5442/lumio")).toBe("postgres://u:p@localhost:5442/lumio");
  });
});
