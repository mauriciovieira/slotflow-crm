// Shared data-testid values. Duplicated verbatim in e2e/support/selectors.ts
// (kept in sync by hand; the e2e package is a standalone npm workspace).
export const TestIds = {
  LOGIN_USERNAME: "login-username",
  LOGIN_PASSWORD: "login-password",
  LOGIN_SUBMIT: "login-submit",
  SIGNED_IN_HEADER: "signed-in-header",
  SIGN_OUT_BUTTON: "sign-out-button",
  LANDING_CTA_PRIMARY: "landing-cta-primary",
  DASHBOARD_SIDEBAR: "dashboard-sidebar",
  DASHBOARD_HEADER: "dashboard-header",
  NAV_OPPORTUNITIES: "nav-opportunities",
  NAV_RESUMES: "nav-resumes",
  NAV_INTERVIEWS: "nav-interviews",
  NAV_SETTINGS: "nav-settings",
  STUB_PANEL: "stub-panel",
  OPPORTUNITIES_LIST: "opportunities-list",
  OPPORTUNITIES_EMPTY: "opportunities-empty",
  OPPORTUNITIES_ERROR: "opportunities-error",
  OPPORTUNITIES_LOADING: "opportunities-loading",
  OPPORTUNITIES_ROW: "opportunities-row",
  OPPORTUNITIES_NEW_BUTTON: "opportunities-new-button",
  OPPORTUNITY_CREATE_FORM: "opportunity-create-form",
  OPPORTUNITY_CREATE_TITLE: "opportunity-create-title",
  OPPORTUNITY_CREATE_COMPANY: "opportunity-create-company",
  OPPORTUNITY_CREATE_NOTES: "opportunity-create-notes",
  OPPORTUNITY_CREATE_SUBMIT: "opportunity-create-submit",
  OPPORTUNITY_CREATE_CANCEL: "opportunity-create-cancel",
  OPPORTUNITY_CREATE_ERROR: "opportunity-create-error",
} as const;

export type TestId = typeof TestIds[keyof typeof TestIds];
