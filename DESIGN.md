# Slotflow CRM — Design System

## 1. Visual Theme & Atmosphere

Slotflow CRM is a product-dense workspace for tracking job opportunities, interview pipelines, and recruiter conversations. The design system balances two demands that usually pull in opposite directions: the **calm clarity** of a modern reading surface, and the **information density** that a serious CRM needs. The page sits on a luminous white (`#ffffff`) background with near-black (`#0d0d0d`) text and a signature **Slotflow Mint** brand accent (`#14C98B`) — a confident, slightly teal green that signals availability, motion, and "go." The mood is focused and engineered: neutral enough to stay out of the way of data, but warm enough to not feel like a spreadsheet.

The Inter font family carries the entire typographic load. At display sizes (32–48px), it uses tight negative letter-spacing (-0.5px to -0.96px) and semibold weight (600), creating headlines that feel focused and compressed. Body text at 14–15px with 1.45 line-height provides comfortable reading without wasting vertical space — dense enough that pipeline tables, opportunity lists, and conversation threads stay legible without constant scrolling. Geist Mono appears exclusively for code, IDs, and technical labels — uppercase, tracked-out, small — the voice of the terminal inside the app.

What distinguishes Slotflow's surface is its **mixed-density layout**. Marketing surfaces (login, landing, empty states) get a soft mint-to-white atmospheric gradient and generous whitespace. Product surfaces (opportunity board, pipeline, inbox) tighten spacing, use near-white `#fafafa` row alternation where density helps, and prefer borders over shadows for depth. Cards use moderate padding (16–20px) with medium radii (10–14px) and whisper-thin borders, creating containers that feel clean but efficient.

**Key Characteristics:**
- Inter with tight negative tracking at display sizes (-0.5px to -0.96px)
- Geist Mono for code, IDs, opportunity slugs, and technical labels: uppercase, 12px, tracked-out
- Brand Mint (`#14C98B`) used sparingly — primary CTAs, active states, focus rings, stage indicators
- Atmospheric mint-to-white gradient only on marketing/auth surfaces; product surfaces stay flat
- Moderate-round corners: 10px for inputs and small controls, 14px for cards, 6px for inline chips/pills, 9999px for badges and toggles
- Subtle borders: `rgba(0,0,0,0.06)` for product UI, `rgba(0,0,0,0.04)` for marketing — slightly stronger than marketing-only systems, because density demands clearer separation
- 4px base spacing system with variable section padding (24–48px product, 64–96px marketing)
- Two-surface approach: white for primary canvas, `#fafafa` for row striping / secondary panels

## 2. Color Palette & Roles

### Primary
- **Near Black** (`#0d0d0d`): Primary text, headings, dark surfaces. Not pure black — the micro-softness improves reading comfort.
- **Pure White** (`#ffffff`): Page background, card surfaces, input backgrounds.
- **Slotflow Mint** (`#14C98B`): The signature accent — primary CTAs, active navigation, focus rings, brand identity, pipeline stage "active" indicators.

### Secondary Accents
- **Mint Light** (`#c9f3e1`): Tinted surface for badges, hover states, subtle backgrounds, "active stage" cell fills.
- **Mint Deep** (`#0a8f62`): Darker green for text on mint badges, hover states on brand elements.
- **Warm Amber** (`#c37d0d`): Warning states, caution badges, deadline-approaching indicators.
- **Soft Blue** (`#3772cf`): Informational annotations, tag backgrounds, "new" markers.
- **Error Red** (`#d45656`): Error states, destructive actions, rejected/closed opportunities.
- **Muted Purple** (`#7a5af8`): Optional accent for AI-generated drafts — signals "machine-written, needs review."

### Neutral Scale
- **Gray 900** (`#0d0d0d`): Primary heading text, nav links.
- **Gray 700** (`#333333`): Secondary text, descriptions, body copy.
- **Gray 500** (`#666666`): Tertiary text, muted labels, table metadata.
- **Gray 400** (`#888888`): Placeholder text, disabled states, code annotations.
- **Gray 300** (`#c9c9c9`): Table row dividers, disabled borders.
- **Gray 200** (`#e5e5e5`): Borders, dividers, card outlines.
- **Gray 100** (`#f5f5f5`): Subtle surface backgrounds, hover states on rows.
- **Gray 50** (`#fafafa`): Near-white surface tint — row striping, secondary panels.

### Interactive
- **Link Default** (`#0d0d0d`): Links match text color, relying on underline/context.
- **Link Hover** (`#14C98B`): Brand mint on hover — `var(--color-brand)`.
- **Focus Ring** (`#14C98B`): Brand mint focus outline for inputs and interactive elements.

### Surface & Overlay
- **Card Background** (`#ffffff`): White cards on white background, separated by borders.
- **Panel Background** (`#fafafa`): Secondary panels, sidebars, row striping.
- **Border Subtle** (`rgba(0,0,0,0.06)`): Standard product UI borders — the primary separation mechanism.
- **Border Medium** (`rgba(0,0,0,0.10)`): Interactive elements, input borders, hovered cards.
- **Input Border Focus** (`var(--color-brand)`): Mint ring on focused inputs.

### Shadows & Depth
- **Card Shadow** (`rgba(0,0,0,0.03) 0px 1px 2px`): Barely-there ambient shadow for cards that need subtle lift.
- **Button Shadow** (`rgba(0,0,0,0.06) 0px 1px 2px`): Micro-shadow for primary buttons.
- **Popover Shadow** (`rgba(0,0,0,0.10) 0px 8px 24px`): For dropdowns, menus, modals — the only place heavier shadows appear.

## 3. Typography Rules

### Font Family
- **Primary**: `Inter`, with fallback: `Inter Fallback, system-ui, -apple-system, sans-serif`
- **Monospace**: `Geist Mono`, with fallback: `Geist Mono Fallback, ui-monospace, SFMono-Regular, monospace`

### Hierarchy

| Role | Font | Size | Weight | Line Height | Letter Spacing | Notes |
|------|------|------|--------|-------------|----------------|-------|
| Display Hero | Inter | 48px (3.00rem) | 600 | 1.10 | -0.96px | Marketing/auth hero only |
| Page Title | Inter | 28px (1.75rem) | 600 | 1.20 | -0.56px | Product page titles ("Opportunities", "Inbox") |
| Section Heading | Inter | 20px (1.25rem) | 600 | 1.25 | -0.30px | Panel/section titles within a page |
| Sub-heading | Inter | 16px (1.00rem) | 600 | 1.30 | -0.16px | Card headings, modal titles |
| Body Large | Inter | 16px (1.00rem) | 400 | 1.50 | normal | Descriptions, intros |
| Body | Inter | 14px (0.88rem) | 400 | 1.45 | normal | Standard product reading text |
| Body Medium | Inter | 14px (0.88rem) | 500 | 1.45 | normal | Navigation, emphasized inline text |
| Table Cell | Inter | 13px (0.81rem) | 400 | 1.40 | normal | Dense table rows |
| Table Header | Inter | 12px (0.75rem) | 500 | 1.30 | 0.40px | Uppercase table column headers |
| Button | Inter | 14px (0.88rem) | 500 | 1.40 | normal | Button labels |
| Link | Inter | 13px (0.81rem) | 500 | 1.40 | normal | Navigation links, small CTAs |
| Caption | Inter | 12px (0.75rem) | 400–500 | 1.45 | normal | Metadata, timestamps, descriptions |
| Label Uppercase | Inter | 12px (0.75rem) | 500 | 1.40 | 0.60px | `text-transform: uppercase`, section labels |
| Mono Code | Geist Mono | 12px (0.75rem) | 500 | 1.45 | 0.40px | Inline code, opportunity slugs |
| Mono Label | Geist Mono | 11px (0.69rem) | 600 | 1.40 | 0.55px | `text-transform: uppercase`, status badges |
| Mono Micro | Geist Mono | 10px (0.63rem) | 500 | 1.40 | 0.50px | `text-transform: uppercase`, tiny labels, ID suffixes |

### Principles
- **Tight tracking at display sizes**: Inter at 28–48px uses -0.3px to -0.96px letter-spacing — compressed, deliberate headlines.
- **Dense reading at body sizes**: 13–14px body text is the product default. Documentation-level 16px is reserved for marketing and long-form empty states.
- **Two-font system**: Inter for all human-readable content, Geist Mono exclusively for technical/code/ID contexts. The boundary is strict.
- **Uppercase as hierarchy signal**: Section labels, table headers, and technical tags use uppercase + positive tracking (0.4–0.6px) as a clear visual delimiter between content types.
- **Three weights**: 400 (body/reading), 500 (UI/navigation/emphasis), 600 (headings/titles). No bold (700).

## 4. Component Stylings

### Buttons

**Primary**
- Background: `#0d0d0d`
- Text: `#ffffff`
- Padding: 6px 14px (small), 8px 18px (default)
- Radius: 8px
- Font: Inter 14px weight 500
- Shadow: `rgba(0,0,0,0.06) 0px 1px 2px`
- Hover: background `#1f1f1f`
- Use: Default primary action

**Brand Primary**
- Background: `#14C98B`
- Text: `#0d0d0d` (intentional — dark text on mint for contrast)
- Padding: 8px 18px
- Radius: 8px
- Hover: background `#0fb57a`
- Use: Top-level conversion / "Create Opportunity" style CTAs

**Secondary / Ghost**
- Background: `#ffffff`
- Text: `#0d0d0d`
- Padding: 6px 12px (small), 8px 16px (default)
- Radius: 8px
- Border: `1px solid rgba(0,0,0,0.10)`
- Hover: background `#f5f5f5`
- Use: Secondary actions, cancel, filter controls

**Icon / Nav Button**
- Background: transparent
- Padding: 6px
- Radius: 6px
- Hover: background `rgba(0,0,0,0.05)`
- Use: Toolbar icons, table row actions

**Destructive**
- Background: `#ffffff`
- Text: `#d45656`
- Border: `1px solid rgba(212,86,86,0.25)`
- Hover: background `#fef2f2`
- Use: Delete, remove, close

### Cards & Containers

**Standard Card**
- Background: `#ffffff`
- Border: `1px solid rgba(0,0,0,0.06)`
- Radius: 14px
- Padding: 16px–20px
- Shadow: none by default; `rgba(0,0,0,0.03) 0px 1px 2px` when lifted

**Panel**
- Background: `#fafafa`
- Border: `1px solid rgba(0,0,0,0.06)`
- Radius: 14px
- Padding: 20px
- Use: Sidebar panels, summary blocks

**Data Table Wrapper**
- Background: `#ffffff`
- Border: `1px solid rgba(0,0,0,0.06)`
- Radius: 12px (outer), no radius on rows
- Row alternation: `#ffffff` / `#fafafa`
- Row hover: `#f5f5f5`
- Header row: `#fafafa` background, 12px uppercase Inter 500 with 0.4px tracking

### Inputs & Forms

**Text Input**
- Background: `#ffffff`
- Text: `#0d0d0d`
- Padding: 6px 10px
- Height: 32px (compact), 36px (default)
- Border: `1px solid rgba(0,0,0,0.12)`
- Radius: 8px
- Focus: `1px solid #14C98B` + `outline: 2px solid rgba(20,201,139,0.25)`
- Placeholder: `#888888`

**Select / Combobox**
- Same base as text input
- Chevron icon right-aligned, `#666666`

**Chip / Pill Tag**
- Background: `#f5f5f5` (neutral), `#c9f3e1` (active/success), `#fef2f2` (error), etc.
- Text: matches scale — `#333333` (neutral), `#0a8f62` (mint), `#d45656` (error)
- Padding: 2px 8px
- Radius: 6px
- Font: Inter 12px weight 500

**Status Badge (Pipeline stage)**
- Radius: 9999px
- Padding: 2px 10px
- Font: Geist Mono 11px weight 600, uppercase, tracking 0.55px
- Variants map to pipeline stages — each stage gets a consistent color pair

### Navigation

**Top Bar**
- Background: `#ffffff` with `backdrop-filter: blur(10px)` when sticky
- Height: 52px
- Border bottom: `1px solid rgba(0,0,0,0.06)`
- Brand logotype left-aligned, global search center, user menu right

**Side Nav**
- Background: `#fafafa`
- Width: 220px (expanded), 56px (collapsed)
- Item: 8px padding, 6px radius, Inter 13px weight 500
- Active: background `#c9f3e1`, text `#0a8f62`, 2px left accent in `#14C98B`
- Hover: background `#f0f0f0`

### Distinctive Components

**Pipeline Board (Kanban)**
- Columns: `#fafafa` background, 12px radius, 12px padding
- Cards: white, 10px radius, 12px padding, 1px border at 6% opacity
- Column header: 12px uppercase Inter 500, tracking 0.4px, with count in muted gray

**Conversation Thread**
- Alternating sender/receiver alignment
- Message bubbles: 12px radius, `#f5f5f5` (incoming) or `#c9f3e1` (outgoing draft)
- AI-draft markers: 2px left border in `#7a5af8`

**Opportunity Detail Header**
- Flat layout, no hero gradient
- Title at 28px weight 600
- Mono slug below title in `#888888`
- Status pills inline with title

**Empty States**
- Centered, generous whitespace
- Mint-tinted illustration or icon at 48–64px
- Headline + single CTA

## 5. Layout Principles

### Spacing System
- Base unit: 4px
- Scale: 2, 4, 6, 8, 10, 12, 16, 20, 24, 32, 40, 48, 64, 96
- Product section padding: 24–48px vertical
- Marketing section padding: 64–96px vertical
- Card padding: 16–20px
- Component gaps: 6–12px

### Grid & Container
- Product max width: fluid up to 1440px, no artificial constraint on data tables
- Marketing max width: 1200px centered
- Horizontal padding: 16px mobile, 24px tablet, 32px desktop
- Sidebar + main content: 220px + fluid

### Density Philosophy
- **Product first, marketing second**: The CRM is the product. Dense tables, compact cards, efficient navigation. Marketing pages borrow this language but relax it.
- **Borders over shadows**: Depth comes from 6%–10% opacity borders, not drop shadows. Shadows are reserved for floating surfaces (popovers, modals).
- **Two-surface approach**: White canvas + `#fafafa` secondary. No third surface tone in light mode.
- **Row striping over cards**: For long lists (opportunities, people, messages), striped rows beat card stacks — less visual noise, more scannable.

### Border Radius Scale
- Small (6px): Inline chips, tags, icon buttons
- Medium (8px): Buttons, inputs, small controls
- Standard (10–14px): Cards, panels, modals, data tables
- Full Pill (9999px): Status badges, toggles, avatar stacks

## 6. Depth & Elevation

| Level | Treatment | Use |
|-------|-----------|-----|
| Flat (0) | No shadow, no border | Page background, text blocks |
| Subtle Border (1) | `1px solid rgba(0,0,0,0.06)` | Standard product cards, table wrappers |
| Medium Border (1b) | `1px solid rgba(0,0,0,0.10)` | Interactive elements, input borders, hovered cards |
| Ambient Shadow (2) | `rgba(0,0,0,0.03) 0px 1px 2px` | Cards that need micro-lift |
| Button Shadow (2b) | `rgba(0,0,0,0.06) 0px 1px 2px` | Primary buttons |
| Popover Shadow (3) | `rgba(0,0,0,0.10) 0px 8px 24px` | Dropdowns, menus, date pickers |
| Modal Shadow (4) | `rgba(0,0,0,0.18) 0px 16px 48px` | Modals, dialogs |
| Focus Ring | `2px solid rgba(20,201,139,0.25)` + `1px solid #14C98B` | Focused inputs and interactive elements |

## 7. Brand Identity — Logo & Wordmark

### Name
**Slotflow** — a single word, lowercase `s` in most contexts, capitalized `Slotflow` only at sentence starts and in headings. The name compresses two ideas: *slot* (a time-bound opening, an opportunity, a calendar cell) and *flow* (pipeline, motion through stages).

### Wordmark
- **Typeface**: Inter 600 (semibold)
- **Letter-spacing**: -0.32px at 20px, scales proportionally
- **Color**: `#0d0d0d` on light backgrounds, `#ededed` on dark
- **Accent option**: The letter `o` in "Slot" may be rendered as the logomark glyph (see below) in `#14C98B` for the full lockup.

### Logomark
A **three-slot flow curve with a terminal dot**, combining the idea of structured openings ("slots") with visible movement through a pipeline ("flow"). The mark should read as three vertical slot forms anchored by a continuous curve that passes through them and resolves in a distinct dot. Geometric, minimal, and still legible at 16px favicon size.

- Structure: 24×24 viewbox built from **three evenly spaced vertical slots**, a **single flowing curve/path** moving across them, and a **small terminal dot**
- Slot forms: simple rounded vertical shapes in the base mark color, sized and spaced to stay distinct at small sizes
- Flow curve + dot: rendered in `#14C98B` in the full-color mark to emphasize motion and progression through the slots
- Light-mode version: dark (`#0d0d0d`) slot forms with mint curve/dot
- Dark-mode version: light (`#ededed`) slot forms with mint curve/dot — mint holds across both modes
- Monochrome version: slots, curve, and dot all `#0d0d0d` (or `#ededed` in dark), for contexts where mint can't render

### Lockup Rules
- **Horizontal lockup** (default): logomark + wordmark side-by-side, 8px gap, vertically centered
- **Stacked lockup**: logomark above wordmark, for square/social contexts
- **Mark-only**: logomark alone, for favicons, app icons, tight UI spaces
- **Wordmark-only**: text alone, for body mentions and footers

### Clear Space
Minimum clear space around any lockup equals the height of the logomark. Never crop, rotate, skew, or recolor the mark outside the defined palette.

### Minimum Sizes
- Logomark: 16px (favicon), 20px (UI), 32px (marketing)
- Wordmark: 14px (footer), 18px (nav bar), 32px+ (hero)

### Voice Notes (for copy adjacent to the mark)
- Direct, unhyped, productized. "Track opportunities, run interviews, tailor resumes." Not "Revolutionize your job search."
- Technical-friendly. The audience is competent — skip the onboarding pep talk.

## 8. Light & Dark Mode — Auto Switch

Slotflow supports three theme states: **light**, **dark**, and **auto**. Auto is the default.

### Resolution Order (auto mode)
1. **User explicit override** (stored in preferences / `localStorage`) — if the user manually chose light or dark, honor it permanently until they change it.
2. **Browser preference** — `prefers-color-scheme` media query.
3. **Time of day fallback** — if the browser reports no preference (`no-preference`), use local time: light from **07:00 to 19:00**, dark otherwise.

The resolved theme must be applied **before first paint** (inline script in `<head>` reading `localStorage` + `matchMedia` + `Date`) to avoid a flash of wrong theme.

### Live Reactivity
- Listen to `matchMedia('(prefers-color-scheme: dark)')` `change` event and re-resolve.
- Re-resolve the time-of-day fallback at each 07:00 / 19:00 boundary (single `setTimeout` to the next boundary, then recurse) — but only if the user is on auto and the browser has no preference.

### Dark Mode Tokens
- **Background**: `#0d0d0d`
- **Panel Background**: `#171717`
- **Card Background**: `#141414`
- **Text Primary**: `#ededed`
- **Text Secondary**: `#a0a0a0`
- **Text Tertiary**: `#6e6e6e`
- **Brand Mint**: `#14C98B` (unchanged — holds across both modes)
- **Mint Light (on dark)**: `rgba(20,201,139,0.15)` for tinted backgrounds
- **Mint Deep (on dark)**: `#4fe3b0` for text on dark mint tint
- **Border Subtle**: `rgba(255,255,255,0.08)`
- **Border Medium**: `rgba(255,255,255,0.12)`
- **Row Stripe**: `#141414` (alternates with `#0d0d0d`)
- **Shadow**: `rgba(0,0,0,0.50) 0px 8px 24px` for popovers; cards typically use borders only.

### Key Adjustments
- Primary button inverts: `#ededed` bg, `#0d0d0d` text.
- Brand Primary CTA stays mint background, dark text — contrast works on both modes.
- Focus ring stays mint, but ring tint becomes `rgba(20,201,139,0.35)` for visibility on dark.
- Destructive button: text shifts to `#ff8a8a` on dark.
- AI-draft purple marker: shifts to `#a590ff` for dark-mode legibility.

### Theme Toggle Control
- Three-state segmented control in user menu: **Light / Auto / Dark**.
- Default: Auto.
- Persist choice in user preferences (server-side for logged-in users, `localStorage` fallback).

## 9. Responsive Behavior

### Breakpoints
| Name | Width | Key Changes |
|------|-------|-------------|
| Mobile | <640px | Single column, stacked, bottom nav or hamburger |
| Tablet | 640–1024px | Side nav collapsed to icon rail, two-column grids |
| Desktop | >1024px | Full side nav, multi-column grids, dense tables |

### Touch Targets
- Minimum 36px tap target on mobile (matches default input height).
- Row actions collapse into a single overflow menu under 640px.

### Collapsing Strategy
- Side nav: 220px → 56px icon rail → hamburger drawer
- Data tables: horizontal scroll within card wrapper, sticky first column for long rows
- Pipeline board: horizontal scroll of columns, card width stays fixed
- Opportunity detail: two-column (main + side panel) → stacked single column

## 10. Agent Prompt Guide

### Quick Color Reference
- Primary CTA: Near Black (`#0d0d0d`)
- Brand CTA: Slotflow Mint (`#14C98B`)
- Background: Pure White (`#ffffff`) / `#0d0d0d` dark
- Secondary panel: `#fafafa` / `#171717` dark
- Heading text: `#0d0d0d` / `#ededed` dark
- Body text: `#333333` / `#a0a0a0` dark
- Border: `rgba(0,0,0,0.06)` / `rgba(255,255,255,0.08)` dark
- Focus ring: `#14C98B` with 25% tint outer ring

### Example Component Prompts
- "Create an opportunity card: white background, 1px solid rgba(0,0,0,0.06) border, 14px radius, 16px padding. Title at 16px Inter weight 600, letter-spacing -0.16px. Mono slug beneath at 12px Geist Mono 500 uppercase, color #888888. Status pill top-right: 9999px radius, Geist Mono 11px weight 600 uppercase."
- "Build a data table wrapper: 12px outer radius, 1px border at 6% opacity. Header row: #fafafa background, 12px Inter 500 uppercase tracking 0.4px. Body rows alternate white / #fafafa, hover #f5f5f5."
- "Design the primary button: #0d0d0d background, white text, 8px radius, 8px 18px padding, 14px Inter 500. Shadow rgba(0,0,0,0.06) 0px 1px 2px. Hover #1f1f1f."
- "Design the brand CTA: #14C98B background, #0d0d0d text (dark on mint for contrast), 8px radius, 8px 18px padding. Hover #0fb57a."
- "Build the side nav: #fafafa background, 220px wide. Items 8px padding, 6px radius, 13px Inter 500. Active: #c9f3e1 bg, #0a8f62 text, 2px left border in #14C98B."

### Iteration Guide
1. Use 8px radius for buttons/inputs, 14px for cards — pills (9999px) only for status badges and toggles.
2. Borders at 6% opacity for product UI, 10% for interactive states. Stronger than a marketing-only system because density demands clearer separation.
3. Letter-spacing scales with size: -0.96px at 48px, -0.56px at 28px, -0.16px at 16px, normal at 14px.
4. Three weights only: 400 (read), 500 (interact), 600 (announce). No 700.
5. Mint (`#14C98B`) is used sparingly — primary brand CTAs, active nav, focus rings, pipeline "active" states. Never decorative fills.
6. Geist Mono uppercase for technical labels, IDs, table headers. Inter for everything else.
7. Product surfaces are dense: 24–48px section padding, 14px body, 13px table cells. Marketing relaxes to 64–96px and 16px.
8. Two-surface rule: white canvas + `#fafafa` secondary. No third tone in light mode.
9. Theme resolves in order: explicit user choice → browser preference → time of day (light 07:00–19:00, else dark). Apply before first paint.
