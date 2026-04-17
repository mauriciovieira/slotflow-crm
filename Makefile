.PHONY: lint test-unit test-e2e ci install dev setup-local-db reset-local-db

install:
	@test -x backend/.venv/bin/python || (echo >&2 "Missing backend/.venv. Run: cd backend && python3 -m venv .venv"; exit 1)
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
	echo "Ensuring role '$$DB_USER' and database '$$DB_NAME' exist..."; \
	psql postgres -v db_user="$$DB_USER" -v db_password="$$DB_PASSWORD" \
	  -c "DO \$$do\$$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'db_user') THEN EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_password'); END IF; END \$$do\$$;"; \
	psql postgres -tAc "SELECT 1 FROM pg_database WHERE datname = '$$DB_NAME'" | grep -q 1 || \
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
	echo "Resetting local database '$$DB_NAME' (owner '$$DB_USER')..."; \
	psql postgres -v db_user="$$DB_USER" -v db_password="$$DB_PASSWORD" \
	  -c "DO \$$do\$$ BEGIN IF NOT EXISTS (SELECT FROM pg_catalog.pg_roles WHERE rolname = :'db_user') THEN EXECUTE format('CREATE ROLE %I LOGIN PASSWORD %L', :'db_user', :'db_password'); END IF; END \$$do\$$;"; \
	psql postgres -c "DROP DATABASE IF EXISTS \"$$DB_NAME\" WITH (FORCE);"; \
	psql postgres -c "CREATE DATABASE \"$$DB_NAME\" OWNER \"$$DB_USER\";"; \
	echo "Local database reset done."

lint:
	$(MAKE) -C backend lint
	$(MAKE) -C frontend lint

test-unit:
	$(MAKE) -C backend test
	$(MAKE) -C frontend test

test-e2e:
	$(MAKE) -C e2e test

ci: lint test-unit test-e2e
