/**
 * Tailwind preset derived from Slotflow design tokens.
 *
 * When the Vite/Tailwind scaffold lands (Track 07), the app's
 * tailwind.config.ts should do:
 *
 *   import slotflowPreset from "./src/design/tailwind.preset";
 *   export default { presets: [slotflowPreset], content: [...] };
 *
 * Using CSS variables (not literal hex) for theme-aware utilities means
 * `bg-surface` automatically flips with `[data-theme="dark"]`.
 */

import { color, font, radius, spacing } from "./tokens";

const tailwindPreset = {
  theme: {
    extend: {
      colors: {
        brand: {
          DEFAULT: "var(--color-brand)",
          light: "var(--color-brand-light)",
          deep: "var(--color-brand-deep)",
          raw: color.brand.mint,
        },
        surface: {
          DEFAULT: "var(--color-bg)",
          panel: "var(--color-panel)",
          card: "var(--color-card)",
          rowStripe: "var(--color-row-stripe)",
          rowHover: "var(--color-row-hover)",
        },
        ink: {
          DEFAULT: "var(--color-text-primary)",
          secondary: "var(--color-text-secondary)",
          muted: "var(--color-text-muted)",
          placeholder: "var(--color-text-placeholder)",
        },
        border: {
          subtle: "var(--color-border-subtle)",
          medium: "var(--color-border-medium)",
          strong: "var(--color-border-strong)",
        },
        amber: color.accent.amber,
        info: color.accent.blue,
        danger: "var(--color-red)",
        ai: "var(--color-purple)",
        gray: {
          50: color.neutral.gray50,
          100: color.neutral.gray100,
          200: color.neutral.gray200,
          300: color.neutral.gray300,
          400: color.neutral.gray400,
          500: color.neutral.gray500,
          700: color.neutral.gray700,
          900: color.neutral.gray900,
        },
      },
      borderRadius: {
        sm: radius.sm,
        md: radius.md,
        lg: radius.lg,
        xl: radius.xl,
        pill: radius.pill,
      },
      boxShadow: {
        card: "var(--shadow-card)",
        button: "var(--shadow-button)",
        popover: "var(--shadow-popover)",
        modal: "var(--shadow-modal)",
      },
      fontFamily: {
        sans: font.family.sans.split(",").map((s) => s.trim().replace(/^"|"$/g, "")),
        mono: font.family.mono.split(",").map((s) => s.trim().replace(/^"|"$/g, "")),
      },
      fontSize: {
        "display-hero": [font.size.displayHero, { lineHeight: "1.10", letterSpacing: "-0.96px", fontWeight: "600" }],
        "page-title": [font.size.pageTitle, { lineHeight: "1.20", letterSpacing: "-0.56px", fontWeight: "600" }],
        "section": [font.size.sectionHeading, { lineHeight: "1.25", letterSpacing: "-0.30px", fontWeight: "600" }],
        "sub": [font.size.subHeading, { lineHeight: "1.30", letterSpacing: "-0.16px", fontWeight: "600" }],
        "body-lg": [font.size.bodyLarge, { lineHeight: "1.50" }],
        "body": [font.size.body, { lineHeight: "1.45" }],
        "cell": [font.size.tableCell, { lineHeight: "1.40" }],
        "th": [font.size.tableHeader, { lineHeight: "1.30", letterSpacing: "0.40px", fontWeight: "500" }],
        "caption": [font.size.caption, { lineHeight: "1.45" }],
        "label": [font.size.labelUppercase, { lineHeight: "1.40", letterSpacing: "0.60px", fontWeight: "500" }],
        "mono-code": [font.size.monoCode, { lineHeight: "1.45", letterSpacing: "0.40px", fontWeight: "500" }],
        "mono-label": [font.size.monoLabel, { lineHeight: "1.40", letterSpacing: "0.55px", fontWeight: "600" }],
        "mono-micro": [font.size.monoMicro, { lineHeight: "1.40", letterSpacing: "0.50px", fontWeight: "500" }],
      },
      spacing,
    },
  },
} as const;

export default tailwindPreset;
