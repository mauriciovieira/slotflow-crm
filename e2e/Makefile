.PHONY: install test

install:
	npm ci
	@if [ "$$(uname -s)" = "Linux" ]; then \
	  npx playwright install --with-deps chromium; \
	else \
	  npx playwright install chromium; \
	fi

test:
	npm test
