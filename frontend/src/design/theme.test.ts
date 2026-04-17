import { describe, expect, it } from "vitest";
import { resolveFromTimeOfDay, resolveTheme } from "./theme";

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
