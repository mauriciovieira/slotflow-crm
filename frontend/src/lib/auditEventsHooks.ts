import { useInfiniteQuery } from "@tanstack/react-query";
import { apiFetch } from "./api";

export interface AuditEvent {
  id: string;
  actor_repr: string;
  action: string;
  entity_type: string;
  entity_id: string;
  workspace: string | null;
  correlation_id: string;
  metadata: Record<string, unknown>;
  created_at: string;
}

export interface AuditEventPage {
  count: number;
  next: string | null;
  previous: string | null;
  results: AuditEvent[];
}

export interface AuditEventsArgs {
  workspaceId: string | undefined;
  action: string;
  entityType: string;
  entityId: string;
}

export const auditEventsKey = (args: AuditEventsArgs) =>
  [
    "audit-events",
    "list",
    args.workspaceId ?? "",
    args.action,
    args.entityType,
    args.entityId,
  ] as const;

function buildPath(args: AuditEventsArgs, pageParam: string | null): string {
  // The DRF `next` URL is fully qualified; honor it verbatim so server-side
  // pagination drives the cursor. On the first page, build the query from
  // the active filters.
  if (pageParam) return pageParam;
  const params = new URLSearchParams({ workspace: args.workspaceId ?? "" });
  if (args.action) params.set("action", args.action);
  if (args.entityType) params.set("entity_type", args.entityType);
  if (args.entityId) params.set("entity_id", args.entityId);
  return `/api/audit-events/?${params.toString()}`;
}

export function useAuditEvents(args: AuditEventsArgs) {
  return useInfiniteQuery({
    queryKey: auditEventsKey(args),
    queryFn: ({ pageParam }) =>
      apiFetch<AuditEventPage>(buildPath(args, pageParam ?? null)),
    initialPageParam: null as string | null,
    getNextPageParam: (last) => last.next,
    enabled:
      typeof args.workspaceId === "string" && args.workspaceId.length > 0,
  });
}
