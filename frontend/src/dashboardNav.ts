import { TestIds, type TestId } from "./testIds";

export const DASHBOARD_NAV = [
  { slug: "opportunities", label: "Opportunities", testId: TestIds.NAV_OPPORTUNITIES },
  { slug: "resumes", label: "Resumes", testId: TestIds.NAV_RESUMES },
  { slug: "interviews", label: "Interviews", testId: TestIds.NAV_INTERVIEWS },
  { slug: "settings", label: "Settings", testId: TestIds.NAV_SETTINGS },
] as const satisfies ReadonlyArray<{ slug: string; label: string; testId: TestId }>;

export type DashboardNavItem = (typeof DASHBOARD_NAV)[number];
export type DashboardNavSlug = DashboardNavItem["slug"];
