---
applyTo: "frontend/**"
---

# Frontend (Vite + TypeScript + React + Vitest)

Read `repo.instructions.md` first. This file covers frontend-specific gotchas.

## Copilot review priorities

- Flag hardcoded API URLs; frontend code should use the existing client and env-driven base URL.
- Flag tests whose mocks no longer match the component's actual `useQuery` / `useMutation` call signatures.
- For async UI, prefer tests that use `screen.findBy*` instead of asserting before data has rendered.
- For new interactive UI, check keyboard access, labels, and obvious focus states.
- New screens should follow the existing slice shape: data fetch hook, screen component, and screen test.
- UI changes should align with `DESIGN.md` instead of introducing one-off colors, spacing, or radii.

## Toolchain

- **Package manager:** `npm` with `package-lock.json`. Install via `make install` (which runs `npm ci`). Use `npm ci` (not `npm install`) for reproducible installs from the lockfile.
- **Bundler:** Vite. Config in `vite.config.ts`.
- **Tests:** Vitest. Config in `vitest.config.ts`. Run: `make -C frontend test`. Single file: `(cd frontend && npx vitest run src/path/Thing.test.tsx)`.
- **Lint:** ESLint flat config in `eslint.config.js`. Run: `make -C frontend lint`.
- **Styling:** Tailwind. Config in `tailwind.config.ts`. Visual design spec lives in `DESIGN.md` at the repo root — consult it before building UI (Mintlify-inspired colors, type scale, spacing, radii).

## Project state

The frontend is currently a **scaffold**. Core screens are landing one slice at a time. Before adding a new screen, look for an existing slice that is already wired through to a backend endpoint (see `frontend/src/screens/`) and follow the same shape: data fetch hook, screen component, screen test.

## Test conventions

- Files end in `.test.ts` or `.test.tsx` and live next to the unit they test.
- Mocks for `useMutation` / `useQuery` should reflect the **actual call signature** the component uses. If a component starts passing a second arg (e.g. `mutate(payload, { onError })`), the test must assert against that shape — not the old `mutate(payload)` shape.
- Prefer `screen.findBy*` for async UI; reserve `getBy*` for synchronously-rendered nodes.

## Common mistakes to avoid

- Running `npm install` instead of `npm ci`. The lockfile is the source of truth.
- Adding a top-level dependency at the repo root — there is no top-level `package.json`. All frontend deps go in `frontend/package.json`.
- Hardcoding API URLs. Use the existing client / env-driven base URL.
- Skipping `DESIGN.md` when adding UI. The design language is opinionated.

## Releases

Frontend has its own `semantic-release` pipeline driven by Conventional Commits scoped to `frontend/` paths. Tag format: `frontend-v{version}`. The release workflow is `.github/workflows/release.yml` (consolidated across the five package lines — backend, frontend, e2e, docs, root).
