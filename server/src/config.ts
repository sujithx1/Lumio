export type LogLevel = "debug" | "info" | "warn" | "error";

export interface Config {
  port: number;
  host: string;
  databaseUrl: string;
  logLevel: LogLevel;
  /** HMAC key for session JWTs. At least 32 characters. */
  jwtSecret: string;
  tokenTtlSeconds: number;
}

const LOG_LEVELS: readonly LogLevel[] = ["debug", "info", "warn", "error"];

export class ConfigError extends Error {}

/** Reads configuration from the environment. Throws ConfigError on missing or malformed values. */
export function loadConfig(env: Record<string, string | undefined> = process.env): Config {
  const databaseUrl = env.DATABASE_URL;
  if (!databaseUrl) throw new ConfigError("DATABASE_URL is required");
  if (!/^postgres(ql)?:\/\//.test(databaseUrl)) throw new ConfigError("DATABASE_URL must be a postgres:// URL");

  const port = Number(env.PORT ?? "8787");
  if (!Number.isInteger(port) || port < 0 || port > 65535) throw new ConfigError(`PORT is invalid: ${env.PORT}`);

  const logLevel = (env.LOG_LEVEL ?? "info") as LogLevel;
  if (!LOG_LEVELS.includes(logLevel)) throw new ConfigError(`LOG_LEVEL must be one of ${LOG_LEVELS.join(", ")}`);

  const jwtSecret = env.JWT_SECRET ?? "";
  if (jwtSecret.length < 32) throw new ConfigError("JWT_SECRET is required and must be at least 32 characters");

  const tokenTtlSeconds = Number(env.TOKEN_TTL_SECONDS ?? "900");
  if (!Number.isInteger(tokenTtlSeconds) || tokenTtlSeconds < 60 || tokenTtlSeconds > 3600) {
    throw new ConfigError("TOKEN_TTL_SECONDS must be an integer between 60 and 3600");
  }

  return { port, host: env.HOST ?? "::", databaseUrl, logLevel, jwtSecret, tokenTtlSeconds };
}
