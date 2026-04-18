import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  createThemeController,
  readStoredMode,
  resolveAuto,
  resolveFromTimeOfDay,
  resolveTheme,
  writeStoredMode,
  THEME_STORAGE_KEY,
} from "./theme";

type MediaListener = (evt: { matches: boolean }) => void;

function stubEnvironment(opts: {
  storage?: { initial?: string | null; readThrows?: boolean; writeThrows?: boolean };
  media?: Record<string, boolean>;
}): { dispatchMediaChange: () => void; writes: Array<[string, string]> } {
  const listeners: MediaListener[] = [];
  const writes: Array<[string, string]> = [];
  let stored: string | null = opts.storage?.initial ?? null;

  const matchMedia = (query: string) => ({
    matches: opts.media?.[query] ?? false,
    addEventListener: (_event: string, cb: MediaListener) => {
      listeners.push(cb);
    },
    removeEventListener: (_event: string, cb: MediaListener) => {
      const i = listeners.indexOf(cb);
      if (i >= 0) listeners.splice(i, 1);
    },
  });

  const localStorage = {
    getItem: () => {
      if (opts.storage?.readThrows) throw new Error("storage disabled");
      return stored;
    },
    setItem: (k: string, v: string) => {
      if (opts.storage?.writeThrows) throw new Error("quota");
      stored = v;
      writes.push([k, v]);
    },
  };

  vi.stubGlobal("window", { matchMedia, localStorage });
  vi.stubGlobal("document", {
    documentElement: { dataset: {} as Record<string, string> },
  });

  return {
    dispatchMediaChange: () => listeners.slice().forEach((cb) => cb({ matches: true })),
    writes,
  };
}

describe("resolveFromTimeOfDay", () => {
  it("returns light between 07:00 and 19:00", () => {
    expect(resolveFromTimeOfDay(new Date(2026, 3, 17, 7, 0))).toBe("light");
    expect(resolveFromTimeOfDay(new Date(2026, 3, 17, 12, 30))).toBe("light");
    expect(resolveFromTimeOfDay(new Date(2026, 3, 17, 18, 59))).toBe("light");
  });

  it("returns dark outside 07:00-19:00", () => {
    expect(resolveFromTimeOfDay(new Date(2026, 3, 17, 6, 59))).toBe("dark");
    expect(resolveFromTimeOfDay(new Date(2026, 3, 17, 19, 0))).toBe("dark");
    expect(resolveFromTimeOfDay(new Date(2026, 3, 17, 23, 30))).toBe("dark");
    expect(resolveFromTimeOfDay(new Date(2026, 3, 17, 2, 0))).toBe("dark");
  });
});

describe("resolveTheme with explicit mode", () => {
  it("honors explicit light", () => {
    expect(resolveTheme("light", new Date(2026, 3, 17, 23, 0))).toBe("light");
  });
  it("honors explicit dark", () => {
    expect(resolveTheme("dark", new Date(2026, 3, 17, 12, 0))).toBe("dark");
  });
});

describe("resolveAuto", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns dark when prefers-color-scheme: dark matches", () => {
    stubEnvironment({ media: { "(prefers-color-scheme: dark)": true } });
    expect(resolveAuto(new Date(2026, 3, 17, 12, 0))).toBe("dark");
  });

  it("returns light when prefers-color-scheme: light matches", () => {
    stubEnvironment({ media: { "(prefers-color-scheme: light)": true } });
    expect(resolveAuto(new Date(2026, 3, 17, 23, 0))).toBe("light");
  });

  it("falls through to time-of-day when neither media query matches", () => {
    stubEnvironment({ media: {} });
    expect(resolveAuto(new Date(2026, 3, 17, 12, 0))).toBe("light");
    expect(resolveAuto(new Date(2026, 3, 17, 23, 0))).toBe("dark");
  });
});

describe("readStoredMode", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("returns 'auto' when window is undefined (SSR)", () => {
    expect(readStoredMode()).toBe("auto");
  });

  it("returns the stored mode when valid", () => {
    stubEnvironment({ storage: { initial: "dark" } });
    expect(readStoredMode()).toBe("dark");
  });

  it("returns 'auto' for an unrecognized stored value", () => {
    stubEnvironment({ storage: { initial: "purple" } });
    expect(readStoredMode()).toBe("auto");
  });

  it("returns 'auto' when storage access throws", () => {
    stubEnvironment({ storage: { readThrows: true } });
    expect(readStoredMode()).toBe("auto");
  });
});

describe("writeStoredMode", () => {
  afterEach(() => vi.unstubAllGlobals());

  it("persists the mode under the storage key", () => {
    const env = stubEnvironment({});
    writeStoredMode("dark");
    expect(env.writes).toEqual([[THEME_STORAGE_KEY, "dark"]]);
  });

  it("swallows storage write failures", () => {
    stubEnvironment({ storage: { writeThrows: true } });
    expect(() => writeStoredMode("light")).not.toThrow();
  });
});

describe("createThemeController", () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 3, 17, 12, 0));
  });
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  it("resolves from stored mode at construction", () => {
    stubEnvironment({ storage: { initial: "dark" } });
    const ctrl = createThemeController();
    expect(ctrl.mode).toBe("dark");
    expect(ctrl.resolved).toBe("dark");
    ctrl.destroy();
  });

  it("notifies onChange when setMode flips the resolved theme", () => {
    stubEnvironment({});
    const events: Array<[string, string]> = [];
    const ctrl = createThemeController((resolved, mode) => events.push([resolved, mode]));
    ctrl.setMode("dark");
    expect(ctrl.resolved).toBe("dark");
    expect(events.at(-1)).toEqual(["dark", "dark"]);
    ctrl.destroy();
  });

  it("re-emits on prefers-color-scheme change while in auto mode", () => {
    let darkModeMatches = false;
    const listeners = new Set<MediaListener>();
    const storage = new Map<string, string>();

    vi.stubGlobal("window", {
      matchMedia: (query: string) => ({
        media: query,
        get matches() {
          return query === "(prefers-color-scheme: dark)" ? darkModeMatches : false;
        },
        addEventListener: (type: string, listener: MediaListener) => {
          if (type === "change" && query === "(prefers-color-scheme: dark)") listeners.add(listener);
        },
        removeEventListener: (type: string, listener: MediaListener) => {
          if (type === "change" && query === "(prefers-color-scheme: dark)") listeners.delete(listener);
        },
        addListener: (listener: MediaListener) => {
          if (query === "(prefers-color-scheme: dark)") listeners.add(listener);
        },
        removeListener: (listener: MediaListener) => {
          if (query === "(prefers-color-scheme: dark)") listeners.delete(listener);
        },
      }),
    });
    vi.stubGlobal("document", {
      documentElement: {
        dataset: {},
        style: {
          setProperty: vi.fn(),
        },
      },
    });
    vi.stubGlobal("localStorage", {
      getItem: (key: string) => storage.get(key) ?? null,
      setItem: (key: string, value: string) => {
        storage.set(key, value);
      },
      removeItem: (key: string) => {
        storage.delete(key);
      },
    });

    const events: Array<[string, string]> = [];
    const ctrl = createThemeController((resolved, mode) => events.push([resolved, mode]));

    expect(ctrl.mode).toBe("auto");
    expect(ctrl.resolved).toBe("light");

    darkModeMatches = true;
    for (const listener of listeners) listener({ matches: true });

    expect(ctrl.resolved).toBe("dark");
    expect(events.at(-1)).toEqual(["dark", "auto"]);
    ctrl.destroy();
  });

  it("ignores prefers-color-scheme change when mode is explicit", () => {
    const env = stubEnvironment({});
    const events: Array<[string, string]> = [];
    const ctrl = createThemeController((resolved, mode) => events.push([resolved, mode]));
    ctrl.setMode("light");
    const baseline = events.length;
    env.dispatchMediaChange();
    expect(events.length).toBe(baseline);
    ctrl.destroy();
  });
});
