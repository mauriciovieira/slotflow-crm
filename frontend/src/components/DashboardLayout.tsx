import { Outlet, useLocation } from "react-router";
import { DASHBOARD_NAV } from "../dashboardNav";
import { DashboardHeader } from "./DashboardHeader";
import { DashboardSidebar } from "./DashboardSidebar";

function titleForPath(pathname: string): string {
  const segment = pathname.replace(/^\/dashboard\/?/, "").split("/")[0] ?? "";
  const match = DASHBOARD_NAV.find((item) => item.slug === segment);
  return match?.label ?? "Dashboard";
}

export function DashboardLayout() {
  const { pathname } = useLocation();
  const title = titleForPath(pathname);

  return (
    <div className="min-h-full flex bg-surface">
      <DashboardSidebar />
      <div className="flex-1 flex flex-col min-w-0">
        <DashboardHeader title={title} />
        <main className="flex-1">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
