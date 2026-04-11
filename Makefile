-include .env
HTTP_PORT ?= 8080
export BASE_URL ?= http://localhost:$(HTTP_PORT)

.PHONY: up dev down logs ps test test-ini test-smoke help

up: ## Start stack (production config from .env)
	docker compose up -d

dev: ## Start stack with cache disabled (dev mode)
	CACHE_CONTROL=no-store docker compose up -d

down: ## Stop and remove containers
	docker compose down

logs: ## Tail logs
	docker compose logs -f

ps: ## Show running services
	docker compose ps

test: test-ini test-smoke ## Run all tests

test-ini: ## Validate INI file pairing and structure (no stack needed)
	@bash test/ini-integrity.sh

test-smoke: ## HTTP smoke tests against BASE_URL (stack must be running)
	@pnpm test

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) \
		| awk 'BEGIN {FS = ":.*?## "}; {printf "%-15s %s\n", $$1, $$2}'
