import lockup from "../assets/brand/lockup.svg";

export function Landing() {
  return (
    <main className="min-h-full flex flex-col">
      <header className="flex items-center justify-between px-6 py-4 border-b border-border-subtle">
        <img src={lockup} alt="Slotflow" height={22} />
        <nav className="flex items-center gap-4 text-ink-secondary">
          <a href="/login" className="text-ink-secondary hover:text-ink">
            Sign in
          </a>
          <a
            href="/signup"
            className="rounded-md bg-brand text-white px-3 py-1.5 text-sm font-medium hover:bg-brand-deep"
          >
            Get started
          </a>
        </nav>
      </header>
      <section className="flex-1 flex flex-col items-center justify-center px-6 text-center">
        <h1 className="text-display-hero text-ink max-w-3xl">
          A CRM for the job hunt that doesn&apos;t forget the follow-up.
        </h1>
        <p className="mt-4 text-body-lg text-ink-secondary max-w-xl">
          Track opportunities, pipelines, and recruiter conversations with a system built for
          senior engineers running their own hunt.
        </p>
      </section>
    </main>
  );
}
