# The tests talk to the real Caddy+imageproxy stack over HTTP. HTTP_PORT picks
# the host port; BASE_URL is derived from it and exported so playwright sees it.
# For parallel workers (e.g. worktrees or multiple agents) pick a distinct port:
#   HTTP_PORT=8091 make test
# docker compose project names default to the basename of CWD, which isolates
# worktrees from each other automatically.
HTTP_PORT ?= 8080
BASE_URL ?= http://localhost:$(HTTP_PORT)
CACHE_CONTROL ?= no-store
export HTTP_PORT BASE_URL CACHE_CONTROL

COMPOSE := HTTP_PORT=$(HTTP_PORT) docker compose

.PHONY: up down logs ps wait-ready test test-fast test-lists test-smoke test-browser help

up: ## Start stack
	$(COMPOSE) up -d

down: ## Stop and remove containers
	$(COMPOSE) down --remove-orphans

logs: ## Tail logs
	$(COMPOSE) logs -f

ps: ## Show running services
	$(COMPOSE) ps

wait-ready: ## Block until the stack responds on BASE_URL (up to 30s)
	@for i in $$(seq 1 30); do \
		curl -sf $(BASE_URL)/ >/dev/null 2>&1 && exit 0; \
		sleep 1; \
	done; \
	echo "stack not ready at $(BASE_URL) after 30s" >&2; exit 1

test: test-lists up wait-ready ## Run all tests (starts the stack, runs list schema + api + browser)
	@pnpm test

test-fast: test-lists wait-ready ## Run all tests assuming stack is already up
	@pnpm test

test-lists: ## Validate site/list/*.json against the asset list schema (no stack needed)
	@node test/list-integrity.js

test-smoke: up wait-ready ## API smoke tests (starts stack if needed)
	@pnpm run test:smoke

test-browser: up wait-ready ## Browser tests (starts stack if needed)
	@pnpm run test:browser

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "%-15s %s\n", $$1, $$2}'
