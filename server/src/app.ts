import { Hono } from "hono";
import { secureHeaders } from "hono/secure-headers";
import { HttpError } from "./lib/http";
import type { Logger } from "./lib/logger";
import { PROTOCOL_VERSION } from "./protocol/types";

export interface AppDeps {
  logger: Logger;
  /** Throws when the database is unreachable. */
  pingDb: () => Promise<void>;
  version: string;
  /** Mounts the versioned API under /v1. Omitted in unit tests that only exercise the shell. */
  api?: Hono<any>;
}

export function createApp({ logger, pingDb, version, api }: AppDeps) {
  const app = new Hono();

  app.use(secureHeaders());
  app.use(async (c, next) => {
    const started = performance.now();
    await next();
    logger.info("http", {
      method: c.req.method,
      path: c.req.path,
      status: c.res.status,
      ms: Math.round(performance.now() - started),
    });
  });

  app.get("/health", async (c) => {
    try {
      await pingDb();
      return c.json({ status: "ok", db: "ok", version, protocol: PROTOCOL_VERSION });
    } catch (err) {
      logger.error("health check failed", { err: String(err) });
      return c.json({ status: "degraded", db: "unreachable", version, protocol: PROTOCOL_VERSION }, 503);
    }
  });

  if (api) app.route("/v1", api);

  app.notFound((c) => c.json({ error: { code: "not_found", message: "route not found" } }, 404));
  app.onError((err, c) => {
    if (err instanceof HttpError) return c.json({ error: { code: err.code, message: err.message } }, err.status);
    logger.error("unhandled error", { err: String(err), stack: err.stack, path: c.req.path });
    return c.json({ error: { code: "internal", message: "internal error" } }, 500);
  });

  return app;
}
