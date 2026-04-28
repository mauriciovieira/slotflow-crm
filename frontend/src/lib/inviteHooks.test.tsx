import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { useAcceptPassword, useInvitePreflight, useOauthStart } from "./inviteHooks";

function wrap() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={qc}>{children}</QueryClientProvider>;
  }
  return Wrapper;
}

beforeEach(() => {
  vi.stubGlobal(
    "fetch",
    vi.fn(async (url: string) => {
      if (url.endsWith("/api/invites/abc/")) {
        return new Response(JSON.stringify({ email: "alice@x.com" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/invites/abc/accept-password/")) {
        return new Response(JSON.stringify({ next: "/2fa/setup" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      if (url.endsWith("/api/invites/abc/oauth-start/")) {
        return new Response(JSON.stringify({ redirect_url: "/accounts/google/login/" }), {
          status: 200,
          headers: { "Content-Type": "application/json" },
        });
      }
      return new Response("", { status: 404 });
    }),
  );
});
afterEach(() => vi.unstubAllGlobals());

describe("useInvitePreflight", () => {
  it("fetches preflight payload", async () => {
    const { result } = renderHook(() => useInvitePreflight("abc"), { wrapper: wrap() });
    await waitFor(() => expect(result.current.data?.email).toBe("alice@x.com"));
  });
});

describe("useAcceptPassword", () => {
  it("posts and resolves with next path", async () => {
    const { result } = renderHook(() => useAcceptPassword("abc"), { wrapper: wrap() });
    let value: { next: string } | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({
        password: "Sup3r-Secret-Pw!",
        workspace_name: "WS",
        terms_version_id: 1,
      });
    });
    expect(value?.next).toBe("/2fa/setup");
  });
});

describe("useOauthStart", () => {
  it("posts and resolves with redirect URL", async () => {
    const { result } = renderHook(() => useOauthStart("abc"), { wrapper: wrap() });
    let value: { redirect_url: string } | undefined;
    await act(async () => {
      value = await result.current.mutateAsync({
        provider: "google",
        workspace_name: "WS",
        terms_version_id: 1,
      });
    });
    expect(value?.redirect_url).toBe("/accounts/google/login/");
  });
});
