#!/bin/bash
# Starts Lumio's database (Docker) and relay server. Run at login by the launch agent that
# `make autostart` installs; launchd restarts it if it exits. Logs: ~/Library/Logs/Lumio/server.log
set -euo pipefail

ROOT="$(cd "$(dirname "$0")/../.." && pwd)"
export PATH="$HOME/.bun/bin:/opt/homebrew/bin:/usr/local/bin:/Applications/Docker.app/Contents/Resources/bin:/usr/bin:/bin"

log() { echo "$(date '+%Y-%m-%d %H:%M:%S') lumio-server: $*"; }

# Docker may not be running yet after login: open it in the background and wait (up to 3 minutes).
if ! docker info >/dev/null 2>&1; then
  log "starting Docker"
  open -ga Docker
  for _ in $(seq 1 90); do
    docker info >/dev/null 2>&1 && break
    sleep 2
  done
fi

log "starting the database"
docker compose -f "$ROOT/infrastructure/docker/compose.yml" up -d --wait

cd "$ROOT/server"
log "applying migrations"
bun src/db/migrate.ts
log "starting the relay"
exec bun src/index.ts
