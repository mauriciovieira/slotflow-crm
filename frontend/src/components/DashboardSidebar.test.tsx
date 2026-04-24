import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { createMemoryRouter, RouterProvider } from "react-router";
import { DashboardSidebar } from "./DashboardSidebar";
import { DASHBOARD_NAV } from "../dashboardNav";
import { TestIds } from "../testIds";

function mountAt(path: string) {
  const router = createMemoryRouter(
    [{ path: "/dashboard/*", element: <DashboardSidebar /> }],
    { initialEntries: [path] },
  );
  return render(<RouterProvider router={router} />);
}

describe("DashboardSidebar", () => {
  it("renders the four nav items in registry order", () => {
    mountAt("/dashboard/opportunities");
    const sidebar = screen.getByTestId(TestIds.DASHBOARD_SIDEBAR);
    const links = sidebar.querySelectorAll("a");
    expect(links.length).toBe(DASHBOARD_NAV.length);
    DASHBOARD_NAV.forEach((item, i) => {
      expect(links[i]).toHaveTextContent(item.label);
    });
  });

  it("points each link at /dashboard/<slug>", () => {
    mountAt("/dashboard/opportunities");
    DASHBOARD_NAV.forEach((item) => {
      const link = screen.getByTestId(item.testId);
      expect(link.getAttribute("href")).toBe(`/dashboard/${item.slug}`);
    });
  });

  it("marks only the active slug as active", () => {
    mountAt("/dashboard/resumes");
    const active = screen.getByTestId(TestIds.NAV_RESUMES);
    expect(active.className).toMatch(/bg-brand-light/);
    const inactive = screen.getByTestId(TestIds.NAV_OPPORTUNITIES);
    expect(inactive.className).not.toMatch(/bg-brand-light/);
  });
});
