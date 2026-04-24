import { Navigate, createBrowserRouter } from "react-router";
import { AuthGuard } from "./components/AuthGuard";
import { DashboardLayout } from "./components/DashboardLayout";
import { StubPanel } from "./components/StubPanel";
import { DASHBOARD_NAV } from "./dashboardNav";
import { Landing } from "./screens/Landing";
import { Login } from "./screens/Login";
import { TwoFactorSetup } from "./screens/TwoFactorSetup";
import { TwoFactorVerify } from "./screens/TwoFactorVerify";

export const router = createBrowserRouter([
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
      ...DASHBOARD_NAV.map((item) => ({
        path: item.slug,
        element: <StubPanel title={item.label} />,
      })),
    ],
  },
]);
