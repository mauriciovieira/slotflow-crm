import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { apiFetch, ApiError } from "./api";

function stubCookie(cookie: string) {
  Object.defineProperty(document, "cookie", {
    configurable: true,
    get: () => cookie,
  });
}

type FetchMock = ReturnType<typeof vi.fn>;

describe("apiFetch", () => {
  let fetchMock: FetchMock;

  beforeEach(() => {
    fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    stubCookie("");
  });
  afterEach(() => vi.unstubAllGlobals());

  function respond(status: number, body: unknown) {
    const hasBody = body != null && status !== 204;
    fetchMock.mockResolvedValueOnce(
      new Response(hasBody ? JSON.stringify(body) : null, {
        status,
        headers: hasBody ? { "Content-Type": "application/json" } : undefined,
      }),
    );
  }

  it("returns parsed JSON on 2xx", async () => {
    respond(200, { ok: true });
    const result = await apiFetch<{ ok: boolean }>("/api/auth/me/");
    expect(result).toEqual({ ok: true });
  });

  it("sends credentials and does not send CSRF on GET", async () => {
    respond(200, {});
    await apiFetch("/api/auth/me/");
    const [, init] = fetchMock.mock.calls[0];
    expect(init.credentials).toBe("include");
    expect(init.headers.get("X-CSRFToken")).toBeNull();
  });

  it("sends CSRF header from csrftoken cookie on POST", async () => {
    stubCookie("sessionid=abc; csrftoken=the-token; other=v");
    respond(200, {});
    await apiFetch("/api/auth/login/", {
      method: "POST",
      body: JSON.stringify({ username: "a", password: "b" }),
    });
    const [, init] = fetchMock.mock.calls[0];
    expect(init.headers.get("X-CSRFToken")).toBe("the-token");
    expect(init.headers.get("Content-Type")).toBe("application/json");
  });

  it("throws ApiError with detail on 4xx", async () => {
    respond(400, { detail: "Invalid credentials." });
    await expect(
      apiFetch("/api/auth/login/", { method: "POST", body: "{}" }),
    ).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      message: "Invalid credentials.",
    } satisfies Partial<ApiError>);
  });

  it("throws ApiError on 5xx even without body", async () => {
    respond(500, null);
    await expect(apiFetch("/api/auth/me/")).rejects.toBeInstanceOf(ApiError);
  });

  it("returns null for 204 No Content", async () => {
    respond(204, null);
    const result = await apiFetch<null>("/api/auth/logout/", { method: "POST" });
    expect(result).toBeNull();
  });
});
