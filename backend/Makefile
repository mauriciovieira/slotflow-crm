.PHONY: lint format test

PYTHON ?= python3
PY := $(shell if [ -x .venv/bin/python ]; then echo .venv/bin/python; else echo $(PYTHON); fi)

lint:
	$(PY) -m ruff check .
	$(PY) -m ruff format --check .

format:
	$(PY) -m ruff format .

test:
	$(PY) -m pytest -q
