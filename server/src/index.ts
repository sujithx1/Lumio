import { ConfigError, loadConfig, type Config } from "./config";
import { createLogger } from "./lib/logger";
import { startServer } from "./server";

let config: Config;
try {
  config = loadConfig();
} catch (err) {
  if (err instanceof ConfigError) {
    console.error(`config error: ${err.message}`);
    process.exit(1);
  }
  throw err;
}

const logger = createLogger(config.logLevel, { svc: "lumio-server" });
const running = startServer(config, logger);
logger.info("listening", { url: running.url.toString() });

const shutdown = async (signal: string) => {
  logger.info("shutting down", { signal });
  await running.stop();
  process.exit(0);
};
process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
