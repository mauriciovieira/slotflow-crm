import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface Me {
  authenticated: boolean;
  username: string | null;
  has_totp_device: boolean;
  is_verified: boolean;
}

export interface TotpSetupPayload {
  otpauth_uri: string;
  qr_svg: string;
  confirmed: boolean;
}

export const ME_KEY = ["auth", "me"] as const;
export const TOTP_SETUP_KEY = ["auth", "totp", "setup"] as const;

export function useMe() {
  return useQuery({
    queryKey: ME_KEY,
    queryFn: () => apiFetch<Me>("/api/auth/me/"),
    staleTime: 30_000,
  });
}

export function useLogin() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (input: { username: string; password: string }) =>
      apiFetch<Me>("/api/auth/login/", {
        method: "POST",
        body: JSON.stringify(input),
      }),
    onSuccess: (me) => {
      qc.setQueryData(ME_KEY, me);
    },
  });
}

export function useLogout() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () => apiFetch<null>("/api/auth/logout/", { method: "POST" }),
    onSuccess: () => {
      qc.setQueryData(ME_KEY, {
        authenticated: false,
        username: null,
        has_totp_device: false,
        is_verified: false,
      } satisfies Me);
      qc.invalidateQueries({ queryKey: TOTP_SETUP_KEY });
    },
  });
}

export function useTotpSetup() {
  return useQuery({
    queryKey: TOTP_SETUP_KEY,
    queryFn: () => apiFetch<TotpSetupPayload>("/api/auth/2fa/setup/"),
    staleTime: Infinity,
  });
}

export function useConfirmTotp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch<Me>("/api/auth/2fa/confirm/", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    onSuccess: (me) => {
      qc.setQueryData(ME_KEY, me);
      qc.invalidateQueries({ queryKey: TOTP_SETUP_KEY });
    },
  });
}

export function useVerifyTotp() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (token: string) =>
      apiFetch<Me>("/api/auth/2fa/verify/", {
        method: "POST",
        body: JSON.stringify({ token }),
      }),
    onSuccess: (me) => {
      qc.setQueryData(ME_KEY, me);
    },
  });
}
