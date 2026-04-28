import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface NotificationRow {
  id: string;
  kind: string;
  payload: Record<string, unknown>;
  workspace: string | null;
  read_at: string | null;
  created_at: string;
}

export interface NotificationListPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: NotificationRow[];
}

export const NOTIFICATIONS_KEY = ["notifications", "list"] as const;
export const NOTIFICATIONS_UNREAD_COUNT_KEY = [
  "notifications",
  "unread-count",
] as const;

export function useNotifications(opts?: { enabled?: boolean }) {
  return useQuery({
    queryKey: NOTIFICATIONS_KEY,
    queryFn: () => apiFetch<NotificationListPage>("/api/notifications/"),
    // Caller-gated so the bell can defer the list fetch until the
    // panel is opened — steady-state cost stays at the unread-count
    // poll alone.
    enabled: opts?.enabled ?? true,
  });
}

export function useUnreadNotificationCount() {
  return useQuery({
    queryKey: NOTIFICATIONS_UNREAD_COUNT_KEY,
    queryFn: () =>
      apiFetch<{ count: number }>("/api/notifications/unread-count/"),
    // Bell badge polls so a notification raised by another user shows
    // up without a manual reload. 30s strikes a balance between
    // freshness and request volume.
    refetchInterval: 30_000,
    refetchIntervalInBackground: false,
  });
}

export function useMarkNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: (ids: string[]) =>
      apiFetch<{ marked: number }>("/api/notifications/mark-read/", {
        method: "POST",
        body: JSON.stringify({ ids }),
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
        qc.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_COUNT_KEY }),
      ]);
    },
  });
}

export function useMarkAllNotificationsRead() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: () =>
      apiFetch<{ marked: number }>("/api/notifications/mark-all-read/", {
        method: "POST",
      }),
    onSuccess: async () => {
      await Promise.all([
        qc.invalidateQueries({ queryKey: NOTIFICATIONS_KEY }),
        qc.invalidateQueries({ queryKey: NOTIFICATIONS_UNREAD_COUNT_KEY }),
      ]);
    },
  });
}
