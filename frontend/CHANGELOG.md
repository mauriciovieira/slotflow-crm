# [1.6.0](https://github.com/mauriciovieira/slotflow-crm/compare/frontend-v1.5.0...frontend-v1.6.0) (2026-04-25)


### Features

* **frontend:** opportunities list view at /dashboard/opportunities ([#20](https://github.com/mauriciovieira/slotflow-crm/issues/20)) ([8ee2eb4](https://github.com/mauriciovieira/slotflow-crm/commit/8ee2eb48da747848a0b1085e2b1fe444f2280ad1))

# [1.5.0](https://github.com/mauriciovieira/slotflow-crm/compare/frontend-v1.4.0...frontend-v1.5.0) (2026-04-25)


### Features

* **frontend:** dashboard shell with stub nav panels ([#15](https://github.com/mauriciovieira/slotflow-crm/issues/15)) ([0f381e8](https://github.com/mauriciovieira/slotflow-crm/commit/0f381e8570606cde87448b3aa70bf7210f241e52))

# [1.4.0](https://github.com/mauriciovieira/slotflow-crm/compare/frontend-v1.3.0...frontend-v1.4.0) (2026-04-24)


### Bug Fixes

* **frontend:** check is_verified before has_totp_device in auth routing ([054ae30](https://github.com/mauriciovieira/slotflow-crm/commit/054ae305b596d8d43212cefea47ba24cc8b1a17d))


### Features

* **frontend:** add shared testIds + wire data-testid on auth surfaces ([dc7246c](https://github.com/mauriciovieira/slotflow-crm/commit/dc7246cb030f14e1dba28132ee2b0ef0baf3a624))

# [1.3.0](https://github.com/mauriciovieira/slotflow-crm/compare/frontend-v1.2.0...frontend-v1.3.0) (2026-04-22)


### Bug Fixes

* apply remaining review feedback on whitespace normalisation, frozen time, Content-Type guard, and mock reset ([5e17101](https://github.com/mauriciovieira/slotflow-crm/commit/5e171011d5f60968d9c61f66c8304bfad56f225c))
* **frontend:** apiFetch tolerates non-JSON error responses ([7cd33df](https://github.com/mauriciovieira/slotflow-crm/commit/7cd33dfdef15156b00363667c78c300336fdca57))
* **frontend:** AuthGuard redirects to /login on useMe error ([72bc933](https://github.com/mauriciovieira/slotflow-crm/commit/72bc9337ffbd96c1b0bcbfe2bcb6d408bbc78a07))
* **frontend:** base TwoFactorVerify submit gate on normalized token length ([8121296](https://github.com/mauriciovieira/slotflow-crm/commit/81212960d28a4fb243150fc09be2d2bef053f183))
* **frontend:** TwoFactorSetup handles confirmed devices + normalized token gate ([e9f6765](https://github.com/mauriciovieira/slotflow-crm/commit/e9f6765dd469db1249a481c42fb52e5a4af2a0fa))
* **frontend:** TwoFactorSetup routes by confirm response is_verified ([791138c](https://github.com/mauriciovieira/slotflow-crm/commit/791138ca732640153818d19c08ab4f2b70b54fd4))


### Features

* **frontend:** 2FA Setup screen with inline SVG QR ([89f724a](https://github.com/mauriciovieira/slotflow-crm/commit/89f724aaa6870f4e8dde01a1e73b62e7b109ac2b))
* **frontend:** 2FA Verify screen + register auth routes ([7ad05ce](https://github.com/mauriciovieira/slotflow-crm/commit/7ad05ceb4a5e3bd423d43603a6d957bf525bb499))
* **frontend:** auth-aware Landing header with sign-out ([a80fda6](https://github.com/mauriciovieira/slotflow-crm/commit/a80fda6734662cd5561ffdc640c7e533a66e8fb1))
* **frontend:** AuthGuard route gate + RTL providers helper ([df9f31b](https://github.com/mauriciovieira/slotflow-crm/commit/df9f31b2bcd406404063458f48bb07ae8754624f))
* **frontend:** CSRF-aware apiFetch + ApiError ([ad281a9](https://github.com/mauriciovieira/slotflow-crm/commit/ad281a9a0c043e945915187122c5e6ca0140bf84))
* **frontend:** Login screen with password + SSO placeholders ([8fbc6b3](https://github.com/mauriciovieira/slotflow-crm/commit/8fbc6b313367807f4cc04abf58c6eecccbc51025))
* **frontend:** proxy /api to Django in Vite dev ([e6cd390](https://github.com/mauriciovieira/slotflow-crm/commit/e6cd3902d39900ec5b8f22847386fb143977c6b6))
* **frontend:** TanStack Query hooks for /api/auth/ ([7673dcb](https://github.com/mauriciovieira/slotflow-crm/commit/7673dcbd675fb918945f8193bc2a59c6e1bc6f75))

# [1.2.0](https://github.com/mauriciovieira/slotflow-crm/compare/frontend-v1.1.0...frontend-v1.2.0) (2026-04-18)


### Features

* **frontend:** brand SVGs and React app scaffold ([#8](https://github.com/mauriciovieira/slotflow-crm/issues/8)) ([c10d4d4](https://github.com/mauriciovieira/slotflow-crm/commit/c10d4d471af44c02acb22183822001581c7b0dc0))

# [1.1.0](https://github.com/mauriciovieira/slotflow-crm/compare/frontend-v1.0.0...frontend-v1.1.0) (2026-04-18)


### Bug Fixes

* **frontend:** add [data-theme] baseline rule to tokens.css ([1e9ba18](https://github.com/mauriciovieira/slotflow-crm/commit/1e9ba188ec46624d37b54f382cc50b1cd0ea835d)), closes [#7](https://github.com/mauriciovieira/slotflow-crm/issues/7)
* **frontend:** drop unused shadow import in tailwind preset ([d51a1aa](https://github.com/mauriciovieira/slotflow-crm/commit/d51a1aa9b553b0769923179080669c2757578170))
* **frontend:** harden theme module against storage and scheduling edge cases ([82daf80](https://github.com/mauriciovieira/slotflow-crm/commit/82daf8013fc5cf022610845d415ef496e2bf5c97)), closes [#7](https://github.com/mauriciovieira/slotflow-crm/issues/7)


### Features

* **frontend:** add design tokens, tailwind preset, and theme resolver ([5ce587e](https://github.com/mauriciovieira/slotflow-crm/commit/5ce587eb965a048aea07580c721b47247529fb2e))

# 1.0.0 (2026-04-17)


### Features

* add Honcho, Procfiles, make install/dev, and repo-root dotenv ([d27ef0a](https://github.com/mauriciovieira/slotflow-crm/commit/d27ef0a3276da2ac3ebb9fcf99e4d635442dea32))
* **release:** add semantic-release and frontend changelog ([1c295af](https://github.com/mauriciovieira/slotflow-crm/commit/1c295af33d895af2b7ed9662901304b607248389))

# Changelog

All notable changes to the Slotflow CRM frontend are documented here.

Releases are automated from [Conventional Commits](https://www.conventionalcommits.org/) on the default branch.

## Unreleased

- Initial changelog; upcoming releases will appear below.
