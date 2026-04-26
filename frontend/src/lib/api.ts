export class ApiError extends Error {
  readonly name = "ApiError";
  // `body` carries the parsed JSON response when available; the human-readable
  // `message` is a flattened summary, not raw JSON. Field-level error
  // rendering (e.g. DRF 422 with per-field arrays) should use `body`.
  constructor(
    readonly status: number,
    message: string,
    readonly body: unknown = null,
  ) {
    super(message);
  }
}

function readCookie(name: string): string | null {
  if (typeof document === "undefined") return null;
  const prefix = `${name}=`;
  const parts = document.cookie ? document.cookie.split("; ") : [];
  const match = parts.find((p) => p.startsWith(prefix));
  return match ? decodeURIComponent(match.slice(prefix.length)) : null;
}

export async function apiFetch<T>(path: string, init: RequestInit = {}): Promise<T> {
  const method = (init.method ?? "GET").toUpperCase();
  const headers = new Headers(init.headers);
  if (typeof init.body === "string" && !headers.has("Content-Type")) {
    headers.set("Content-Type", "application/json");
  }
  if (method !== "GET" && method !== "HEAD") {
    const csrf = readCookie("csrftoken");
    if (csrf) headers.set("X-CSRFToken", csrf);
  }

  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers,
  });

  if (response.status === 204) {
    if (!response.ok) throw new ApiError(response.status, response.statusText);
    return null as T;
  }

  const text = await response.text();
  const contentType = response.headers.get("Content-Type")?.toLowerCase() ?? "";
  const isJsonResponse =
    contentType.includes("application/json") || contentType.includes("+json");
  let body: unknown = null;

  if (text) {
    if (isJsonResponse) {
      try {
        body = JSON.parse(text) as unknown;
      } catch {
        body = text;
      }
    } else {
      body = text;
    }
  }

  if (!response.ok) {
    throw new ApiError(
      response.status,
      extractErrorMessage(body, response.statusText, isJsonResponse),
      isJsonResponse ? body : null,
    );
  }

  return body as T;
}

function flattenToString(value: unknown): string | null {
  if (typeof value === "string") {
    const trimmed = value.trim();
    return trimmed ? trimmed : null;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const s = flattenToString(item);
      if (s) return s;
    }
    return null;
  }
  return null;
}

/**
 * Pull a human-readable error message out of a DRF response body.
 *
 * DRF surfaces errors in three common shapes:
 *   - `{ "detail": "..." }` for permission/auth/throttle errors
 *   - `{ "non_field_errors": ["..."] }` from custom raise paths
 *   - `{ "<field>": ["..."], ... }` from `ValidationError` on individual fields
 *
 * Without this fan-out, validation errors fell back to `response.statusText`
 * (e.g. "Bad Request"), which is useless to the user. Prefer `detail`, then
 * `non_field_errors`, then the first field error; finally fall back to the
 * raw text body or HTTP status text.
 *
 * `isJsonResponse=false` means the body is not parseable JSON — typically a
 * Django DEBUG=True 500 page (a multi-thousand-character HTML traceback) or
 * a generic proxy error. Surfacing that raw text into the UI dumps the
 * entire traceback into whatever component renders the error string, so
 * for non-JSON bodies we ignore the body and fall back to the status text.
 */
function extractErrorMessage(
  body: unknown,
  statusText: string,
  isJsonResponse: boolean,
): string {
  if (typeof body === "string") {
    if (!isJsonResponse) return statusText;
    const trimmed = body.trim();
    if (trimmed) return trimmed;
  }

  if (body && typeof body === "object") {
    const obj = body as Record<string, unknown>;
    const detail = flattenToString(obj.detail);
    if (detail) return detail;
    const nonField = flattenToString(obj.non_field_errors);
    if (nonField) return nonField;
    for (const [key, value] of Object.entries(obj)) {
      const flat = flattenToString(value);
      if (flat) return `${key}: ${flat}`;
    }
  }

  return statusText;
}
