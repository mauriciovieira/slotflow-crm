import { useQuery } from "@tanstack/react-query";
import { ApiError, apiFetch } from "./api";

export interface CompensationLineItem {
  opportunity_id: string;
  title: string;
  company: string;
  stage: string;
  source_amount: string;
  source_currency: string;
  converted_amount: string;
}

export interface SkippedOpportunity {
  opportunity_id: string;
  title: string;
  company: string;
  reason: "missing-comp-fields" | "fx-rate-missing" | string;
}

export interface CompensationSnapshot {
  workspace_id: string;
  target_currency: string;
  date: string;
  total: string;
  line_items: CompensationLineItem[];
  skipped: SkippedOpportunity[];
}

export interface CompensationSnapshotArgs {
  workspaceId: string | undefined;
  currency: string;
  date: string;
}

export const compensationSnapshotKey = (args: CompensationSnapshotArgs) =>
  [
    "insights",
    "compensation-snapshot",
    args.workspaceId ?? "",
    args.currency,
    args.date,
  ] as const;

export function useCompensationSnapshot(args: CompensationSnapshotArgs) {
  return useQuery({
    queryKey: compensationSnapshotKey(args),
    queryFn: () => {
      const params = new URLSearchParams({
        workspace: args.workspaceId ?? "",
        currency: args.currency,
        date: args.date,
      });
      return apiFetch<CompensationSnapshot>(
        `/api/insights/compensation-snapshot/?${params.toString()}`,
      );
    },
    // Don't fire while the active workspace is still loading; the screen
    // surfaces its own placeholder. An unscoped fetch would also fail
    // server-side with 400 (workspace required).
    enabled: typeof args.workspaceId === "string" && args.workspaceId.length > 0,
  });
}

export function isNotFound(error: unknown): boolean {
  return error instanceof ApiError && error.status === 404;
}
