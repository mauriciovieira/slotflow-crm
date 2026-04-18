# Handoff: Slotflow CRM

## Overview

Slotflow is a CRM for senior engineers running their own job hunt — tracking opportunities at foreign companies, managing interview pipelines, handling recruiter conversations, and tailoring resumes. This handoff covers the first complete design pass: brand identity (logomark + wordmark), full design system, and 8 working screens as a clickable prototype.

## About the Design Files

The files in `prototype/` are **design references created in HTML/React** — they show the intended visual design, layout, and interaction behavior. They are **not production code to copy directly**.

The task is to **recreate these designs in the target codebase's environment** (the existing frontend, which already has Inter + Geist Mono fonts wired up, Tailwind preset, and design tokens in `frontend/src/design/`). Use the codebase's existing patterns, component libraries, and token system — the prototype's inline styles and raw CSS should be translated to your framework's idiomatic patterns.

If no frontend framework is in place yet, React + Tailwind (matching the existing `frontend/src/design/tailwind.preset.ts`) is the default choice.

## Fidelity

**High-fidelity.** Every color, type size, spacing value, border radius, and shadow in the prototype matches the canonical `DESIGN.md` (included in this bundle). Copy exact hex values and measurements. The one area where judgment is welcome: micro-animations (hover transitions, modal entry, drag feedback) — the prototype uses reasonable defaults but the target can refine.

## Brand Identity

### Logomark — v2 (new)

The previous logomark (dark square with diagonal mint slash) read like a "no" symbol. Replaced with a **three-slot flow curve**:

- Three rounded-rect "slots" inside a 24×24 dark square, increasing in height left-to-right (representing pipeline stages filling up)
- A mint curve (`#14C98B`) arcs across the tops of the slots, terminating in a mint dot — the "landed" opportunity
- Slots rendered in white at 55% opacity so they read as recessed slots, not competing with the accent

SVG source: `prototype/components/brand.jsx` (the `Logomark` component). Data-URI favicon in `prototype/index.html` `<link rel="icon">`.

**Sizes**: 16px favicon, 20px UI/nav, 32px+ marketing.

### Wordmark

Inter 600, letter-spacing `-0.016 × size` (so −0.32px at 20px). Color tracks primary text (`#0d0d0d` light / `#ededed` dark). The `Lockup` component pairs `Logomark` + `Wordmark` with an 8px gap, vertically centered.

## Design Tokens

**Included as `DESIGN.md` in this bundle — the canonical source.** Token values also mirrored in `prototype/styles.css` under `:root` and `[data-theme="dark"]`.

**Theme scoping rule** (important): any element that carries `data-theme="dark"` must re-apply `color` and `background` from the vars — otherwise descendants inherit the body's already-resolved light value. The prototype does this with:

```css
[data-theme] {
  background: var(--color-bg);
  color: var(--color-text-primary);
}
```

In a Tailwind/React target that renders light-only at root, this isn't needed — but preserve the rule if you support side-by-side theme previews or any nested theme scope.

Critical values:

| Role | Light | Dark |
|---|---|---|
| Brand | `#14C98B` | `#14C98B` (unchanged) |
| Brand light | `#c9f3e1` | `rgba(20,201,139,0.15)` |
| Brand deep | `#0a8f62` | `#4fe3b0` |
| BG | `#ffffff` | `#0d0d0d` |
| Panel | `#fafafa` | `#171717` |
| Card | `#ffffff` | `#141414` |
| Text primary | `#0d0d0d` | `#ededed` |
| Text secondary | `#333333` | `#a0a0a0` |
| Text muted | `#666666` | `#8a8a8a` |
| Border subtle | `rgba(0,0,0,0.06)` | `rgba(255,255,255,0.08)` |
| Border medium | `rgba(0,0,0,0.10)` | `rgba(255,255,255,0.12)` |

Radii: 6 / 8 / 10 / 14 / 9999.
Type: Inter (400/500/600 only — no 700) + Geist Mono (500/600, uppercase for technical labels).

## Screens

All screens live in `prototype/screens/` and `prototype/components/`. Navigate between them using the top strip of the canvas (Landing / Login / Dashboard / Opportunities / Pipeline / Inbox / Resume Studio / Settings). Both light and dark render side-by-side.

### 1. Landing (`screens/misc.jsx` → `Landing`)
Marketing surface with atmospheric mint-to-white radial gradient. Header with lockup + nav + Sign in / Get started. Hero with 48px display headline ("A CRM for the job hunt that doesn't forget the follow-up."), a preview card showing the pipeline kanban, and a 3-card feature grid. Generous 64–96px section padding.

### 2. Login (`screens/misc.jsx` → `Login`)
Two-column 50/50 split. Left: lockup, welcome heading, Google/GitHub SSO buttons, email + password form. Right: mint gradient panel with a sample preview card (next-action card + pipeline steps indicator). "Welcome back" headline at 32px, `-0.64px` tracking.

### 3. Dashboard (`screens/dashboard.jsx`)
Greeting ("Good morning, Rafael") + new-this-week chip. Stat strip (4 cards: Active, In interview, Response rate, Avg cycle time). Pipeline overview bar chart strip (one column per stage). Two-column: Upcoming actions list (clickable rows → opportunity modal) and Recent messages list (→ inbox).

### 4. Opportunities (`screens/opportunities.jsx`)
Dense data table. Toolbar: search input (with search icon), stage segmented control (All / Applied / Screening / Interview / Offer / Closed), priority segmented control (Any / High / Medium / Low), sort dropdown, Save view button. Table columns: avatar, Role + company + slug, Stage badge, Next action + date, Recruiter avatar + name, Comp, Fit score, Updated. Row striping (`#fafafa`/white), hover background `#f5f5f5`, clicking opens modal.

### 5. Pipeline (`screens/pipeline.jsx`)
Kanban board. 5 columns (Applied / Screening / Interview / Offer / Closed), 280px wide, `#fafafa` background, 12px radius. Column header: dot + uppercase label + count + plus-button. Cards: 10px radius, 12px padding, company avatar + name + fit score, role title (clamped 2 lines), mono slug, next-action chip (if present), priority chip + recruiter avatar. **Drag-and-drop** between columns updates stage. Empty column shows dashed "Drop here" placeholder.

### 6. Opportunity Detail (modal — `screens/opportunity-detail.jsx`)
Modal, max 880px wide, 14px radius, backdrop blur. Header: company avatar + meta + 24px role title. Badge row: stage badge, mono slug, comp chip, mint fit chip. Pipeline steps indicator (check for done / dot for active / empty dot for todo). Tabs: Overview / Timeline / Messages / Documents. Overview: 2-col with Next action card, Notes, Why-this-fits list on the left; Recruiter + Details panels on the right. Timeline: vertical line with dots + labels + relative times. Documents: file rows with Open buttons.

### 7. Inbox (`screens/inbox.jsx`)
Two-pane: 360px message list on the left, detail on the right. Segmented control at top of list (All / Unread / Interviews / Offers). Each message row: avatar + sender + unread dot + timestamp + opportunity slug + 2-line preview. Active row has mint-light background, mint left accent bar, mint-deep text. Detail pane: sender header, opportunity context pill (clickable → modal), message body, **AI draft reply card** (purple 2px left border, sparkle icon, "AI Draft · needs review" label, Use/Regenerate/Edit buttons). Reply bar at bottom with input + Send button.

### 8. Resume Studio (`screens/resume.jsx`)
Two-column. Left sidebar: Tailor-for opportunity selector, Variants list (Base + Tailored with "AI edits" counts), Keyword match score panel (large score + progress + keyword check list). Right: tailored resume preview with name header, Summary (with yellow-mint highlights on key phrases), Experience section (bullets with purple "AI" tags indicating AI-tailored lines). Preview header has Diff base / Export PDF / Apply to opportunity buttons.

### 9. Settings (`screens/misc.jsx` → `Settings`)
Two-column: left nav (Profile / Workspace / Appearance / Integrations / Billing / Danger zone), right content. Appearance section shows the canonical Light / Auto / Dark segmented control and a Density segmented control. Integrations shows connected + connect rows. Profile shows avatar + form grid.

## Shared Components

### Sidebar (`components/shell.jsx` → `Sidebar`)
220px wide, `#fafafa` background, right border. Contains lockup, nav items, "Pinned" section with mono opportunity slugs, Settings at bottom, user card. Active nav item: `#c9f3e1` bg, `#0a8f62` text, 2px mint left accent. Hover: `#f5f5f5` bg.

### Topbar (`components/shell.jsx` → `Topbar`)
52px height, white bg, 1px bottom border. Page title (16px, tight tracking), search input with ⌘K hint on the right, theme toggle (sun/moon), notifications bell, optional "New opportunity" brand CTA.

### Stage badge (`components/shell.jsx` → `StageBadge`)
Pill, Geist Mono 11px 600 uppercase, 0.55px tracking. Variants match the 5 stages: Applied (neutral), Screening (blue), Interview (mint), Offer (mint deep), Closed (red).

### Company avatar (`components/shell.jsx` → `CompanyAvatar`)
Circle, `#f5f5f5` bg (or dark equivalent), single mono initial. Default 28px; scales 22 / 28 / 36 / 40.

### Icons (`components/icons.jsx`)
24-viewbox stroke icons, `currentColor`, 1.75 stroke-width, round caps/joins. Full set: Home, Briefcase, Kanban, Inbox, File, Settings, Search, Plus, Filter, Chevron, ChevronR, More, Close, Bell, Sun, Moon, Calendar, Mail, ArrowUp, External, Pin, Star, Check, Sparkle, Drag, Archive, Link, Building.

## Interactions & Behavior

- **Route navigation**: canvas-level nav at top switches between screens; in-app sidebar switches between Dashboard/Opportunities/Pipeline/Inbox/Resume Studio/Settings. Current screen persisted to `localStorage`.
- **Opportunity detail**: clicking any opportunity row in any screen (table row, kanban card, pinned sidebar item, dashboard list) opens the modal. Modal closes on backdrop click, on close button, and on ESC.
- **Kanban drag-and-drop**: native HTML5 drag. Dragging a card marks it `.dragging` (40% opacity, grab cursor). Target column highlights mint (`.drop-target`). On drop, the card's `stage` updates in local state.
- **Table filters**: search text filters on role/company/slug/recruiter substrings (case-insensitive). Stage + priority segmented controls filter by exact value. Sort dropdown re-orders by last updated / fit / stage.
- **Light/dark toggle**: the canvas shows both themes side-by-side; inside the app, a topbar button would toggle (the component accepts `theme` + `toggleTheme` props). The real implementation should follow `DESIGN.md` §8 (localStorage → prefers-color-scheme → time-of-day fallback, applied before first paint).
- **Modal**: fade-in backdrop 140ms, content transform-scale entry 200ms `cubic-bezier(.2,.8,.2,1)`.
- **Hover**: rows (`#f5f5f5`), nav items (`#f5f5f5` or `#f0f0f0`), buttons (see DESIGN.md §4 per variant). 120ms ease-out is default.

## State Management

Current prototype is all component-local state (React `useState`). For production:

- **Auth**: user session, workspace.
- **Opportunities**: list + individual (backed by server), mutations for stage, priority, notes, next action.
- **Messages**: thread list + individual, unread status.
- **Pipeline drag**: optimistic update, server-side stage mutation, rollback on failure.
- **Theme**: persisted preference (light/auto/dark), resolved at mount, reactive to media query + time-of-day boundaries.
- **Resume variants**: per-opportunity tailored variants, diff vs base.
- **Filters**: persisted per-view (saved views feature).

## Assets

No bitmap assets needed — everything is SVG or typography. Font stack:
- **Inter** (400 / 500 / 600) — already installed via Google Fonts in the existing codebase
- **Geist Mono** (500 / 600) — same

Logomark SVG is generated by the `Logomark` React component; export to standalone `.svg` files for any non-React usage (existing project has `frontend/src/assets/brand/` — replace `logomark.svg`, `logomark-dark.svg`, `lockup.svg`, `favicon.svg` with new geometry).

## Files in This Bundle

```
design_handoff_slotflow_crm/
├── README.md                          ← this file
├── DESIGN.md                          ← canonical design system (source of truth)
└── prototype/
    ├── index.html                     ← standalone, self-contained prototype
    ├── styles.css                     ← tokens + component classes
    ├── app.jsx                        ← routing + DualPreview wrapper
    ├── data.js                        ← mock data (companies, opportunities, messages)
    ├── components/
    │   ├── brand.jsx                  ← Logomark, Wordmark, Lockup
    │   ├── icons.jsx                  ← stroke icon set
    │   └── shell.jsx                  ← Sidebar, Topbar, StageBadge, CompanyAvatar
    └── screens/
        ├── dashboard.jsx
        ├── opportunities.jsx
        ├── pipeline.jsx
        ├── inbox.jsx
        ├── opportunity-detail.jsx
        ├── resume.jsx
        └── misc.jsx                   ← Landing, Login, Settings
```

To view the prototype locally: open `prototype/index.html` in a browser. No build step required (uses Babel standalone).

## Implementation Notes

1. **Start with tokens**: port `prototype/styles.css` `:root` / `[data-theme="dark"]` blocks into the existing token system (`frontend/src/design/tokens.css` / `tokens.ts`). The prototype's values are already aligned with the canonical `DESIGN.md`.
2. **Then brand assets**: regenerate the 4 SVGs in `frontend/src/assets/brand/` using the new `Logomark` geometry (see `components/brand.jsx`).
3. **Then shared components** (Sidebar, Topbar, StageBadge, CompanyAvatar, Modal, Segmented control, Chip, Badge) — these are used across every screen.
4. **Then screens**, in order of visibility: Dashboard → Opportunities → Pipeline → Opportunity Detail → Inbox → Resume Studio → Settings → Landing/Login.
5. **Theme resolver**: implement DESIGN.md §8 exactly — inline script in `<head>` reading `localStorage` + `matchMedia` + `Date`, before first paint.
