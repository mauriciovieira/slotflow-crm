import type { APIRequestContext } from "@playwright/test";

export interface SeededInvite {
  email: string;
  raw_token: string;
  accept_url: string;
}

export async function seedInvite(
  request: APIRequestContext,
  payload: { email: string; status?: "pending" | "revoked"; expired?: boolean } = {
    email: "alice@x.com",
  },
): Promise<SeededInvite> {
  const response = await request.post("/api/test/_seed_invite/", { data: payload });
  if (!response.ok()) {
    throw new Error(
      `seedInvite failed: ${response.status()} ${await response.text()}`,
    );
  }
  return (await response.json()) as SeededInvite;
}
