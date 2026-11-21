# Lumio relay server. Build from the repository root:
#   docker build -f infrastructure/docker/server.Dockerfile -t lumio-server .
# Runtime config comes from the environment (DATABASE_URL, JWT_SECRET, PORT, LOG_LEVEL).
# Terminate TLS in front of this container (load balancer / reverse proxy): clients require HTTPS/WSS in production.
FROM oven/bun:1.3-alpine AS deps
WORKDIR /app/server
COPY server/package.json server/bun.lock ./
RUN bun install --frozen-lockfile --production

FROM oven/bun:1.3-alpine
WORKDIR /app
ENV NODE_ENV=production PORT=8787
COPY protocol ./protocol
COPY server/package.json server/tsconfig.json ./server/
COPY server/src ./server/src
COPY server/drizzle ./server/drizzle
COPY --from=deps /app/server/node_modules ./server/node_modules
WORKDIR /app/server
USER bun
EXPOSE 8787
HEALTHCHECK --interval=15s --timeout=3s CMD wget -qO- http://127.0.0.1:8787/health || exit 1
# Apply pending migrations, then serve.
CMD ["sh", "-c", "bun src/db/migrate.ts && exec bun src/index.ts"]
