import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { MemoryRouter, Route, Routes } from "react-router";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TestIds } from "../testIds";
import { AcceptSignupInvitation } from "./AcceptSignupInvitation";

function renderAt(path: string) {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={qc}>
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/accept-invite/:token" element={<AcceptSignupInvitation />} />
        </Routes>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

beforeEach(() => {
  vi.stubGlobal("fetch", vi.fn());
});
afterEach(() => vi.unstubAllGlobals());

function mockResponse(status: number, body: unknown) {
  (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce(
    new Response(JSON.stringify(body), {
      status,
      headers: { "Content-Type": "application/json" },
    }),
  );
}

function preflightOnce() {
  mockResponse(200, {
    email: "alice@x.com",
    expires_at: "2030-01-01T00:00:00Z",
    providers: ["google", "github"],
    terms_version: { id: 7, version: "1.0", body_markdown: "# ToS\n\nLorem ipsum.\n" },
  });
}

describe("AcceptSignupInvitation preflight states", () => {
  it("renders the form when preflight returns 200", async () => {
    preflightOnce();
    renderAt("/accept-invite/tok123");
    expect(await screen.findByTestId(TestIds.SIGNUP_INVITATION_PAGE)).toBeInTheDocument();
    expect(screen.getByTestId(TestIds.SIGNUP_INVITATION_EMAIL)).toHaveTextContent("alice@x.com");
  });

  it("renders invalid screen on 404", async () => {
    mockResponse(404, { error: "invalid_token" });
    renderAt("/accept-invite/bogus");
    expect(await screen.findByTestId(TestIds.SIGNUP_INVITATION_INVALID)).toBeInTheDocument();
  });

  it("renders expired screen on 410 expired", async () => {
    mockResponse(410, { error: "expired", expires_at: "2020-01-01T00:00:00Z" });
    renderAt("/accept-invite/expired");
    expect(await screen.findByTestId(TestIds.SIGNUP_INVITATION_EXPIRED)).toBeInTheDocument();
  });

  it("renders revoked screen on 410 revoked", async () => {
    mockResponse(410, { error: "revoked" });
    renderAt("/accept-invite/rev");
    expect(await screen.findByTestId(TestIds.SIGNUP_INVITATION_REVOKED)).toBeInTheDocument();
  });

  it("renders already-used screen on 410 already_used", async () => {
    mockResponse(410, { error: "already_used" });
    renderAt("/accept-invite/used");
    expect(await screen.findByTestId(TestIds.SIGNUP_INVITATION_ALREADY_USED)).toBeInTheDocument();
  });
});

describe("AcceptSignupInvitation form", () => {
  it("defaults workspace name to '<local>'s workspace'", async () => {
    preflightOnce();
    renderAt("/accept-invite/tok");
    const ws = (await screen.findByTestId(
      TestIds.SIGNUP_INVITATION_WORKSPACE,
    )) as HTMLInputElement;
    expect(ws.value).toBe("alice's workspace");
  });

  it("disables submit until ToS scrolled and submits payload to accept-password", async () => {
    preflightOnce();
    mockResponse(200, { next: "/2fa/setup" });

    renderAt("/accept-invite/tok");
    const submit = await screen.findByTestId<HTMLButtonElement>(
      TestIds.SIGNUP_INVITATION_SUBMIT,
    );
    expect(submit).toBeDisabled();

    const scroll = screen.getByTestId(TestIds.SIGNUP_INVITATION_TOS_SCROLL);
    Object.defineProperty(scroll, "scrollHeight", {
      configurable: true,
      value: 200,
    });
    Object.defineProperty(scroll, "clientHeight", {
      configurable: true,
      value: 100,
    });
    Object.defineProperty(scroll, "scrollTop", {
      configurable: true,
      writable: true,
      value: 0,
    });
    fireEvent.scroll(scroll, { target: { scrollTop: 100 } });

    const checkbox = screen.getByTestId<HTMLInputElement>(
      TestIds.SIGNUP_INVITATION_TOS_CHECKBOX,
    );
    await waitFor(() => expect(checkbox).not.toBeDisabled());

    const user = userEvent.setup();
    await user.click(checkbox);
    await user.type(
      screen.getByTestId(TestIds.SIGNUP_INVITATION_PASSWORD),
      "Sup3r-Secret-Pw!",
    );

    await waitFor(() => expect(submit).not.toBeDisabled());
    await user.click(submit);

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const post = calls.find((c) => String(c[0]).endsWith("/accept-password/"));
      expect(post).toBeDefined();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body).toEqual({
        password: "Sup3r-Secret-Pw!",
        workspace_name: "alice's workspace",
        terms_version_id: 7,
      });
    });
  });

  it("auto-enables ToS checkbox if body shorter than container", async () => {
    preflightOnce();
    renderAt("/accept-invite/tok");
    const scroll = await screen.findByTestId(TestIds.SIGNUP_INVITATION_TOS_SCROLL);
    Object.defineProperty(scroll, "scrollHeight", {
      configurable: true,
      value: 50,
    });
    Object.defineProperty(scroll, "clientHeight", {
      configurable: true,
      value: 100,
    });
    fireEvent.scroll(scroll);
    const checkbox = screen.getByTestId<HTMLInputElement>(
      TestIds.SIGNUP_INVITATION_TOS_CHECKBOX,
    );
    await waitFor(() => expect(checkbox).not.toBeDisabled());
  });
});

describe("AcceptSignupInvitation OAuth + banners", () => {
  it("renders email_mismatch banner from query string", async () => {
    preflightOnce();
    renderAt("/accept-invite/tok?error=email_mismatch");
    const banner = await screen.findByTestId(TestIds.SIGNUP_INVITATION_ERROR_BANNER);
    expect(banner).toHaveTextContent(/oauth email did not match/i);
  });

  it("renders user_exists banner from query string", async () => {
    preflightOnce();
    renderAt("/accept-invite/tok?error=user_exists");
    const banner = await screen.findByTestId(TestIds.SIGNUP_INVITATION_ERROR_BANNER);
    expect(banner).toHaveTextContent(/account already exists/i);
  });

  it("renders oauth_failed banner from query string", async () => {
    preflightOnce();
    renderAt("/accept-invite/tok?error=oauth_failed");
    const banner = await screen.findByTestId(TestIds.SIGNUP_INVITATION_ERROR_BANNER);
    expect(banner).toHaveTextContent(/sign-in cancelled or failed/i);
  });

  it("clicking Continue with Google calls oauth-start and assigns the same-origin redirect_url", async () => {
    preflightOnce();
    mockResponse(200, { redirect_url: "/accounts/google/login/" });

    // Stub window.location.href so the navigation is observable in jsdom.
    const original = window.location;
    let assigned: string | null = null;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...original,
        get href() {
          return assigned ?? original.href;
        },
        set href(v: string) {
          assigned = v;
        },
      },
    });

    renderAt("/accept-invite/tok");

    const scroll = await screen.findByTestId(TestIds.SIGNUP_INVITATION_TOS_SCROLL);
    Object.defineProperty(scroll, "scrollHeight", { configurable: true, value: 50 });
    Object.defineProperty(scroll, "clientHeight", { configurable: true, value: 100 });
    fireEvent.scroll(scroll);

    const checkbox = screen.getByTestId<HTMLInputElement>(
      TestIds.SIGNUP_INVITATION_TOS_CHECKBOX,
    );
    await waitFor(() => expect(checkbox).not.toBeDisabled());

    const user = userEvent.setup();
    await user.click(checkbox);

    const google = screen.getByTestId<HTMLButtonElement>(TestIds.SIGNUP_INVITATION_GOOGLE);
    await waitFor(() => expect(google).not.toBeDisabled());
    await user.click(google);

    await waitFor(() => {
      const calls = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls;
      const post = calls.find((c) => String(c[0]).endsWith("/oauth-start/"));
      expect(post).toBeDefined();
      const body = JSON.parse((post![1] as RequestInit).body as string);
      expect(body).toEqual({
        provider: "google",
        workspace_name: "alice's workspace",
        terms_version_id: 7,
      });
    });
    await waitFor(() => expect(assigned).toBe("/accounts/google/login/"));

    Object.defineProperty(window, "location", {
      configurable: true,
      value: original,
    });
  });

  it("rejects a non-same-origin redirect_url from oauth-start", async () => {
    preflightOnce();
    mockResponse(200, { redirect_url: "//evil.com/steal" });

    const original = window.location;
    let assigned: string | null = null;
    Object.defineProperty(window, "location", {
      configurable: true,
      value: {
        ...original,
        get href() {
          return assigned ?? original.href;
        },
        set href(v: string) {
          assigned = v;
        },
      },
    });

    renderAt("/accept-invite/tok");

    const scroll = await screen.findByTestId(TestIds.SIGNUP_INVITATION_TOS_SCROLL);
    Object.defineProperty(scroll, "scrollHeight", { configurable: true, value: 50 });
    Object.defineProperty(scroll, "clientHeight", { configurable: true, value: 100 });
    fireEvent.scroll(scroll);

    const checkbox = screen.getByTestId<HTMLInputElement>(
      TestIds.SIGNUP_INVITATION_TOS_CHECKBOX,
    );
    await waitFor(() => expect(checkbox).not.toBeDisabled());

    const user = userEvent.setup();
    await user.click(checkbox);
    await user.click(screen.getByTestId(TestIds.SIGNUP_INVITATION_GITHUB));

    await waitFor(() => {
      expect(screen.getAllByTestId(TestIds.SIGNUP_INVITATION_FIELD_ERROR).length).toBeGreaterThan(0);
    });
    expect(assigned).toBeNull();

    Object.defineProperty(window, "location", {
      configurable: true,
      value: original,
    });
  });
});
