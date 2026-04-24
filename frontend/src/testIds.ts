// Shared data-testid values. Duplicated verbatim in e2e/support/selectors.ts
// (kept in sync by hand; the e2e package is a standalone npm workspace).
export const TestIds = {
  LOGIN_USERNAME: "login-username",
  LOGIN_PASSWORD: "login-password",
  LOGIN_SUBMIT: "login-submit",
  SIGNED_IN_HEADER: "signed-in-header",
  SIGN_OUT_BUTTON: "sign-out-button",
  LANDING_CTA_PRIMARY: "landing-cta-primary",
} as const;

export type TestId = typeof TestIds[keyof typeof TestIds];
