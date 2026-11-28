import { drizzle } from "drizzle-orm/postgres-js";
import postgres from "postgres";
import * as schema from "./schema";

/**
 * Hosted Postgres (Neon) hands out URLs with `channel_binding=require`, which postgres.js would send to the server as a
 * session setting and fail on. TLS still comes from `sslmode`.
 */
export function normalizeDatabaseUrl(databaseUrl: string): string {
  const q = databaseUrl.indexOf("?");
  if (q < 0) return databaseUrl;
  const params = new URLSearchParams(databaseUrl.slice(q + 1));
  if (!params.has("channel_binding")) return databaseUrl;
  params.delete("channel_binding");
  const rest = params.toString();
  return databaseUrl.slice(0, q) + (rest ? `?${rest}` : "");
}

export function createDb(databaseUrl: string) {
  const client = postgres(normalizeDatabaseUrl(databaseUrl), { max: 10, onnotice: () => {} });
  const db = drizzle(client, { schema });
  return {
    db,
    /** Throws if the database is unreachable. */
    ping: async () => {
      await client`select 1`;
    },
    close: () => client.end({ timeout: 5 }),
  };
}

export type Database = ReturnType<typeof createDb>["db"];
