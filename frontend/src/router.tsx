import { Navigate, type RouteObject, createBrowserRouter } from "react-router";
import { AuthGuard } from "./components/AuthGuard";
import { DashboardLayout } from "./components/DashboardLayout";
import { StubPanel } from "./components/StubPanel";
import { DASHBOARD_NAV } from "./dashboardNav";
import { Landing } from "./screens/Landing";
import { Login } from "./screens/Login";
import { OpportunitiesList } from "./screens/OpportunitiesList";
import { OpportunityCreate } from "./screens/OpportunityCreate";
import { TwoFactorSetup } from "./screens/TwoFactorSetup";
import { TwoFactorVerify } from "./screens/TwoFactorVerify";

// Exported so tests (and any future tooling) can build a memory router from
// the production config instead of reconstructing the tree by hand.
export const routes: RouteObject[] = [
  { path: "/", element: <Landing /> },
  { path: "/login", element: <Login /> },
  {
    path: "/2fa/setup",
    element: (
      <AuthGuard requireVerified={false}>
        <TwoFactorSetup />
      </AuthGuard>
    ),
  },
  {
    path: "/2fa/verify",
    element: (
      <AuthGuard requireVerified={false}>
        <TwoFactorVerify />
      </AuthGuard>
    ),
  },
  {
    path: "/dashboard",
    element: (
      <AuthGuard>
        <DashboardLayout />
      </AuthGuard>
    ),
    children: [
      { index: true, element: <Navigate to="opportunities" replace /> },
      { path: "opportunities/new", element: <OpportunityCreate /> },
      ...DASHBOARD_NAV.map((item) => ({
        path: item.slug,
        element: item.slug === "opportunities" ? <OpportunitiesList /> : <StubPanel />,
      })),
    ],
  },
];

export const router = createBrowserRouter(routes);
