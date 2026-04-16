# Slotflow CRM

CRM multi-tenant para oportunidades, pipeline de entrevistas e currículos (MVP). Stack: **Django** (API + admin), **React** (frontend), **PostgreSQL**, **Redis** + **Celery**.

## Desenvolvimento local (macOS)

### Ferramentas

| Uso | Como |
|-----|------|
| Python **3.14** e Node **24** | **[mise](https://mise.jdx.dev/)** — na raiz do repo: `mise install` (lê `.tool-versions` e `.nvmrc`) |
| PostgreSQL **18** | **Homebrew** (`postgresql@18`), não via mise |
| Redis | **Homebrew** (`redis`), não via mise |

Ative o ambiente do mise no shell (`mise activate` ou integração do Oh My Zsh, etc.) para que `python` e `node` apontem para as versões do projeto.

### Banco e Redis (Homebrew)

```bash
brew install postgresql@18 redis
brew services start postgresql@18
brew services start redis
```

Coloque o cliente `psql` do PostgreSQL 18 no `PATH` (Apple Silicon costuma ser `/opt/homebrew/opt/postgresql@18/bin`; Intel: `/usr/local/opt/postgresql@18/bin`):

```bash
export PATH="$(brew --prefix postgresql@18)/bin:$PATH"
```

Crie usuário e banco alinhados ao padrão do Django em `config.settings.base` (`slotflow` / `slotflow` em `127.0.0.1:5432`):

```bash
psql postgres -c "CREATE USER slotflow WITH PASSWORD 'slotflow';"
psql postgres -c "CREATE DATABASE slotflow OWNER slotflow;"
```

(Se já existirem, ignore o erro ou use `CREATE DATABASE` apenas.)

### Backend

```bash
cd backend
python -m venv .venv
source .venv/bin/activate
python -m pip install -r requirements-dev.txt
export DJANGO_SETTINGS_MODULE=config.settings.local
python manage.py migrate
python manage.py runserver
```

Variáveis úteis (opcional, `backend/.env` é carregado automaticamente se existir):

- `POSTGRES_*` — só se não usar os defaults (`POSTGRES_DB`, `POSTGRES_USER`, `POSTGRES_PASSWORD`, `POSTGRES_HOST`, `POSTGRES_PORT`)
- `REDIS_URL` — default `redis://127.0.0.1:6379/0`
- `DJANGO_DEBUG=1` — já implícito em `local.py`

**Sem PostgreSQL:** use SQLite só para subir rápido: `export SLOTFLOW_USE_SQLITE=1` (ver `config.settings.local`).

**Celery (filas):** com Redis no ar:

```bash
cd backend && source .venv/bin/activate
export DJANGO_SETTINGS_MODULE=config.settings.local
celery -A config worker -l info
```

### Frontend e E2E

```bash
cd frontend && npm ci && npm run lint && npm test
cd e2e && npm ci && npx playwright install chromium && npm test
```

### Tudo junto (lint + testes)

Na raiz do repositório:

```bash
make ci
```

Detalhes extras e paridade com CI: `docs/dev-setup.md`. Especificação funcional: `docs/superpowers/specs/2026-04-16-slotflow-crm-design.md`.
