# Lumio developer commands. Each app is independent; this file just saves typing.
SHELL := /bin/bash
export PATH := $(HOME)/.cargo/bin:$(PATH)

COMPOSE := docker compose -f infrastructure/docker/compose.yml
E2E_PORT := 8798
E2E_URL := http://127.0.0.1:$(E2E_PORT)

.PHONY: help doctor setup db-up db-down db-migrate server desktop desktop-b mobile-ios sim sync \
        test test-server test-desktop test-mobile test-e2e

help:
	@echo "make doctor        check required tools"
	@echo "make setup         install dependencies, start Postgres, run migrations"
	@echo "make server        run the relay server (http://localhost:8787)"
	@echo "make desktop       run the desktop app (needs the server)"
	@echo "make desktop-b     run a second desktop instance as another device (needs 'make desktop' running)"
	@echo "make mobile-ios    run the mobile app on an iOS simulator"
	@echo "make sim ARGS=host run a scripted test device: host | join <CODE> | send <effect> | listen"
	@echo "make sync          copy protocol assets/tokens into the apps"
	@echo "make test          every test suite, including live end-to-end tests"

doctor:
	@ok=1; for t in bun cargo flutter docker; do \
	  if command -v $$t >/dev/null; then printf "  ✓ %-8s %s\n" $$t "$$($$t --version 2>&1 | head -1)"; \
	  else printf "  ✗ %-8s missing\n" $$t; ok=0; fi; done; \
	docker info >/dev/null 2>&1 && echo "  ✓ docker daemon running" || { echo "  ✗ docker daemon not running"; ok=0; }; \
	xcodebuild -version >/dev/null 2>&1 && echo "  ✓ xcode" || echo "  - xcode missing (needed for iOS only)"; \
	[ -d "$$HOME/Library/Android/sdk" ] || [ -n "$$ANDROID_HOME" ] && echo "  ✓ android sdk" || echo "  - android sdk missing (needed for Android only)"; \
	[ $$ok = 1 ]

setup: db-up
	cd server && bun install && ([ -f .env ] || (cp .env.example .env && sed -i.bak "s|^JWT_SECRET=$$|JWT_SECRET=$$(openssl rand -base64 48 | tr -d '\n')|" .env && rm .env.bak)) && bun run db:migrate
	cd desktop && bun install
	cd mobile && flutter pub get && dart run tool/sync_protocol.dart

db-up:
	$(COMPOSE) up -d --wait

db-down:
	$(COMPOSE) down

db-migrate:
	cd server && bun run db:migrate

server:
	cd server && bun run dev

desktop:
	cd desktop && bun run tauri dev

# A second device on the same machine: own profile, file-based key, same Vite dev server.
desktop-b:
	cd desktop/src-tauri && LUMIO_PROFILE=b LUMIO_KEYSTORE=file cargo run

mobile-ios:
	cd mobile && flutter run -d ios

sim:
	cd server && bun scripts/devsim.ts $(ARGS)

sync:
	cd desktop && bun run tokens
	cd mobile && dart run tool/sync_protocol.dart

test: test-server test-desktop test-mobile test-e2e

test-server:
	cd server && bun run typecheck && bun test

test-desktop:
	cd desktop && bun run typecheck && bun run test
	cd desktop/src-tauri && cargo test --quiet --lib

test-mobile:
	cd mobile && flutter analyze && flutter test

# Real relay on a throwaway port + the lumio_test database; Rust and Dart clients pair and exchange effects.
test-e2e:
	@cd server && bun run db:migrate >/dev/null && \
	  (DATABASE_URL=$$(grep ^TEST_DATABASE_URL .env | cut -d= -f2-) PORT=$(E2E_PORT) LOG_LEVEL=warn bun src/index.ts & echo $$! > /tmp/lumio-e2e.pid); \
	  sleep 1; status=0; \
	  (cd ../desktop/src-tauri && LUMIO_TEST_SERVER_URL=$(E2E_URL) cargo test --quiet --test relay_e2e) || status=1; \
	  (cd ../mobile && LUMIO_TEST_SERVER_URL=$(E2E_URL) flutter test test/relay_e2e_test.dart) || status=1; \
	  kill $$(cat /tmp/lumio-e2e.pid); rm -f /tmp/lumio-e2e.pid; exit $$status
