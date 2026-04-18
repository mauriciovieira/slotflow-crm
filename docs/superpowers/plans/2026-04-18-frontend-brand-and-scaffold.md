# Frontend Brand + Scaffold Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Regenerate the four brand SVGs from the Slotflow design handoff and scaffold the `frontend/` package into a runnable Vite + React + TypeScript app wired to the existing design tokens, Tailwind preset, and theme resolver — ending with a dev server rendering a Landing placeholder featuring the correct logomark and a working FOUC-free theme boot.

**Architecture:**
Brand assets ship as hand-authored static SVGs mirroring the geometry in `docs/design_handoff_slotflow_crm/prototype/components/brand.jsx`. The app scaffold is Vite + React 19 + TypeScript with Tailwind v3 (the existing `tailwind.preset.ts` is v3-shaped), TanStack Query v5, and React Router v7 (data router). The theme resolver is boot-injected via an inline `<script>` in `index.html` whose body is kept in sync with `frontend/src/design/theme.ts::beforePaintScript` through a dedicated unit test.

**Tech Stack:**
- React 19 + React DOM 19
- Vite 7 + @vitejs/plugin-react
- TypeScript 5.9 (already pinned at repo root)
- React Router 7 (`createBrowserRouter` / `RouterProvider`)
- TanStack Query 5 (`@tanstack/react-query`)
- Tailwind CSS 3 + PostCSS + autoprefixer
- Vitest 4 (already installed) with jsdom environment
- @testing-library/react 16 + @testing-library/jest-dom + @testing-library/user-event
- Node 24 per repo `.nvmrc`

---

## Preconditions

- PR #7 (`feat/design-system-foundation`) has merged to `main`.
- Local `main` updated: `git fetch origin --prune && git checkout main && git pull --ff-only`.
- Node 24 active: `node --version` should print `v24.*`. If not, use the repo-standard toolchain setup first: `mise install` (reads `.tool-versions` / `.nvmrc`) and re-check `node --version`. If you do not use `mise`, fallback: `nvm install 24 && nvm use 24`.

## Worktree setup

Run from the main repo root:

```bash
git worktree add -b feat/frontend-brand-and-scaffold .worktrees/feat-frontend-brand-and-scaffold main
cd .worktrees/feat-frontend-brand-and-scaffold
```

All subsequent tasks execute inside that worktree. Paths in this plan are **relative to the worktree root** unless absolute.

## File structure (what this plan creates or modifies)

**Create:**
- `frontend/src/assets/brand/logomark.svg` — three-slot flow curve, dark square (default variant)
- `frontend/src/assets/brand/logomark-dark.svg` — light-square variant for use on dark backgrounds
- `frontend/src/assets/brand/lockup.svg` — logomark + "Slotflow" wordmark, horizontal
- `frontend/src/assets/brand/favicon.svg` — logomark optimized for 16px rendering
- `frontend/index.html` — Vite HTML entry with inline theme boot script and favicon link
- `frontend/vite.config.ts` — Vite config with React plugin
- `frontend/tailwind.config.ts` — Tailwind config importing the existing preset
- `frontend/postcss.config.js` — PostCSS plugins
- `frontend/src/styles.css` — `@tailwind` directives + `tokens.css` import
- `frontend/src/main.tsx` — React root mounting `<App />` onto `#root`
- `frontend/src/App.tsx` — top-level providers (QueryClientProvider + RouterProvider)
- `frontend/src/router.tsx` — `createBrowserRouter` config, `/` → `<Landing />`
- `frontend/src/lib/queryClient.ts` — shared `QueryClient` instance
- `frontend/src/screens/Landing.tsx` — placeholder landing with lockup + hero tagline
- `frontend/src/screens/Landing.test.tsx` — RTL smoke test for the landing render
- `frontend/src/vitest.setup.ts` — jest-dom matchers setup
- `frontend/src/design/themeBoot.test.ts` — guards sync between `index.html` inline script and `beforePaintScript`

**Modify:**
- `frontend/package.json` — add runtime deps, dev deps, new scripts (`dev`, `build`, `preview`)
- `frontend/vitest.config.ts` — switch environment to jsdom, register setup file
- `frontend/tsconfig.json` — add JSX, bundler resolution, DOM lib, src include
- `frontend/eslint.config.js` — add React + browser globals
- `frontend/Makefile` — add `dev` + `build` targets

**Delete:**
- `frontend/src/sum.ts`
- `frontend/src/sum.test.ts`

(Placeholders from the pre-scaffold state. Replaced by the real app entry and its tests.)

## Parallel-track dependencies

This plan has **no backend dependencies**. It produces a static landing placeholder with no API calls. Dependencies on backend contracts (Track 04: auth, MCP, session cookies; Tracks 05/06: opportunities/resumes/interviews data) are deferred to subsequent plans that follow this one.

---

## Phase 1 — Brand SVGs

### Task 1.1: Create `logomark.svg` (default, dark square)

**Files:**
- Create: `frontend/src/assets/brand/logomark.svg`

- [ ] **Step 1: Write the file**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" role="img" aria-label="Slotflow">
  <rect x="0" y="0" width="24" height="24" rx="6" fill="#0d0d0d"/>
  <rect x="4.5" y="13" width="3" height="6.5" rx="1.25" fill="#ededed" opacity="0.55"/>
  <rect x="10.5" y="9.5" width="3" height="10" rx="1.25" fill="#ededed" opacity="0.55"/>
  <rect x="16.5" y="6" width="3" height="13.5" rx="1.25" fill="#ededed" opacity="0.55"/>
  <path d="M 6 13 C 8.5 11.5, 9.5 10.5, 12 9.5 C 14.5 8.5, 15.5 7, 18 6" stroke="#14C98B" stroke-width="2.25" stroke-linecap="round" fill="none"/>
  <circle cx="18" cy="6" r="1.85" fill="#14C98B"/>
</svg>
```

Geometry matches `docs/design_handoff_slotflow_crm/prototype/components/brand.jsx::Logomark` with `tone` defaulting to dark and rounded=true.

- [ ] **Step 2: Visually verify**

Open the file directly in a browser or in your editor's SVG preview. Compare side-by-side with `docs/design_handoff_slotflow_crm/prototype/components/brand.jsx` by opening `docs/design_handoff_slotflow_crm/prototype/index.html` in a browser (no build needed — uses Babel Standalone). The logomark in the top-left of the prototype canvas should match pixel-for-pixel at 24px.

Expected: three light rounded bars at increasing heights inside a dark rounded square, a mint curve arcing across their tops, a mint dot at the top-right terminus.

### Task 1.2: Create `logomark-dark.svg` (light-square variant)

**Files:**
- Create: `frontend/src/assets/brand/logomark-dark.svg`

- [ ] **Step 1: Write the file**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="24" height="24" role="img" aria-label="Slotflow">
  <rect x="0" y="0" width="24" height="24" rx="6" fill="#ededed"/>
  <rect x="4.5" y="13" width="3" height="6.5" rx="1.25" fill="#0d0d0d" opacity="0.55"/>
  <rect x="10.5" y="9.5" width="3" height="10" rx="1.25" fill="#0d0d0d" opacity="0.55"/>
  <rect x="16.5" y="6" width="3" height="13.5" rx="1.25" fill="#0d0d0d" opacity="0.55"/>
  <path d="M 6 13 C 8.5 11.5, 9.5 10.5, 12 9.5 C 14.5 8.5, 15.5 7, 18 6" stroke="#14C98B" stroke-width="2.25" stroke-linecap="round" fill="none"/>
  <circle cx="18" cy="6" r="1.85" fill="#14C98B"/>
</svg>
```

Matches `Logomark` with `tone="light"` — light square, dark bars, same mint accent.

- [ ] **Step 2: Visually verify** on a dark background (temporarily set browser body to `#0d0d0d` in DevTools). The mark should remain readable; bars should appear as recessed slots against the light square.

### Task 1.3: Create `lockup.svg` (logomark + wordmark)

**Files:**
- Create: `frontend/src/assets/brand/lockup.svg`

- [ ] **Step 1: Write the file**

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 130 22" width="130" height="22" role="img" aria-label="Slotflow">
  <g>
    <rect x="0" y="0" width="22" height="22" rx="5.5" fill="#0d0d0d"/>
    <rect x="4.125" y="11.917" width="2.75" height="5.958" rx="1.146" fill="#ededed" opacity="0.55"/>
    <rect x="9.625" y="8.708" width="2.75" height="9.167" rx="1.146" fill="#ededed" opacity="0.55"/>
    <rect x="15.125" y="5.5" width="2.75" height="12.375" rx="1.146" fill="#ededed" opacity="0.55"/>
    <path d="M 5.5 11.917 C 7.792 10.542, 8.708 9.625, 11 8.708 C 13.292 7.792, 14.208 6.417, 16.5 5.5" stroke="#14C98B" stroke-width="2.063" stroke-linecap="round" fill="none"/>
    <circle cx="16.5" cy="5.5" r="1.696" fill="#14C98B"/>
  </g>
  <text x="30" y="16" font-family="Inter, system-ui, sans-serif" font-weight="600" font-size="20" letter-spacing="-0.32" fill="#0d0d0d">Slotflow</text>
</svg>
```

Logomark scaled to 22×22 (per `Lockup` component: `markSize = Math.round(size * 1.1)` at size=20). 8px gap then wordmark at 20px Inter 600 with tracking −0.016 × 20 = −0.32px. All geometry scaled from the 24×24 canonical logomark by 22/24 ≈ 0.9167.

- [ ] **Step 2: Visually verify** — open the file. Expect the 22px mark, 8px gap, then "Slotflow" wordmark. Wordmark will fall back to system-ui in the preview (Inter isn't embedded in the SVG); in-app it will use the loaded Inter webfont.

### Task 1.4: Create `favicon.svg`

**Files:**
- Create: `frontend/src/assets/brand/favicon.svg`

- [ ] **Step 1: Write the file**

Same geometry as `logomark.svg` but with `<svg>` sized and viewBox tuned for 16px favicon rendering. The three-bar + curve + dot detail survives down to 16px.

```xml
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width="16" height="16" role="img" aria-label="Slotflow">
  <rect x="0" y="0" width="24" height="24" rx="6" fill="#0d0d0d"/>
  <rect x="4.5" y="13" width="3" height="6.5" rx="1.25" fill="#ededed" opacity="0.55"/>
  <rect x="10.5" y="9.5" width="3" height="10" rx="1.25" fill="#ededed" opacity="0.55"/>
  <rect x="16.5" y="6" width="3" height="13.5" rx="1.25" fill="#ededed" opacity="0.55"/>
  <path d="M 6 13 C 8.5 11.5, 9.5 10.5, 12 9.5 C 14.5 8.5, 15.5 7, 18 6" stroke="#14C98B" stroke-width="2.25" stroke-linecap="round" fill="none"/>
  <circle cx="18" cy="6" r="1.85" fill="#14C98B"/>
</svg>
```

- [ ] **Step 2: Visually verify at 16px.** Zoom out in the browser or preview at 16×16. Mint accent must remain visible; bars should not visually merge.

### Task 1.5: Commit brand assets

- [ ] **Step 1: Stage and commit**

```bash
git add frontend/src/assets/brand/
git commit -m "feat(frontend): regenerate brand SVGs to match handoff geometry

Replaces the old 'no symbol' logomark with the three-slot flow curve
design from docs/design_handoff_slotflow_crm/prototype/components/brand.jsx.
Ships logomark (dark square), logomark-dark (light square for dark bgs),
lockup (logomark + wordmark), and favicon."
```

---

## Phase 2 — Dependencies

### Task 2.1: Add runtime dependencies

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: From the `frontend/` directory, install runtime deps**

```bash
cd frontend
npm install \
  react@^19 \
  react-dom@^19 \
  react-router@^7 \
  @tanstack/react-query@^5
```

- [ ] **Step 2: Verify `package.json`** now has a `dependencies` block containing the four packages. Lockfile updated.

### Task 2.2: Add toolchain + test dev dependencies

- [ ] **Step 1: Install dev deps**

```bash
npm install --save-dev \
  vite@^7 \
  @vitejs/plugin-react@^5 \
  tailwindcss@^3.4 \
  postcss@^8 \
  autoprefixer@^10 \
  @types/react@^19 \
  @types/react-dom@^19 \
  @testing-library/react@^16 \
  @testing-library/jest-dom@^6 \
  @testing-library/user-event@^14 \
  jsdom@^25 \
  eslint-plugin-react@^7 \
  eslint-plugin-react-hooks@^5
```

- [ ] **Step 2: Verify** `package.json` `devDependencies` includes all listed packages. No peer-dep errors in `npm install` output (warnings tolerated).

- [ ] **Step 3: Run existing tests — still pass**

```bash
npx vitest run
```

Expected: `sum.test.ts` and `design/theme.test.ts` pass (5 tests total). The environment is still `node`; we'll switch to `jsdom` in Phase 3.

### Task 2.3: Commit dependencies

- [ ] **Step 1: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "feat(frontend): add React, Vite, Tailwind, and testing deps"
```

---

## Phase 3 — Toolchain configuration

### Task 3.1: Create `vite.config.ts`

**Files:**
- Create: `frontend/vite.config.ts`

- [ ] **Step 1: Write the file**

```typescript
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: { port: 5173 },
});
```

### Task 3.2: Create `tailwind.config.ts`

**Files:**
- Create: `frontend/tailwind.config.ts`

- [ ] **Step 1: Write the file**

```typescript
import type { Config } from "tailwindcss";
import slotflowPreset from "./src/design/tailwind.preset";

export default {
  presets: [slotflowPreset],
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
} satisfies Config;
```

### Task 3.3: Create `postcss.config.js`

**Files:**
- Create: `frontend/postcss.config.js`

- [ ] **Step 1: Write the file**

```javascript
export default {
  plugins: {
    tailwindcss: {},
    autoprefixer: {},
  },
};
```

### Task 3.4: Create `src/styles.css`

**Files:**
- Create: `frontend/src/styles.css`

- [ ] **Step 1: Write the file**

```css
@import "./design/tokens.css";

@tailwind base;
@tailwind components;
@tailwind utilities;

html, body, #root {
  height: 100%;
}

body {
  margin: 0;
  background: var(--color-bg);
  color: var(--color-text-primary);
  font-family: var(--font-sans, "Inter, system-ui, sans-serif");
}
```

### Task 3.5: Update `vitest.config.ts`

**Files:**
- Modify: `frontend/vitest.config.ts`

- [ ] **Step 1: Read current contents**

```bash
cat frontend/vitest.config.ts
```

- [ ] **Step 2: Overwrite with**

```typescript
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    environment: "jsdom",
    globals: false,
    setupFiles: ["./src/vitest.setup.ts"],
  },
});
```

### Task 3.6: Create `src/vitest.setup.ts`

**Files:**
- Create: `frontend/src/vitest.setup.ts`

- [ ] **Step 1: Write the file**

```typescript
import "@testing-library/jest-dom/vitest";
```

### Task 3.7: Update `tsconfig.json`

**Files:**
- Modify: `frontend/tsconfig.json`

- [ ] **Step 1: Read current contents**

```bash
cat frontend/tsconfig.json
```

- [ ] **Step 2: Overwrite with**

```json
{
  "compilerOptions": {
    "target": "ES2022",
    "lib": ["ES2022", "DOM", "DOM.Iterable"],
    "module": "ESNext",
    "moduleResolution": "bundler",
    "jsx": "react-jsx",
    "strict": true,
    "esModuleInterop": true,
    "resolveJsonModule": true,
    "skipLibCheck": true,
    "types": ["vite/client", "@testing-library/jest-dom"]
  },
  "include": ["src", "vite.config.ts", "vitest.config.ts", "tailwind.config.ts"]
}
```

### Task 3.8: Update `eslint.config.js`

**Files:**
- Modify: `frontend/eslint.config.js`

- [ ] **Step 1: Read current contents**

```bash
cat frontend/eslint.config.js
```

- [ ] **Step 2: Overwrite with**

```javascript
import js from "@eslint/js";
import tseslint from "typescript-eslint";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";

export default [
  { ignores: ["dist", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["src/**/*.{ts,tsx}"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node },
    },
    plugins: { react, "react-hooks": reactHooks },
    rules: {
      ...react.configs.recommended.rules,
      ...reactHooks.configs.recommended.rules,
      "react/react-in-jsx-scope": "off",
      "react/prop-types": "off",
    },
    settings: { react: { version: "19.0" } },
  },
];
```

### Task 3.9: Run tests and lint

- [ ] **Step 1: Run tests under the new jsdom environment**

```bash
npx vitest run
```

Expected: both existing test files still pass (`sum.test.ts` is environment-agnostic; `design/theme.test.ts` works in both node and jsdom because it guards `typeof window`).

- [ ] **Step 2: Run lint**

```bash
npm run lint
```

Expected: clean. If lint fails on existing files (tokens/preset/theme/sum), resolve by adjusting ESLint rules or fixing the files — but do not regress anything from PR #7.

### Task 3.10: Commit toolchain configs

- [ ] **Step 1: Commit**

```bash
git add frontend/vite.config.ts frontend/tailwind.config.ts frontend/postcss.config.js frontend/src/styles.css frontend/vitest.config.ts frontend/src/vitest.setup.ts frontend/tsconfig.json frontend/eslint.config.js
git commit -m "feat(frontend): configure Vite, Tailwind, PostCSS, Vitest jsdom"
```

---

## Phase 4 — App shell + theme boot

### Task 4.1: Create `index.html` with inline theme boot script

**Files:**
- Create: `frontend/index.html`

- [ ] **Step 1: Write the file**

The `<script>` body must match `frontend/src/design/theme.ts::beforePaintScript` verbatim. Copy it exactly.

```html
<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <link rel="icon" type="image/svg+xml" href="/src/assets/brand/favicon.svg" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Slotflow</title>
    <script>
      (function(){
        try {
          var k = "slotflow.theme";
          var m = localStorage.getItem(k);
          var resolved;
          if (m === "light" || m === "dark") {
            resolved = m;
          } else {
            var mm = window.matchMedia;
            if (mm && mm("(prefers-color-scheme: dark)").matches) resolved = "dark";
            else if (mm && mm("(prefers-color-scheme: light)").matches) resolved = "light";
            else {
              var h = new Date().getHours();
              resolved = (h >= 7 && h < 19) ? "light" : "dark";
            }
          }
          document.documentElement.setAttribute("data-theme", resolved);
        } catch (_) {}
      })();
    </script>
    <link rel="preconnect" href="https://fonts.googleapis.com" />
    <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
    <link
      href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600&family=Geist+Mono:wght@500;600&display=swap"
      rel="stylesheet"
    />
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
```

### Task 4.2: Create `src/lib/queryClient.ts`

**Files:**
- Create: `frontend/src/lib/queryClient.ts`

- [ ] **Step 1: Write the file**

```typescript
import { QueryClient } from "@tanstack/react-query";

export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      refetchOnWindowFocus: false,
    },
  },
});
```

### Task 4.3: Create `src/router.tsx`

**Files:**
- Create: `frontend/src/router.tsx`

- [ ] **Step 1: Write the file**

```typescript
import { createBrowserRouter } from "react-router";
import { Landing } from "./screens/Landing";

export const router = createBrowserRouter([
  { path: "/", element: <Landing /> },
]);
```

### Task 4.4: Create placeholder `src/screens/Landing.tsx`

**Files:**
- Create: `frontend/src/screens/Landing.tsx`

- [ ] **Step 1: Write a minimal placeholder** (just enough to satisfy the router at this phase; Phase 5 expands it)

```typescript
export function Landing() {
  return <main>Slotflow — Landing placeholder</main>;
}
```

### Task 4.5: Create `src/App.tsx`

**Files:**
- Create: `frontend/src/App.tsx`

- [ ] **Step 1: Write the file**

```typescript
import { QueryClientProvider } from "@tanstack/react-query";
import { RouterProvider } from "react-router";
import { queryClient } from "./lib/queryClient";
import { router } from "./router";

export function App() {
  return (
    <QueryClientProvider client={queryClient}>
      <RouterProvider router={router} />
    </QueryClientProvider>
  );
}
```

### Task 4.6: Create `src/main.tsx`

**Files:**
- Create: `frontend/src/main.tsx`

- [ ] **Step 1: Write the file**

```typescript
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { App } from "./App";
import "./styles.css";

const container = document.getElementById("root");
if (!container) throw new Error("#root element not found in index.html");

createRoot(container).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
```

### Task 4.7: Add dev/build/preview scripts to `package.json`

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Edit the `scripts` block** to include:

```json
{
  "scripts": {
    "dev": "vite",
    "build": "tsc --noEmit && vite build",
    "preview": "vite preview",
    "lint": "eslint .",
    "test": "vitest run",
    "release": "semantic-release"
  }
}
```

### Task 4.8: Verify dev server renders

- [ ] **Step 1: Start Vite**

```bash
cd frontend
npm run dev
```

Expected: Vite prints `Local: http://localhost:5173/`. Visit that URL.

- [ ] **Step 2: Verify in browser**

Expected:
- Page renders `Slotflow — Landing placeholder`.
- No console errors.
- `<html>` has `data-theme="light"` or `data-theme="dark"` attribute set before paint (check DevTools Elements panel).
- Favicon shows the three-slot flow logomark.

- [ ] **Step 3: Stop Vite** (Ctrl-C).

### Task 4.9: Commit app shell

- [ ] **Step 1: Commit**

```bash
git add frontend/index.html frontend/src/main.tsx frontend/src/App.tsx frontend/src/router.tsx frontend/src/lib/queryClient.ts frontend/src/screens/Landing.tsx frontend/package.json
git commit -m "feat(frontend): scaffold React app shell with router, query client, theme boot"
```

---

## Phase 5 — Landing with lockup

### Task 5.1: Write failing RTL smoke test

**Files:**
- Create: `frontend/src/screens/Landing.test.tsx`

- [ ] **Step 1: Write the test**

```typescript
import { render, screen } from "@testing-library/react";
import { describe, it, expect } from "vitest";
import { Landing } from "./Landing";

describe("Landing", () => {
  it("renders the Slotflow lockup and hero tagline", () => {
    render(<Landing />);
    expect(screen.getByRole("img", { name: /slotflow/i })).toBeInTheDocument();
    expect(
      screen.getByText(/a crm for the job hunt that doesn't forget the follow-up/i),
    ).toBeInTheDocument();
  });

  it("has a 'Get started' call to action", () => {
    render(<Landing />);
    expect(screen.getByRole("link", { name: /get started/i })).toBeInTheDocument();
  });
});
```

- [ ] **Step 2: Run — fail**

```bash
cd frontend
npx vitest run src/screens/Landing.test.tsx
```

Expected: FAIL on both assertions.

### Task 5.2: Implement the Landing placeholder

**Files:**
- Modify: `frontend/src/screens/Landing.tsx`

- [ ] **Step 1: Overwrite with**

```typescript
import lockup from "../assets/brand/lockup.svg";

export function Landing() {
  return (
    <main className="min-h-full flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <img src={lockup} alt="Slotflow" height={22} />
        <nav className="flex items-center gap-4 text-ink-secondary">
          <a href="/login" className="text-ink-secondary hover:text-ink">
            Sign in
          </a>
          <a
            href="/signup"
            className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep"
          >
            Get started
          </a>
        </nav>
      </header>
      <section className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-display-hero text-ink max-w-3xl">
          A CRM for the job hunt that doesn't forget the follow-up.
        </h1>
        <p className="mt-4 text-body-lg text-ink-secondary max-w-xl">
          Track opportunities, pipelines, and recruiter conversations with a system built for
          senior engineers running their own hunt.
        </p>
      </section>
    </main>
  );
}
```

- [ ] **Step 2: Run tests — pass**

```bash
npx vitest run src/screens/Landing.test.tsx
```

Expected: both tests pass.

### Task 5.3: Manual smoke

- [ ] **Step 1: Start Vite and visit `/`**

```bash
npm run dev
```

Visit `http://localhost:5173/`. Expected:
- Top-left: lockup (logomark + "Slotflow" wordmark).
- Top-right: "Sign in" link and green "Get started" CTA.
- Centered hero: 48px display headline and a secondary description paragraph.
- Theme respects `prefers-color-scheme`. Toggle OS theme and hard-refresh to confirm `data-theme` changes and there is no flash of wrong theme.

- [ ] **Step 2: Stop Vite** (Ctrl-C).

### Task 5.4: Commit Landing

- [ ] **Step 1: Commit**

```bash
git add frontend/src/screens/Landing.tsx frontend/src/screens/Landing.test.tsx
git commit -m "feat(frontend): add landing placeholder with lockup and hero"
```

---

## Phase 6 — Theme boot integration test

The inline boot script in `index.html` duplicates the logic of `beforePaintScript` in `src/design/theme.ts`. Changes to either must stay in sync, or the deployed HTML will diverge from the tested module. Task 6.x guards the contract.

### Task 6.1: Write failing boot-sync test

**Files:**
- Create: `frontend/src/design/themeBoot.test.ts`

- [ ] **Step 1: Write the test**

```typescript
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it, expect } from "vitest";
import { beforePaintScript } from "./theme";

function extractInlineBootScript(html: string): string {
  const start = html.indexOf("<script>");
  const end = html.indexOf("</script>", start);
  if (start === -1 || end === -1) throw new Error("No <script> block in index.html");
  return html.slice(start + "<script>".length, end).trim();
}

describe("theme boot sync", () => {
  it("index.html inline boot script matches beforePaintScript", () => {
    const html = readFileSync(resolve(__dirname, "../../index.html"), "utf8");
    const inline = extractInlineBootScript(html);
    expect(inline).toBe(beforePaintScript.trim());
  });
});
```

- [ ] **Step 2: Run — pass or fail depending on whitespace**

```bash
npx vitest run src/design/themeBoot.test.ts
```

Expected: If your `index.html` inline script body matches `beforePaintScript` exactly (modulo outer whitespace), PASS. If FAIL, the error message will show the diff — adjust either the HTML or the test's normalization (`.trim()`) until they align. **Do not** change `beforePaintScript` to match HTML formatting; always re-copy from `beforePaintScript` into the HTML verbatim.

### Task 6.2: Commit the boot-sync guard

- [ ] **Step 1: Commit**

```bash
git add frontend/src/design/themeBoot.test.ts
git commit -m "test(frontend): guard index.html theme boot stays in sync with theme.ts"
```

---

## Phase 7 — Makefile + final verification

### Task 7.1: Update `frontend/Makefile`

**Files:**
- Modify: `frontend/Makefile`

- [ ] **Step 1: Read current contents**

```bash
cat frontend/Makefile
```

- [ ] **Step 2: Overwrite with** (preserve existing `lint` / `test` targets if present; add `dev` and `build`)

```make
.PHONY: dev build lint test

dev:
	npm run dev

build:
	npm run build

lint:
	npm run lint

test:
	npm test
```

### Task 7.2: Drop placeholder `sum.ts` / `sum.test.ts`

- [ ] **Step 1: Remove and commit**

```bash
git rm frontend/src/sum.ts frontend/src/sum.test.ts
git commit -m "chore(frontend): drop scaffolding sum.ts placeholder"
```

### Task 7.3: Full verification

- [ ] **Step 1: Lint**

```bash
cd frontend
npm run lint
```

Expected: clean.

- [ ] **Step 2: Unit tests**

```bash
npm test
```

Expected: all tests pass — `design/theme.test.ts`, `design/themeBoot.test.ts`, `screens/Landing.test.tsx` (total ≥ 7 tests).

- [ ] **Step 3: Production build**

```bash
npm run build
```

Expected: `tsc --noEmit` passes; Vite emits to `frontend/dist/`. No TypeScript errors, no Vite warnings about unresolved imports.

- [ ] **Step 4: Preview build**

```bash
npm run preview
```

Visit the printed URL. Expected: identical to `npm run dev` output. Ctrl-C to stop.

### Task 7.4: Commit Makefile

- [ ] **Step 1: Commit**

```bash
git add frontend/Makefile
git commit -m "chore(frontend): add dev and build make targets"
```

---

## Phase 8 — PR

### Task 8.1: Push branch

- [ ] **Step 1: Push**

```bash
git push -u origin feat/frontend-brand-and-scaffold
```

### Task 8.2: Open the PR

- [ ] **Step 1: Prepare a PR body** at `/tmp/pr-body-brand-scaffold.md` using `.github/WORKFLOW_TEMPLATES/pull_request.md` as the template, filled in with:

- **Summary:** Regenerate brand SVGs to match the design handoff geometry; scaffold the `frontend/` package as a runnable Vite + React + TypeScript app wired to the existing design tokens, Tailwind preset, and theme resolver; deliver a Landing placeholder and a boot-script sync guard.
- **Context:** Implements Phase 1 of the frontend execution plan (`docs/superpowers/plans/2026-04-18-frontend-brand-and-scaffold.md`). Landed on top of PR #7 (design system foundation).
- **What changed:** (bulleted map of the diff)
- **Test plan:** `npm test`, `npm run lint`, `npm run build`, `npm run dev` manual smoke — checked.
- **Risk & rollback:** Low — first runnable app scaffold, no backend integration, no auth. Rollback via `git revert` per commit.
- **Checklist:** Conventional Commits, worktree, no AGENTS updates needed.

- [ ] **Step 2: Create the PR**

```bash
gh pr create \
  --base main \
  --head feat/frontend-brand-and-scaffold \
  --title "feat(frontend): brand SVGs and React app scaffold" \
  --body-file /tmp/pr-body-brand-scaffold.md
```

- [ ] **Step 3: Verify** the PR URL opens to a fully filled body (no `<!-- -->` placeholder comments, no lone `-` bullets).

---

## Review checkpoint

This plan produces **one PR** covering brand + scaffold + theme boot + landing placeholder. There are no intra-plan review checkpoints to human gate; internal smoke tests at the end of Phases 4, 5, 6, and 7 are self-verification steps the executing engineer runs before moving on.

After this PR merges, author the next plan (shared UI primitives, or auth/2FA + API client — pick whichever unblocks more downstream work) using `superpowers:writing-plans`.

---

## Out of scope (explicit deferrals)

- Auth / 2FA flow and session-aware API client (depends on Track 04).
- Shared UI primitives (Sidebar, Topbar, StageBadge, CompanyAvatar, Modal, Segmented, Chip, Badge, Icons).
- Each of the 9 screens (Dashboard, Opportunities, Pipeline, Opportunity Detail, Inbox, Resume Studio, Settings; full Landing/Login).
- Playwright e2e.
- Wordmark as a standalone SVG (`wordmark.svg`) — the design handoff's 4-file inventory does not include it; `Wordmark` is a React component concern in later plans.
- Replacing Google Fonts CDN with self-hosted Inter/Geist Mono (revisit if CSP requirements tighten).
