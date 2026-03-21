# Vulcan — Development Commands
# Usage: make <target>

.PHONY: up down db-reset backend frontend setup logs db-shell help

VENV := backend/.venv
PYTHON := $(VENV)/bin/python3
UV := uv

# ─── Docker ──────────────────────────────────────────────────────────────────

up: ## Start Postgres + pgAdmin
	docker compose up -d

down: ## Stop all services
	docker compose down

db-reset: ## Wipe database and re-initialize schema
	docker compose down -v
	docker compose up -d postgres
	@echo "Waiting for Postgres to be ready..."
	@sleep 3
	@echo "Database reset complete."

logs: ## Tail Docker logs
	docker compose logs -f

db-shell: ## Open psql shell in the running container
	docker exec -it vulcan-db psql -U vulcan -d vulcan

# ─── Backend ─────────────────────────────────────────────────────────────────

$(VENV)/bin/activate:
	$(UV) venv $(VENV)

setup: $(VENV)/bin/activate ## First-time setup: create venv, copy env, install deps, start DB
	@test -f .env || (cp backend/.env.example .env && echo "Created .env from template")
	$(UV) pip install -r backend/requirements.txt --python $(PYTHON)
	$(MAKE) up
	@echo "\n✓ Setup complete. Run 'make backend' and 'make frontend' in separate terminals."

backend: ## Run the FastAPI backend (port 8000)
	$(PYTHON) -m backend.app

# ─── Frontend ────────────────────────────────────────────────────────────────

frontend: ## Serve frontend on port 3000
	python3 -m http.server 3000 --directory frontend

# ─── Help ────────────────────────────────────────────────────────────────────

help: ## Show this help
	@grep -E '^[a-zA-Z_-]+:.*?## .*$$' $(MAKEFILE_LIST) | awk 'BEGIN {FS = ":.*?## "}; {printf "\033[36m%-15s\033[0m %s\n", $$1, $$2}'

.DEFAULT_GOAL := help
