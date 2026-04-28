.PHONY: lint format test install install-dev

PYTHON ?= python3
PY := $(shell if [ -x .venv/bin/python ]; then echo .venv/bin/python; else echo $(PYTHON); fi)

install:
	$(PY) -m pip install -r requirements.txt

install-dev:
	$(PY) -m pip install -r requirements-dev.txt

lint:
	$(PY) -m ruff check .
	$(PY) -m ruff format --check .

format:
	$(PY) -m ruff format .

test:
	SLOTFLOW_USE_SQLITE=1 $(PY) -m pytest -q
