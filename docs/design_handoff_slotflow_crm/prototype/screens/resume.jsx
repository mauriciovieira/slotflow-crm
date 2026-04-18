/* global React, OPPORTUNITIES, COMPANIES */
const { useState } = React;

function Resume() {
  const Icons = window.Icons;
  const { CompanyAvatar } = window;
  const [selectedOpp, setSelectedOpp] = useState("opp_01");
  const opp = OPPORTUNITIES.find((o) => o.id === selectedOpp);
  const c = COMPANIES[opp.company];

  const variants = [
    { id: "base", name: "Base — Senior product eng", edits: 0, selected: false },
    { id: "tailored", name: `Tailored — ${c.name}`, edits: 7, selected: true },
  ];

  return (
    <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="row gap-12">
        <h1 className="t-page-title" style={{ margin: 0 }}>Resume Studio</h1>
        <span className="chip chip-purple"><Icons.Sparkle className="i-sm"/> AI-assisted</span>
      </div>
      <p className="t-body" style={{ margin: 0, color: "var(--color-text-muted)" }}>
        Start from a base resume and let Slotflow tailor bullets, keywords, and order for each opportunity.
      </p>

      <div style={{ display: "grid", gridTemplateColumns: "320px 1fr", gap: 16 }}>
        <div className="col gap-12">
          <div className="card" style={{ padding: 14 }}>
            <div className="t-label-up muted" style={{ marginBottom: 10 }}>Tailor for</div>
            <select className="input" value={selectedOpp} onChange={(e)=>setSelectedOpp(e.target.value)}>
              {OPPORTUNITIES.filter(o=>o.stage!=="rejected").map((o) => (
                <option key={o.id} value={o.id}>{COMPANIES[o.company].name} — {o.role}</option>
              ))}
            </select>
            <div className="row gap-8" style={{ marginTop: 12 }}>
              <CompanyAvatar company={opp.company} size={26}/>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="t-body-med" style={{ fontSize: 13 }}>{c.name}</div>
                <div className="t-mono-micro muted">{opp.slug}</div>
              </div>
            </div>
          </div>

          <div className="card" style={{ padding: 14 }}>
            <div className="t-label-up muted" style={{ marginBottom: 10 }}>Variants</div>
            {variants.map((v) => (
              <div key={v.id} style={{
                padding: "10px 12px", borderRadius: 8, marginBottom: 6,
                background: v.selected ? "var(--color-brand-light)" : "var(--color-panel)",
                border: v.selected ? "1px solid var(--color-brand)" : "1px solid var(--color-border-subtle)",
                cursor: "pointer",
              }}>
                <div className="row gap-6">
                  <Icons.File className="i-sm"/>
                  <span className="t-body-med" style={{ fontSize: 13 }}>{v.name}</span>
                </div>
                <div className="t-caption" style={{ marginTop: 4 }}>
                  {v.edits === 0 ? "Original" : `${v.edits} AI edits`}
                </div>
              </div>
            ))}
            <button className="btn btn-ghost btn-sm" style={{ width: "100%", justifyContent: "center", marginTop: 6 }}>
              <Icons.Plus/> New variant
            </button>
          </div>

          <div className="panel" style={{ padding: 14 }}>
            <div className="t-label-up" style={{ color: "var(--color-purple)", marginBottom: 10 }}>
              <Icons.Sparkle className="i-sm" style={{ display: "inline", verticalAlign: -2 }}/> Keyword match
            </div>
            <div style={{ fontSize: 32, fontWeight: 600, letterSpacing: "-0.64px", lineHeight: 1 }}>
              {opp.fit}<span style={{ fontSize: 16, color: "var(--color-text-muted)", marginLeft: 4 }}>/100</span>
            </div>
            <div className="progress" style={{ marginTop: 10 }}>
              <div className="progress-bar" style={{ width: `${opp.fit}%` }}/>
            </div>
            <div className="col gap-6" style={{ marginTop: 14 }}>
              {[
                { k: "React 19 / RSC", hit: true },
                { k: "Design tokens", hit: true },
                { k: "Payments UX", hit: true },
                { k: "a11y WCAG 2.2", hit: false },
              ].map((k) => (
                <div key={k.k} className="row gap-8">
                  {k.hit
                    ? <Icons.Check className="i-sm" style={{ color: "var(--color-brand-deep)" }}/>
                    : <span style={{ width: 14, height: 14, borderRadius: 9999, border: "1.5px solid var(--color-border-strong)" }}/>}
                  <span className="t-cell" style={{ color: k.hit ? "var(--color-text-primary)" : "var(--color-text-muted)" }}>{k.k}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="card" style={{ padding: 0, overflow: "hidden" }}>
          <div className="row gap-8" style={{ padding: "12px 16px", borderBottom: "1px solid var(--color-border-subtle)", background: "var(--color-panel)" }}>
            <span className="t-label-up muted">Preview · tailored for {c.name}</span>
            <div className="ml-auto row gap-6">
              <button className="btn btn-ghost btn-sm">Diff base</button>
              <button className="btn btn-ghost btn-sm">Export PDF</button>
              <button className="btn btn-brand btn-sm">Apply to opportunity</button>
            </div>
          </div>
          <div style={{ padding: "32px 40px", maxWidth: 720, margin: "0 auto", fontFamily: "Inter, system-ui" }}>
            <div style={{ fontSize: 26, fontWeight: 600, letterSpacing: "-0.52px" }}>Rafael Torres</div>
            <div className="t-caption" style={{ marginTop: 4 }}>Senior Frontend Engineer · São Paulo (remote) · rafael@torres.dev · /in/rafaeltorres</div>

            <div style={{ marginTop: 24 }}>
              <div className="t-label-up muted" style={{ marginBottom: 6 }}>Summary</div>
              <p className="t-body" style={{ margin: 0, color: "var(--color-text-secondary)" }}>
                9 years shipping dense, high-traffic product UI.
                Led <mark style={{ background: "var(--color-brand-light)", color: "var(--color-brand-deep)", padding: "0 3px", borderRadius: 3 }}>payments checkout rewrites</mark> handling $2.1B annualized,
                and design-system platforms used by 80+ engineers.
                Comfortable across <mark style={{ background: "var(--color-brand-light)", color: "var(--color-brand-deep)", padding: "0 3px", borderRadius: 3 }}>React 19 / RSC</mark>, performance budgets, and cross-team API design.
              </p>
            </div>

            <div style={{ marginTop: 24 }}>
              <div className="t-label-up muted" style={{ marginBottom: 10 }}>Experience</div>
              {[
                { r: "Staff Engineer", co: "Nubank", t: "2023 — Present",
                  b: ["Shipped checkout refactor cutting p95 TTI 44% on mid-tier Androids.",
                      "Owned payments UI platform: 40+ shared components, 99.99% SLA."] },
                { r: "Senior Engineer", co: "iFood", t: "2020 — 2023",
                  b: ["Built unified design tokens pipeline adopted by 3 product orgs.",
                      "Led a11y audit, closed 86% of critical issues over 2 quarters."] },
              ].map((e) => (
                <div key={e.co} style={{ marginBottom: 18 }}>
                  <div className="row gap-8">
                    <span className="t-body-med">{e.r}, {e.co}</span>
                    <span className="t-caption ml-auto">{e.t}</span>
                  </div>
                  <ul style={{ margin: "6px 0 0", paddingLeft: 18 }} className="t-body">
                    {e.b.map((line, i) => (
                      <li key={i} style={{ color: "var(--color-text-secondary)", marginBottom: 3 }}>
                        {i === 0 && (<span style={{ background: "rgba(122,90,248,0.12)", color: "var(--color-purple)", padding: "0 3px", borderRadius: 3, marginRight: 4 }} title="AI-tailored">
                          AI
                        </span>)}
                        {line}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

window.Resume = Resume;
