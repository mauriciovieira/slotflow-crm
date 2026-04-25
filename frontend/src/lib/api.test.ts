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

  it("does not JSON.parse HTML error pages — surfaces ApiError with statusText", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("<html><body>Internal Server Error</body></html>", {
        status: 500,
        statusText: "Internal Server Error",
        headers: { "Content-Type": "text/html; charset=utf-8" },
      }),
    );
    await expect(apiFetch("/api/auth/me/")).rejects.toMatchObject({
      name: "ApiError",
      status: 500,
    });
  });

  it("extracts non_field_errors from a DRF validation 400", async () => {
    respond(400, {
      non_field_errors: ["This resume version is already linked to the opportunity with that role."],
    });
    await expect(apiFetch("/api/opportunity-resumes/", { method: "POST", body: "{}" }))
      .rejects.toMatchObject({
        name: "ApiError",
        status: 400,
        message: "This resume version is already linked to the opportunity with that role.",
      });
  });

  it("extracts a field error from a DRF validation 400 with a field-keyed list", async () => {
    respond(400, {
      resume_version: ["Resume version belongs to a different workspace than the opportunity."],
    });
    await expect(apiFetch("/api/opportunity-resumes/", { method: "POST", body: "{}" }))
      .rejects.toMatchObject({
        name: "ApiError",
        status: 400,
        message:
          "resume_version: Resume version belongs to a different workspace than the opportunity.",
      });
  });

  it("falls back to statusText when error body has no recognised shape", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response(JSON.stringify({ unexpected: 42 }), {
        status: 400,
        statusText: "Bad Request",
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(apiFetch("/api/x/")).rejects.toMatchObject({
      name: "ApiError",
      status: 400,
      message: "Bad Request",
    });
  });

  it("falls back to text when Content-Type claims JSON but body is not JSON", async () => {
    fetchMock.mockResolvedValueOnce(
      new Response("not { json", {
        status: 502,
        statusText: "Bad Gateway",
        headers: { "Content-Type": "application/json" },
      }),
    );
    await expect(apiFetch("/api/auth/me/")).rejects.toMatchObject({
      name: "ApiError",
      status: 502,
      message: "not { json",
    });
  });
});
