// Mirrors frontend/src/testIds.ts. Kept in sync by hand; the e2e package is
// a separate npm workspace with no path into frontend/src.
export const TestIds = {
  LOGIN_USERNAME: "login-username",
  LOGIN_PASSWORD: "login-password",
  LOGIN_SUBMIT: "login-submit",
  SIGNED_IN_HEADER: "signed-in-header",
  SIGN_OUT_BUTTON: "sign-out-button",
  LANDING_CTA_PRIMARY: "landing-cta-primary",
} as const;
