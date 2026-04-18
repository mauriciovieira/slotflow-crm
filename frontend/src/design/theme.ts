/**
 * Theme resolver for Slotflow CRM.
 *
 * Three user-facing modes: "light", "dark", "auto" (default).
 *
 * In "auto" mode the resolved theme is:
 *   1. browser prefers-color-scheme, if the user has expressed one
 *   2. otherwise time-of-day fallback: light 07:00-19:00 local, else dark
 *
 * Apply via `beforePaintScript` inline in <head> to avoid FOUC.
 */

export type ThemeMode = "light" | "dark" | "auto";
export type ResolvedTheme = "light" | "dark";

export const THEME_STORAGE_KEY = "slotflow.theme";
const DAY_START_HOUR = 7;
const DAY_END_HOUR = 19;

export function readStoredMode(): ThemeMode {
  if (typeof window === "undefined") return "auto";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    return raw === "light" || raw === "dark" || raw === "auto" ? raw : "auto";
  } catch {
    return "auto";
  }
}

export function writeStoredMode(mode: ThemeMode): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(THEME_STORAGE_KEY, mode);
  } catch {
    // Storage can throw in sandboxed/disabled contexts; keep the in-memory
    // apply path working and drop the persistence silently.
  }
}

export function resolveFromTimeOfDay(now: Date = new Date()): ResolvedTheme {
  const hour = now.getHours();
  return hour >= DAY_START_HOUR && hour < DAY_END_HOUR ? "light" : "dark";
}

export function resolveAuto(now: Date = new Date()): ResolvedTheme {
  if (typeof window === "undefined" || !window.matchMedia) {
    return resolveFromTimeOfDay(now);
  }
  const dark = window.matchMedia("(prefers-color-scheme: dark)");
  const light = window.matchMedia("(prefers-color-scheme: light)");
  if (dark.matches) return "dark";
  if (light.matches) return "light";
  return resolveFromTimeOfDay(now);
}

export function resolveTheme(mode: ThemeMode, now: Date = new Date()): ResolvedTheme {
  if (mode === "light" || mode === "dark") return mode;
  return resolveAuto(now);
}

export function applyTheme(resolved: ResolvedTheme): void {
  if (typeof document === "undefined") return;
  document.documentElement.dataset.theme = resolved;
}

/**
 * Inline this in <head> (before CSS/JS) to prevent a flash of wrong theme.
 * Written as a self-contained string so it can be emitted from the SSR/HTML
 * shell without bundling the whole module.
 */
export const beforePaintScript = `(function(){
  try {
    var k = ${JSON.stringify(THEME_STORAGE_KEY)};
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
        resolved = (h >= ${DAY_START_HOUR} && h < ${DAY_END_HOUR}) ? "light" : "dark";
      }
    }
    document.documentElement.setAttribute("data-theme", resolved);
  } catch (_) {}
})();`;

export type ThemeController = {
  mode: ThemeMode;
  resolved: ResolvedTheme;
  setMode: (next: ThemeMode) => void;
  destroy: () => void;
};

/**
 * Framework-agnostic controller. React/other UI layers wrap this with their
 * own reactivity primitives. Handles:
 *   - persistence of the user's mode choice
 *   - live reaction to `prefers-color-scheme` changes
 *   - boundary re-resolution at 07:00 / 19:00 when on auto + no browser pref
 */
export function createThemeController(
  onChange?: (resolved: ResolvedTheme, mode: ThemeMode) => void,
): ThemeController {
  let mode: ThemeMode = readStoredMode();
  let resolved: ResolvedTheme = resolveTheme(mode);
  applyTheme(resolved);

  const emit = () => {
    const next = resolveTheme(mode);
    if (next !== resolved) {
      resolved = next;
      applyTheme(resolved);
    }
    onChange?.(resolved, mode);
  };

  const mql = typeof window !== "undefined" && window.matchMedia
    ? window.matchMedia("(prefers-color-scheme: dark)")
    : null;

  const hasExplicitColorScheme = (): boolean => {
    if (typeof window === "undefined" || !window.matchMedia) return false;
    return (
      window.matchMedia("(prefers-color-scheme: dark)").matches ||
      window.matchMedia("(prefers-color-scheme: light)").matches
    );
  };

  let boundaryTimer: ReturnType<typeof setTimeout> | null = null;
  const clearBoundary = () => {
    if (boundaryTimer) { clearTimeout(boundaryTimer); boundaryTimer = null; }
  };
  const scheduleBoundary = () => {
    if (mode !== "auto") return;
    if (hasExplicitColorScheme()) return;
    const now = new Date();
    const next = new Date(now);
    const h = now.getHours();
    if (h < DAY_START_HOUR) next.setHours(DAY_START_HOUR, 0, 0, 0);
    else if (h < DAY_END_HOUR) next.setHours(DAY_END_HOUR, 0, 0, 0);
    else { next.setDate(next.getDate() + 1); next.setHours(DAY_START_HOUR, 0, 0, 0); }
    const delay = Math.max(1000, next.getTime() - now.getTime());
    boundaryTimer = setTimeout(() => {
      emit();
      scheduleBoundary();
    }, delay);
  };

  const mqlHandler = () => {
    if (mode !== "auto") return;
    clearBoundary();
    scheduleBoundary();
    emit();
  };
  mql?.addEventListener?.("change", mqlHandler);

  scheduleBoundary();

  return {
    get mode() { return mode; },
    get resolved() { return resolved; },
    setMode(next: ThemeMode) {
      mode = next;
      writeStoredMode(next);
      clearBoundary();
      scheduleBoundary();
      emit();
    },
    destroy() {
      mql?.removeEventListener?.("change", mqlHandler);
      clearBoundary();
    },
  };
}
