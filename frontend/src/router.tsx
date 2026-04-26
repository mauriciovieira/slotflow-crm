import { Navigate, type RouteObject, createBrowserRouter } from "react-router";
import { AuthGuard } from "./components/AuthGuard";
import { DashboardLayout } from "./components/DashboardLayout";
import { StubPanel } from "./components/StubPanel";
import { DASHBOARD_NAV } from "./dashboardNav";
import { AcceptInvite } from "./screens/AcceptInvite";
import { Landing } from "./screens/Landing";
import { Login } from "./screens/Login";
import { OpportunitiesBoard } from "./screens/OpportunitiesBoard";
import { OpportunitiesList } from "./screens/OpportunitiesList";
import { OpportunityCreate } from "./screens/OpportunityCreate";
import { OpportunityDetail } from "./screens/OpportunityDetail";
import { InterviewCycleCreate } from "./screens/InterviewCycleCreate";
import { InterviewCycleDetail } from "./screens/InterviewCycleDetail";
import { InterviewsList } from "./screens/InterviewsList";
import { AuditLog } from "./screens/AuditLog";
import { Insights } from "./screens/Insights";
import { ResumeCreate } from "./screens/ResumeCreate";
import { ResumeDetail } from "./screens/ResumeDetail";
import { ResumesList } from "./screens/ResumesList";
import { Settings } from "./screens/Settings";
import { TwoFactorSetup } from "./screens/TwoFactorSetup";
import { TwoFactorVerify } from "./screens/TwoFactorVerify";

// Exported so tests (and any future tooling) can build a memory router from
// the production config instead of reconstructing the tree by hand.
export const routes: RouteObject[] = [
  { path: "/", element: <Landing /> },
  { path: "/login", element: <Login /> },
  { path: "/accept-invite/:token", element: <AcceptInvite /> },
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
      { path: "opportunities/board", element: <OpportunitiesBoard /> },
      { path: "opportunities/:opportunityId", element: <OpportunityDetail /> },
      { path: "resumes/new", element: <ResumeCreate /> },
      { path: "resumes/:resumeId", element: <ResumeDetail /> },
      { path: "interviews/new", element: <InterviewCycleCreate /> },
      { path: "interviews/:cycleId", element: <InterviewCycleDetail /> },
      ...DASHBOARD_NAV.map((item) => ({
        path: item.slug,
        element:
          item.slug === "opportunities"
            ? <OpportunitiesList />
            : item.slug === "resumes"
              ? <ResumesList />
              : item.slug === "interviews"
                ? <InterviewsList />
                : item.slug === "insights"
                  ? <Insights />
                  : item.slug === "audit"
                    ? <AuditLog />
                    : item.slug === "settings"
                      ? <Settings />
                      : <StubPanel />,
      })),
    ],
  },
];

export const router = createBrowserRouter(routes);
