/**
 * Slotflow CRM design tokens.
 *
 * Source of truth: DESIGN.md (repo root).
 * Consumed by: Tailwind config (when scaffolded), CSS custom properties,
 * and component primitives.
 */

export const color = {
  brand: {
    mint: "#14C98B",
    mintLight: "#c9f3e1",
    mintDeep: "#0a8f62",
    mintOnDark: "#4fe3b0",
  },
  accent: {
    amber: "#c37d0d",
    blue: "#3772cf",
    red: "#d45656",
    purple: "#7a5af8",
    purpleOnDark: "#a590ff",
    redOnDark: "#ff8a8a",
  },
  neutral: {
    gray900: "#0d0d0d",
    gray700: "#333333",
    gray500: "#666666",
    gray400: "#888888",
    gray300: "#c9c9c9",
    gray200: "#e5e5e5",
    gray100: "#f5f5f5",
    gray50: "#fafafa",
    white: "#ffffff",
  },
  dark: {
    bg: "#0d0d0d",
    panel: "#171717",
    card: "#141414",
    textPrimary: "#ededed",
    textSecondary: "#a0a0a0",
    textTertiary: "#6e6e6e",
  },
  border: {
    subtleLight: "rgba(0,0,0,0.06)",
    mediumLight: "rgba(0,0,0,0.10)",
    subtleDark: "rgba(255,255,255,0.08)",
    mediumDark: "rgba(255,255,255,0.12)",
  },
} as const;

export const radius = {
  sm: "6px",
  md: "8px",
  lg: "10px",
  xl: "14px",
  pill: "9999px",
} as const;

export const spacing = {
  "0.5": "2px",
  "1": "4px",
  "1.5": "6px",
  "2": "8px",
  "2.5": "10px",
  "3": "12px",
  "4": "16px",
  "5": "20px",
  "6": "24px",
  "8": "32px",
  "10": "40px",
  "12": "48px",
  "16": "64px",
  "24": "96px",
} as const;

export const font = {
  family: {
    sans: 'Inter, "Inter Fallback", system-ui, -apple-system, sans-serif',
    mono: '"Geist Mono", "Geist Mono Fallback", ui-monospace, SFMono-Regular, monospace',
  },
  weight: {
    regular: 400,
    medium: 500,
    semibold: 600,
  },
  size: {
    displayHero: "48px",
    pageTitle: "28px",
    sectionHeading: "20px",
    subHeading: "16px",
    bodyLarge: "16px",
    body: "14px",
    tableCell: "13px",
    tableHeader: "12px",
    button: "14px",
    link: "13px",
    caption: "12px",
    labelUppercase: "12px",
    monoCode: "12px",
    monoLabel: "11px",
    monoMicro: "10px",
  },
} as const;

export const shadow = {
  none: "none",
  card: "rgba(0,0,0,0.03) 0px 1px 2px",
  button: "rgba(0,0,0,0.06) 0px 1px 2px",
  popover: "rgba(0,0,0,0.10) 0px 8px 24px",
  modal: "rgba(0,0,0,0.18) 0px 16px 48px",
  popoverDark: "rgba(0,0,0,0.50) 0px 8px 24px",
} as const;

export const breakpoint = {
  mobile: "0px",
  tablet: "640px",
  desktop: "1024px",
  wide: "1440px",
} as const;

export type DesignTokens = {
  color: typeof color;
  radius: typeof radius;
  spacing: typeof spacing;
  font: typeof font;
  shadow: typeof shadow;
  breakpoint: typeof breakpoint;
};

export const tokens: DesignTokens = { color, radius, spacing, font, shadow, breakpoint };
