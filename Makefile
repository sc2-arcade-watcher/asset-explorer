# The tests talk to the real Caddy+imageproxy stack over HTTP. HTTP_PORT picks
# the host port; BASE_URL is derived from it and exported so playwright sees it.
# For parallel workers (e.g. worktrees or multiple agents) pick a distinct port:
#   HTTP_PORT=8091 make test
# docker compose project names default to the basename of CWD, which isolates
# worktrees from each other automatically.
HTTP_PORT ?= 8080
BASE_URL ?= http://localhost:$(HTTP_PORT)
export HTTP_PORT BASE_URL

COMPOSE := HTTP_PORT=$(HTTP_PORT) docker compose

.PHONY: up dev down logs ps wait-ready test test-ini test-smoke test-browser help

up: ## Start stack (production caching from .env / defaults)
	$(COMPOSE) up -d

dev: ## Start stack with cache disabled (dev mode)
	CACHE_CONTROL=no-store $(COMPOSE) up -d

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

test: test-ini up wait-ready ## Run all tests (starts the stack, runs INI + api + browser)
	@pnpm test

test-ini: ## Validate INI file pairing and structure (no stack needed)
	@bash test/ini-integrity.sh

test-smoke: up wait-ready ## API smoke tests (starts stack if needed)
	@pnpm run test:smoke

test-browser: up wait-ready ## Browser tests (starts stack if needed)
	@pnpm run test:browser

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "%-15s %s\n", $$1, $$2}'
