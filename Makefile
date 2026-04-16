.PHONY: lint test-unit test-e2e ci

lint:
	$(MAKE) -C backend lint
	$(MAKE) -C frontend lint

test-unit:
	$(MAKE) -C backend test
	$(MAKE) -C frontend test

test-e2e:
	$(MAKE) -C e2e test

ci: lint test-unit test-e2e
