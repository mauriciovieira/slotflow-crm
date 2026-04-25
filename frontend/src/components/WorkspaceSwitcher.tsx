import { useActiveWorkspace, useSetActiveWorkspace } from "../lib/activeWorkspaceHooks";
import { TestIds } from "../testIds";

export function WorkspaceSwitcher() {
  const query = useActiveWorkspace();
  const setActive = useSetActiveWorkspace();

  const data = query.data;
  if (!data || data.available.length === 0) {
    return null;
  }

  if (data.available.length === 1) {
    const only = data.available[0];
    return (
      <span
        data-testid={TestIds.WORKSPACE_SWITCHER}
        className="text-sm text-ink-secondary"
      >
        <span className="text-ink-muted mr-1">in</span>
        <span data-testid={TestIds.WORKSPACE_SWITCHER_LABEL} className="text-ink font-medium">
          {only.name}
        </span>
      </span>
    );
  }

  const activeId = data.active?.id ?? "";

  return (
    <span data-testid={TestIds.WORKSPACE_SWITCHER} className="flex items-center gap-2">
      <span className="text-xs text-ink-muted">Workspace</span>
      <select
        data-testid={TestIds.WORKSPACE_SWITCHER_SELECT}
        value={activeId}
        disabled={setActive.isPending}
        onChange={(event) => {
          const next = event.target.value;
          if (next && next !== activeId) {
            setActive.mutate(next);
          }
        }}
        className="border border-border-subtle rounded-md px-2 py-1 text-sm bg-surface focus:outline-none focus:border-brand disabled:opacity-60"
      >
        {!activeId && (
          <option value="" disabled>
            Select a workspace…
          </option>
        )}
        {data.available.map((ws) => (
          <option key={ws.id} value={ws.id}>
            {ws.name}
          </option>
        ))}
      </select>
    </span>
  );
}
