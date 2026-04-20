export class ApiError extends Error {
  readonly name = "ApiError";
  constructor(
    readonly status: number,
    message: string,
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
  if (init.body != null && !headers.has("Content-Type")) {
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
    const detail =
      body && typeof body === "object" && "detail" in body && typeof (body as { detail?: unknown }).detail === "string"
        ? (body as { detail: string }).detail
        : typeof body === "string" && body
          ? body
          : response.statusText;
    throw new ApiError(response.status, detail);
  }

  return body as T;
}
