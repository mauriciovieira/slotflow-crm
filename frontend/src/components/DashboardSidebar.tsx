import { NavLink } from "react-router";
import lockup from "../assets/brand/lockup.svg";
import { DASHBOARD_NAV } from "../dashboardNav";
import { TestIds } from "../testIds";

const BASE_LINK =
  "relative block pl-5 pr-4 py-2 text-sm border-l-[3px] border-transparent";
const INACTIVE = "text-ink-secondary hover:text-ink";
const ACTIVE = "bg-brand-light text-ink border-brand";

export function DashboardSidebar() {
  return (
    <aside
      data-testid={TestIds.DASHBOARD_SIDEBAR}
      className="w-60 shrink-0 border-r border-border-subtle bg-surface-card flex flex-col"
    >
      <div className="px-5 py-5 border-b border-border-subtle">
        <img src={lockup} alt="Slotflow" height={22} />
      </div>
      <nav className="flex-1 py-3">
        {DASHBOARD_NAV.map((item) => (
          <NavLink
            key={item.slug}
            to={`/dashboard/${item.slug}`}
            data-testid={item.testId}
            className={({ isActive }) =>
              `${BASE_LINK} ${isActive ? ACTIVE : INACTIVE}`
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </aside>
  );
}
