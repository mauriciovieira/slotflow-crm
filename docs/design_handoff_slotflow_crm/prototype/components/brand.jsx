/* global React */
const { useState, useEffect } = React;

// Logomark — three "slots" at increasing heights connected by a mint curve.
// Evokes slot (bars) + flow (curve) + an ascending pipeline.
// Square container 24x24 ensures parity with favicon/app icon contexts.
function Logomark({ size = 24, rounded = true, bg, accent = "#14C98B", tone }) {
  // tone: "dark" (default, black) or "light" (for use on mint/dark backgrounds)
  const sq = tone === "light" ? "#ededed" : "#0d0d0d";
  const barFill = tone === "light" ? "#0d0d0d" : "#ededed";
  const sqFill = bg ?? sq;
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      width={size}
      height={size}
      role="img"
      aria-label="Slotflow"
      style={{ display: "block", flexShrink: 0 }}
    >
      <rect x="0" y="0" width="24" height="24" rx={rounded ? 6 : 0} fill={sqFill} />
      {/* Three slots at increasing heights — the "slots" the pipeline fills */}
      <rect x="4.5" y="13" width="3" height="6.5" rx="1.25" fill={barFill} opacity="0.55" />
      <rect x="10.5" y="9.5" width="3" height="10" rx="1.25" fill={barFill} opacity="0.55" />
      <rect x="16.5" y="6" width="3" height="13.5" rx="1.25" fill={barFill} opacity="0.55" />
      {/* Flow curve connecting the tops of the slots */}
      <path
        d="M 6 13 C 8.5 11.5, 9.5 10.5, 12 9.5 C 14.5 8.5, 15.5 7, 18 6"
        stroke={accent}
        strokeWidth="2.25"
        strokeLinecap="round"
        fill="none"
      />
      {/* Terminal dot on the last slot — the "landed" opportunity */}
      <circle cx="18" cy="6" r="1.85" fill={accent} />
    </svg>
  );
}

// Monochrome version
function LogomarkMono({ size = 24, color = "currentColor" }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" width={size} height={size} style={{ display: "block", flexShrink: 0 }}>
      <rect x="0" y="0" width="24" height="24" rx="6" fill={color} />
      <rect x="4.5" y="13" width="3" height="6.5" rx="1.25" fill="rgba(255,255,255,0.35)" />
      <rect x="10.5" y="9.5" width="3" height="10" rx="1.25" fill="rgba(255,255,255,0.35)" />
      <rect x="16.5" y="6" width="3" height="13.5" rx="1.25" fill="rgba(255,255,255,0.35)" />
      <path d="M 6 13 C 8.5 11.5, 9.5 10.5, 12 9.5 C 14.5 8.5, 15.5 7, 18 6" stroke="#fff" strokeWidth="2.25" strokeLinecap="round" fill="none" />
      <circle cx="18" cy="6" r="1.85" fill="#fff" />
    </svg>
  );
}

function Wordmark({ size = 20, color }) {
  // Letter-spacing follows DESIGN.md: -0.32px at 20px, scales proportionally
  const tracking = -0.016 * size; // ~-0.32 at 20px
  return (
    <span
      style={{
        fontFamily: "Inter, system-ui, sans-serif",
        fontSize: size,
        fontWeight: 600,
        letterSpacing: `${tracking}px`,
        color: color ?? "var(--color-text-primary)",
        lineHeight: 1,
      }}
    >
      Slotflow
    </span>
  );
}

function Lockup({ size = 20, color, tone }) {
  const markSize = Math.round(size * 1.1);
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 8 }}>
      <Logomark size={markSize} tone={tone} />
      <Wordmark size={size} color={color} />
    </span>
  );
}

window.Logomark = Logomark;
window.LogomarkMono = LogomarkMono;
window.Wordmark = Wordmark;
window.Lockup = Lockup;
