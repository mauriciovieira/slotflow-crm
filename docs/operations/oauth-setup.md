# OAuth provider setup (Google + GitHub)

Slotflow uses django-allauth (`/accounts/<provider>/login/` + callback). Each environment needs its own client credentials registered in Django admin under `Sites and accounts → Social applications`.

## Google

1. Go to https://console.cloud.google.com/apis/credentials.
2. **Create credentials → OAuth client ID** → Application type **Web application**.
3. Authorized redirect URIs:
   - Local dev (browser hits Vite at :5173 which proxies `/accounts/...` to
     Django; Host header is preserved so allauth builds the callback against
     :5173): `http://localhost:5173/accounts/google/login/callback/`
   - Local dev (when hitting Django directly without Vite, e.g. running only
     `manage.py runserver`): `http://localhost:8000/accounts/google/login/callback/`
   - Staging: `https://staging.slotflow.app/accounts/google/login/callback/`
   - Production: `https://app.slotflow.app/accounts/google/login/callback/`
4. Copy the Client ID + Client Secret.
5. In Django admin, add a `Social application`:
   - Provider: `Google`
   - Name: `Google (env)`
   - Client id / Secret key: paste from step 4
   - Sites: select the matching `Site`
6. Verify by visiting `/accounts/google/login/` from a logged-out browser; you should land on Google's consent screen.

## GitHub

1. https://github.com/settings/developers → **New OAuth App**.
2. Authorization callback URL: same shape as Google but `/github/login/callback/`.
3. Generate a client secret. Copy ID + secret.
4. Add a Django `Social application` with provider `GitHub`.
5. Required scope is set in `SOCIALACCOUNT_PROVIDERS["github"]["SCOPE"]` already (`user:email`, `read:user`). The `read:user` scope is required so we can detect MFA via `GET /user`.

## Verifying MFA detection

- Google: an account with 2-Step Verification will return an ID token whose `amr` claim contains `"mfa"`. Confirm by signing in with such an account; the app should land on `/dashboard` rather than `/2fa/setup`.
- GitHub: with `read:user` granted, the `/user` endpoint exposes `two_factor_authentication: true` for accounts that have 2FA enabled. Same dashboard-vs-setup signal.

If MFA cannot be detected for a session, the user is redirected to `/2fa/setup` and follows the standard TOTP enrolment.
