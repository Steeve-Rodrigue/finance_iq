.PHONY: install run test lint format check migrate revision docker-up docker-down docker-logs precommit clean

install: ## Sync dependencies (runtime + dev)
	uv sync

run: ## Run the dev server with auto-reload
	uv run uvicorn app.main:app --reload

test: ## Run the test suite with coverage
	uv run pytest --cov=app

lint: ## Check lint rules (no changes)
	uv run ruff check .

format: ## Auto-fix lint issues and format code
	uv run ruff check --fix .
	uv run ruff format .

check: lint ## Lint + format-check, no writes (what CI runs)
	uv run ruff format --check .

migrate: ## Apply migrations up to head
	docker compose exec api alembic upgrade head

revision: ## Autogenerate a new migration (usage: make revision m="add users table")
	uv run alembic revision --autogenerate -m "$(m)"

docker-build: ##
	docker compose build

docker-up: ## Start api + db + adminer
	docker compose up -d

docker-down: ## Stop and remove containers
	docker compose down

docker-logs: ## Tail logs from all services
	docker compose logs -f

precommit: ## Run all pre-commit hooks against the whole repo
	uv run pre-commit run --all-files

clean: ## Remove caches and bytecode
	find . -type d -name '__pycache__' -exec rm -rf {} +
	rm -rf .pytest_cache .ruff_cache


# sudo -n ss -ltnp 2>&1
#sudo systemctl restart docker
#sudo systemctl stop postgresql@14-main.service

# Dans ton dossier backend/
#export MIGRATION_DATABASE_URL="postgresql+psycopg://USER:PASS@ep-xxx.neon.tech/financeiq?sslmode=require" \
#uv run alembic upgrade head
