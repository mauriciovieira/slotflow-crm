.PHONY: help lint test test-unit test-e2e ci install dev setup-local-db reset-local-db migrations migrate ensure-superuser bootstrap-local shell-simple shell shell-sql shell-sql-full show_urls

help:
	@echo "Slotflow CRM — targets (run from repo root):"
	@echo ""
	@echo "Setup & local DB"
	@echo "  install              Backend venv + dev deps; frontend npm install"
	@echo "  setup-local-db       Create Postgres role/database from .env"
	@echo "  reset-local-db       Drop and recreate DB (needs CONFIRM_RESET_LOCAL_DB=1)"
	@echo "  bootstrap-local      setup-local-db + migrate + ensure-superuser"
	@echo ""
	@echo "Django (uses .env + backend/.venv)"
	@echo "  migrations           makemigrations"
	@echo "  migrate              migrate (optional: app=<label>, e.g. app=core)"
	@echo "  ensure-superuser     ensure_superuser management command"
	@echo "  shell-simple         manage.py shell"
	@echo "  shell                manage.py shell_plus"
	@echo "  shell-sql            shell_plus --print-sql"
	@echo "  shell-sql-full       shell_plus --print-sql --truncate-sql=5000"
	@echo "  show_urls            django-extensions show_urls"
	@echo ""
	@echo "Dev & CI"
	@echo "  dev                  honcho Procfile.dev"
	@echo "  lint                 backend ruff + frontend lint"
	@echo "  test / test-unit     backend pytest + frontend tests"
	@echo "  test-e2e             Playwright e2e"
	@echo "  ci                   lint + test-unit + test-e2e"

install:
	@test -x backend/.venv/bin/python || (echo >&2 "Missing backend/.venv. Run: cd backend && python -m venv .venv"; exit 1)
	$(MAKE) -C backend install-dev
	$(MAKE) -C frontend install

dev:
	@test -x backend/.venv/bin/honcho || (echo >&2 "Missing backend/.venv and Honcho. Run: make install"; exit 1)
	@cd "$(CURDIR)" && exec backend/.venv/bin/honcho start -f Procfile.dev

setup-local-db:
	@test -f .env || (echo >&2 "Missing .env. Run: cp .env.example .env"; exit 1)
	@command -v psql >/dev/null 2>&1 || (echo >&2 "Missing psql in PATH"; exit 1)
	@set -a; . ./.env; set +a; \
	DB_USER="$${POSTGRES_USER:-slotflow}"; \
	DB_PASSWORD="$${POSTGRES_PASSWORD:-slotflow}"; \
	DB_NAME="$${POSTGRES_DB:-slotflow}"; \
	echo "$$DB_USER" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*$$' || (echo >&2 "Invalid POSTGRES_USER. Use letters, digits, underscore; must start with letter/underscore."; exit 1); \
	echo "$$DB_NAME" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*$$' || (echo >&2 "Invalid POSTGRES_DB. Use letters, digits, underscore; must start with letter/underscore."; exit 1); \
	DB_USER_SQL="$$(printf "%s" "$$DB_USER" | sed "s/'/''/g")"; \
	DB_NAME_SQL="$$(printf "%s" "$$DB_NAME" | sed "s/'/''/g")"; \
	DB_PASSWORD_SQL="$$(printf "%s" "$$DB_PASSWORD" | sed "s/'/''/g")"; \
	echo "Ensuring role '$$DB_USER' and database '$$DB_NAME' exist..."; \
	psql postgres -tAc "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = '$$DB_USER_SQL'" | grep -q 1 || \
	  psql postgres -c "CREATE ROLE \"$$DB_USER\" LOGIN CREATEDB PASSWORD '$$DB_PASSWORD_SQL';"; \
	psql postgres -c "ALTER ROLE \"$$DB_USER\" CREATEDB PASSWORD '$$DB_PASSWORD_SQL';"; \
	psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$$DB_NAME_SQL'" | grep -q 1 || \
	  psql postgres -c "CREATE DATABASE \"$$DB_NAME\" OWNER \"$$DB_USER\";"; \
	echo "Local database setup done."

reset-local-db:
	@test -f .env || (echo >&2 "Missing .env. Run: cp .env.example .env"; exit 1)
	@command -v psql >/dev/null 2>&1 || (echo >&2 "Missing psql in PATH"; exit 1)
	@test "$(CONFIRM_RESET_LOCAL_DB)" = "1" || (echo >&2 "Refusing to reset DB. Re-run with: make reset-local-db CONFIRM_RESET_LOCAL_DB=1"; exit 1)
	@set -a; . ./.env; set +a; \
	DB_USER="$${POSTGRES_USER:-slotflow}"; \
	DB_PASSWORD="$${POSTGRES_PASSWORD:-slotflow}"; \
	DB_NAME="$${POSTGRES_DB:-slotflow}"; \
	echo "$$DB_USER" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*$$' || (echo >&2 "Invalid POSTGRES_USER. Use letters, digits, underscore; must start with letter/underscore."; exit 1); \
	echo "$$DB_NAME" | grep -Eq '^[A-Za-z_][A-Za-z0-9_]*$$' || (echo >&2 "Invalid POSTGRES_DB. Use letters, digits, underscore; must start with letter/underscore."; exit 1); \
	DB_USER_SQL="$$(printf "%s" "$$DB_USER" | sed "s/'/''/g")"; \
	DB_NAME_SQL="$$(printf "%s" "$$DB_NAME" | sed "s/'/''/g")"; \
	DB_PASSWORD_SQL="$$(printf "%s" "$$DB_PASSWORD" | sed "s/'/''/g")"; \
	echo "Resetting local database '$$DB_NAME' (owner '$$DB_USER')..."; \
	psql postgres -tAc "SELECT 1 FROM pg_catalog.pg_roles WHERE rolname = '$$DB_USER_SQL'" | grep -q 1 || \
	  psql postgres -c "CREATE ROLE \"$$DB_USER\" LOGIN CREATEDB PASSWORD '$$DB_PASSWORD_SQL';"; \
	psql postgres -c "ALTER ROLE \"$$DB_USER\" CREATEDB PASSWORD '$$DB_PASSWORD_SQL';"; \
	psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$$DB_NAME_SQL'" | grep -q 1 && \
	  psql postgres -c "DROP DATABASE \"$$DB_NAME\" WITH (FORCE);" || :; \
	psql postgres -c "CREATE DATABASE \"$$DB_NAME\" OWNER \"$$DB_USER\";"; \
	echo "Local database reset done."

# Optional: migrate one app, e.g. make migrate app=core
migrations:
	@test -f .env || (echo >&2 "Missing .env. Run: cp .env.example .env"; exit 1)
	@test -x backend/.venv/bin/python || (echo >&2 "Missing backend/.venv. Run: cd backend && python -m venv .venv"; exit 1)
	@set -a; . ./.env; set +a; cd backend && .venv/bin/python manage.py makemigrations

migrate:
	@test -f .env || (echo >&2 "Missing .env. Run: cp .env.example .env"; exit 1)
	@test -x backend/.venv/bin/python || (echo >&2 "Missing backend/.venv. Run: cd backend && python -m venv .venv"; exit 1)
ifeq ($(app),)
	@set -a; . ./.env; set +a; cd backend && .venv/bin/python manage.py migrate
else
	@set -a; . ./.env; set +a; cd backend && .venv/bin/python manage.py migrate $(app)
endif

shell-simple:
	@test -f .env || (echo >&2 "Missing .env. Run: cp .env.example .env"; exit 1)
	@test -x backend/.venv/bin/python || (echo >&2 "Missing backend/.venv. Run: cd backend && python -m venv .venv"; exit 1)
	@set -a; . ./.env; set +a; cd backend && .venv/bin/python manage.py shell

shell:
	@test -f .env || (echo >&2 "Missing .env. Run: cp .env.example .env"; exit 1)
	@test -x backend/.venv/bin/python || (echo >&2 "Missing backend/.venv. Run: cd backend && python -m venv .venv"; exit 1)
	@set -a; . ./.env; set +a; cd backend && .venv/bin/python manage.py shell_plus

shell-sql:
	@test -f .env || (echo >&2 "Missing .env. Run: cp .env.example .env"; exit 1)
	@test -x backend/.venv/bin/python || (echo >&2 "Missing backend/.venv. Run: cd backend && python -m venv .venv"; exit 1)
	@set -a; . ./.env; set +a; cd backend && .venv/bin/python manage.py shell_plus --print-sql

shell-sql-full:
	@test -f .env || (echo >&2 "Missing .env. Run: cp .env.example .env"; exit 1)
	@test -x backend/.venv/bin/python || (echo >&2 "Missing backend/.venv. Run: cd backend && python -m venv .venv"; exit 1)
	@set -a; . ./.env; set +a; cd backend && .venv/bin/python manage.py shell_plus --print-sql --truncate-sql=5000

show_urls:
	@test -f .env || (echo >&2 "Missing .env. Run: cp .env.example .env"; exit 1)
	@test -x backend/.venv/bin/python || (echo >&2 "Missing backend/.venv. Run: cd backend && python -m venv .venv"; exit 1)
	@set -a; . ./.env; set +a; cd backend && .venv/bin/python manage.py show_urls

ensure-superuser:
	@test -f .env || (echo >&2 "Missing .env. Run: cp .env.example .env"; exit 1)
	@test -x backend/.venv/bin/python || (echo >&2 "Missing backend/.venv. Run: cd backend && python -m venv .venv"; exit 1)
	@set -a; . ./.env; set +a; cd backend && .venv/bin/python manage.py ensure_superuser

bootstrap-local: setup-local-db migrate ensure-superuser

lint:
	$(MAKE) -C backend lint
	$(MAKE) -C frontend lint

test-unit:
	$(MAKE) -C backend test
	$(MAKE) -C frontend test

test: test-unit

test-e2e:
	$(MAKE) -C e2e test

ci: lint test-unit test-e2e
