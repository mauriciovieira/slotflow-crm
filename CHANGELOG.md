# [1.4.0](https://github.com/mauriciovieira/slotflow-crm/compare/root-v1.3.0...root-v1.4.0) (2026-04-25)


### Features

* **backend:** add Opportunity model ([#16](https://github.com/mauriciovieira/slotflow-crm/issues/16)) ([e3582f1](https://github.com/mauriciovieira/slotflow-crm/commit/e3582f1b0b2a9d05fa518c61d10688aae0f7cd75))

# [1.3.0](https://github.com/mauriciovieira/slotflow-crm/compare/root-v1.2.0...root-v1.3.0) (2026-04-25)


### Features

* **frontend:** dashboard shell with stub nav panels ([#15](https://github.com/mauriciovieira/slotflow-crm/issues/15)) ([0f381e8](https://github.com/mauriciovieira/slotflow-crm/commit/0f381e8570606cde87448b3aa70bf7210f241e52))

# [1.2.0](https://github.com/mauriciovieira/slotflow-crm/compare/root-v1.1.0...root-v1.2.0) (2026-04-22)


### Features

* **backend:** dev-only SLOTFLOW_BYPASS_2FA flag for e2e ([aac93d0](https://github.com/mauriciovieira/slotflow-crm/commit/aac93d05d2e3f8ef787b6a0ba3de370759d85835))

# [1.1.0](https://github.com/mauriciovieira/slotflow-crm/compare/root-v1.0.1...root-v1.1.0) (2026-04-19)


### Bug Fixes

* replace comment for migrate task ([01e0624](https://github.com/mauriciovieira/slotflow-crm/commit/01e06243f687928033a48a8598d4335b5608a54f))


### Features

* **dev:** Makefile help, per-app migrate, shell_plus and show_urls ([5ae5588](https://github.com/mauriciovieira/slotflow-crm/commit/5ae55884f5d6c38fa4247df172aa4899a7296a6a))
* **dev:** seed admin TOTP device from SLOTFLOW_ADMIN_TOTP_KEY in .env ([77f6f27](https://github.com/mauriciovieira/slotflow-crm/commit/77f6f275027dfc9b6f856a716245817b32f1446b))

## [1.0.1](https://github.com/mauriciovieira/slotflow-crm/compare/root-v1.0.0...root-v1.0.1) (2026-04-18)


### Bug Fixes

* **root:** use absolute paths for root CHANGELOG.md in release config ([#10](https://github.com/mauriciovieira/slotflow-crm/issues/10)) ([402854c](https://github.com/mauriciovieira/slotflow-crm/commit/402854c429927c03febee80ab35f7f8a8c17f1e1))

# 1.0.0 (2026-04-18)


### Bug Fixes

* address Copilot review — healthz version assert, branch -vv parsing ([0a5b0a8](https://github.com/mauriciovieira/slotflow-crm/commit/0a5b0a893dd006a337b737b5bd6797d87fef080c))
* address Copilot review comments ([519a89c](https://github.com/mauriciovieira/slotflow-crm/commit/519a89c3009bb4a9742b265f136f2238093b0563))
* **ci:** address Copilot review — frontend GITHUB_OUTPUT quoting, changelog link ([752a69b](https://github.com/mauriciovieira/slotflow-crm/commit/752a69b24bff5198d82bfb15a1f946a7cb557358))
* **dev:** add ensure_superuser command and local bootstrap targets ([962e501](https://github.com/mauriciovieira/slotflow-crm/commit/962e50165822cbcd957bab6e45857039daf56fe7))
* make setup-local-db role creation SQL compatible with psql ([c0856d1](https://github.com/mauriciovieira/slotflow-crm/commit/c0856d191461813c12d300855d07d5779dce8663))


### Features

* add Honcho, Procfiles, make install/dev, and repo-root dotenv ([d27ef0a](https://github.com/mauriciovieira/slotflow-crm/commit/d27ef0a3276da2ac3ebb9fcf99e4d635442dea32))
* add make reset-local-db target ([f764266](https://github.com/mauriciovieira/slotflow-crm/commit/f764266700443aa58734f95ac216991c8e88c8bc))
* add make setup-local-db using .env Postgres vars ([df34e73](https://github.com/mauriciovieira/slotflow-crm/commit/df34e7343d47ebd2cbd929682020a4ed2d0aead5))
* add make test and grant CREATEDB in local DB setup ([4616bf3](https://github.com/mauriciovieira/slotflow-crm/commit/4616bf3481958872aa0570f5e7a7a9eae155172c))
* add version metadata, healthz endpoint, release workflow, and AGENTS sync ([5ff3fdc](https://github.com/mauriciovieira/slotflow-crm/commit/5ff3fdc5ba691765e5e2609435a089c18d7c09e0))
* **backend:** bootstrap Django platform foundation ([8666061](https://github.com/mauriciovieira/slotflow-crm/commit/866606193e9981e3fa4298a69a4c7924187aa87c))
* five-package release automation ([#9](https://github.com/mauriciovieira/slotflow-crm/issues/9)) ([1a97b11](https://github.com/mauriciovieira/slotflow-crm/commit/1a97b111d395638c83f559bd4d8704f5c94d69ac))
* **frontend:** brand SVGs and React app scaffold ([#8](https://github.com/mauriciovieira/slotflow-crm/issues/8)) ([c10d4d4](https://github.com/mauriciovieira/slotflow-crm/commit/c10d4d471af44c02acb22183822001581c7b0dc0))
