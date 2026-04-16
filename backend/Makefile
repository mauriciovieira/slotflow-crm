.PHONY: lint format test

lint:
	python -m ruff check .
	python -m ruff format --check .

format:
	python -m ruff format .

test:
	python -m pytest -q
