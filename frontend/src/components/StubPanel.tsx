import { TestIds } from "../testIds";

export function StubPanel() {
  return (
    <section
      data-testid={TestIds.STUB_PANEL}
      className="px-8 py-20 max-w-3xl mx-auto text-center"
    >
      <p className="font-mono text-xs uppercase tracking-wider text-ink-muted mb-3">
        Coming soon
      </p>
      <p className="text-body-lg text-ink-secondary">
        This surface is wired up; the screen itself lands in a later PR.
      </p>
    </section>
  );
}
