/* global React */
const { useState } = React;

function Landing({ goLogin }) {
  const Icons = window.Icons;
  const { Lockup, Logomark } = window;
  return (
    <div className="marketing-bg" style={{ minHeight: "100%", display: "flex", flexDirection: "column" }}>
      {/* Nav */}
      <header style={{ padding: "20px 48px", display: "flex", alignItems: "center" }}>
        <Lockup size={20}/>
        <nav className="row gap-24" style={{ marginLeft: 48 }}>
          {["Product","Pricing","Changelog","Docs"].map(l => (
            <a key={l} className="t-body-med muted" href="#" style={{ fontSize: 14 }}>{l}</a>
          ))}
        </nav>
        <div className="ml-auto row gap-8">
          <button className="btn btn-ghost btn-sm" onClick={goLogin}>Sign in</button>
          <button className="btn btn-brand btn-sm" onClick={goLogin}>Get started</button>
        </div>
      </header>

      {/* Hero */}
      <section style={{ padding: "64px 48px 80px", maxWidth: 1120, margin: "0 auto", width: "100%" }}>
        <span className="chip chip-mint" style={{ marginBottom: 20 }}>
          <span className="badge-dot" style={{ background: "var(--color-brand)" }}/>
          New · AI drafts for recruiter replies
        </span>
        <h1 className="t-display" style={{ margin: 0, maxWidth: 780 }}>
          A CRM for the job hunt that doesn't{" "}
          <span style={{ color: "var(--color-brand-deep)" }}>forget the follow-up.</span>
        </h1>
        <p className="t-body-lg" style={{ color: "var(--color-text-secondary)", maxWidth: 620, marginTop: 16 }}>
          Track opportunities, run interviews, and tailor resumes — in one surface built for senior engineers applying to foreign companies.
        </p>
        <div className="row gap-8" style={{ marginTop: 24 }}>
          <button className="btn btn-brand" onClick={goLogin}>Start free <Icons.ChevronR/></button>
          <button className="btn btn-ghost">See the demo</button>
        </div>

        {/* Preview card */}
        <div style={{ marginTop: 56, position: "relative" }}>
          <div className="preview-frame">
            <div className="preview-chrome">
              <span className="preview-dot"/><span className="preview-dot"/><span className="preview-dot"/>
              <span className="t-mono-micro muted" style={{ marginLeft: 10 }}>slotflow.app / pipeline</span>
            </div>
            <div style={{ padding: 20, display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 10 }}>
              {["Applied","Screening","Interview","Offer"].map((st, i) => (
                <div key={st} style={{ background: "var(--color-panel)", borderRadius: 10, padding: 10, border: "1px solid var(--color-border-subtle)" }}>
                  <div className="row gap-6" style={{ marginBottom: 10 }}>
                    <span className="badge-dot" style={{ background: ["#888","#3772cf","#14C98B","#0a8f62"][i], width: 7, height: 7 }}/>
                    <span className="t-label-up" style={{ fontSize: 10 }}>{st}</span>
                    <span className="t-mono-micro ml-auto muted">{[4,3,4,1][i]}</span>
                  </div>
                  {[1,2].map((n) => (
                    <div key={n} style={{ background: "var(--color-card)", border: "1px solid var(--color-border-subtle)", borderRadius: 8, padding: 10, marginBottom: 6 }}>
                      <div style={{ fontSize: 11, fontWeight: 500 }}>{["Stripe","Figma","Linear","OpenAI"][i]}</div>
                      <div className="t-mono-micro muted" style={{ marginTop: 4 }}>{["SR-FE","STAFF-DS","SR-PE","MTS-APP"][i]}-0{n}</div>
                    </div>
                  ))}
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section style={{ padding: "48px 48px 96px", maxWidth: 1120, margin: "0 auto", width: "100%" }}>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 14 }}>
          {[
            { i: Icons.Kanban, t: "Pipeline that actually moves", d: "Drag cards across Applied → Offer. Every move logs itself. No forgotten applications." },
            { i: Icons.Mail, t: "Inbox with context", d: "Every message is tied to its opportunity. AI drafts replies in your voice, flagged for review." },
            { i: Icons.Sparkle, t: "Tailor without starting over", d: "Keep one base resume. Generate tailored variants per role with diff view and keyword match." },
          ].map((f) => (
            <div key={f.t} className="card">
              <div style={{ width: 36, height: 36, borderRadius: 8, background: "var(--color-brand-light)",
                color: "var(--color-brand-deep)", display: "inline-flex", alignItems: "center", justifyContent: "center", marginBottom: 14 }}>
                <f.i className="i-lg"/>
              </div>
              <div className="t-sub" style={{ marginBottom: 6 }}>{f.t}</div>
              <div className="t-body" style={{ color: "var(--color-text-secondary)" }}>{f.d}</div>
            </div>
          ))}
        </div>
      </section>

      <footer style={{ padding: "24px 48px", borderTop: "1px solid var(--color-border-subtle)", display: "flex", alignItems: "center" }}>
        <Lockup size={16}/>
        <span className="t-caption ml-auto">© 2026 Slotflow · Built for senior engineers.</span>
      </footer>
    </div>
  );
}

function Login({ goApp, goLanding }) {
  const Icons = window.Icons;
  const { Lockup, Logomark } = window;
  return (
    <div className="marketing-bg" style={{ minHeight: "100%", display: "grid", gridTemplateColumns: "1fr 1fr" }}>
      <div style={{ padding: "40px 48px", display: "flex", flexDirection: "column" }}>
        <button onClick={goLanding} style={{ alignSelf: "flex-start" }}><Lockup size={20}/></button>
        <div style={{ margin: "auto 0", maxWidth: 420 }}>
          <h1 className="t-page-title" style={{ margin: 0, fontSize: 32, letterSpacing: "-0.64px" }}>Welcome back</h1>
          <p className="t-body" style={{ color: "var(--color-text-muted)", marginTop: 8 }}>Sign in to your Slotflow workspace.</p>

          <div className="col gap-10" style={{ marginTop: 24 }}>
            <button className="btn btn-ghost" style={{ justifyContent: "center", height: 40 }}>
              <span style={{ width: 16, height: 16, background: "#fff", borderRadius: 3, display: "inline-flex", alignItems:"center", justifyContent:"center", fontWeight:700, fontSize:11, color:"#4285F4" }}>G</span>
              Continue with Google
            </button>
            <button className="btn btn-ghost" style={{ justifyContent: "center", height: 40 }}>
              <svg width="14" height="14" viewBox="0 0 16 16" fill="currentColor"><path d="M8 .2C3.6.2 0 3.8 0 8.2c0 3.5 2.3 6.5 5.5 7.6.4.1.5-.2.5-.4V14c-2.2.5-2.7-1-2.7-1-.4-1-.9-1.2-.9-1.2-.7-.5.1-.5.1-.5.8.1 1.2.8 1.2.8.7 1.2 1.9.9 2.4.7.1-.5.3-.9.5-1.1-1.8-.2-3.7-.9-3.7-4 0-.9.3-1.6.8-2.2-.1-.2-.4-1 .1-2.1 0 0 .7-.2 2.2.8.6-.2 1.3-.3 2-.3.7 0 1.4.1 2 .3 1.5-1 2.2-.8 2.2-.8.4 1.1.2 1.9.1 2.1.5.6.8 1.3.8 2.2 0 3.1-1.9 3.8-3.7 4 .3.3.6.8.6 1.5v2.3c0 .2.1.5.6.4C13.7 14.7 16 11.7 16 8.2 16 3.8 12.4.2 8 .2z"/></svg>
              Continue with GitHub
            </button>
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, margin: "20px 0" }}>
            <hr className="divider" style={{ flex: 1 }}/>
            <span className="t-caption">or</span>
            <hr className="divider" style={{ flex: 1 }}/>
          </div>

          <div className="col gap-10">
            <div>
              <label className="t-label-up muted" style={{ display: "block", marginBottom: 6 }}>Email</label>
              <input className="input" placeholder="you@company.com" defaultValue="rafael@torres.dev"/>
            </div>
            <div>
              <div className="row" style={{ marginBottom: 6 }}>
                <label className="t-label-up muted">Password</label>
                <a href="#" className="t-link ml-auto" style={{ color: "var(--color-brand-deep)" }}>Forgot?</a>
              </div>
              <input className="input" type="password" placeholder="••••••••" defaultValue="•••••••••"/>
            </div>
            <button className="btn btn-brand" style={{ justifyContent: "center", height: 40, marginTop: 4 }} onClick={goApp}>
              Sign in
            </button>
          </div>
          <div className="t-caption" style={{ marginTop: 16, textAlign: "center" }}>
            No account yet? <a href="#" style={{ color: "var(--color-brand-deep)", fontWeight: 500 }}>Start free</a>
          </div>
        </div>
        <div className="t-caption" style={{ color: "var(--color-text-placeholder)" }}>© 2026 Slotflow</div>
      </div>

      {/* Right artwork */}
      <div style={{ padding: 40, display: "flex", alignItems: "center", justifyContent: "center",
        background: "linear-gradient(180deg, rgba(20,201,139,0.12), rgba(20,201,139,0.02))",
        borderLeft: "1px solid var(--color-border-subtle)"
      }}>
        <div className="card" style={{ width: "100%", maxWidth: 460, padding: 0, overflow: "hidden" }}>
          <div className="preview-chrome">
            <span className="preview-dot"/><span className="preview-dot"/><span className="preview-dot"/>
          </div>
          <div style={{ padding: 20 }}>
            <div className="t-label-up muted" style={{ marginBottom: 10 }}>Today · next action</div>
            <div className="panel" style={{ padding: 14, marginBottom: 14 }}>
              <div className="row gap-10">
                <span className="avatar avatar-logo" style={{ width: 32, height: 32, fontSize: 13 }}>O</span>
                <div>
                  <div className="t-body-med">Onsite — OpenAI</div>
                  <div className="t-mono-micro muted">OPENAI-MTS-APP-002 · Fri Apr 25</div>
                </div>
                <span className="badge chip-mint ml-auto">INTERVIEW</span>
              </div>
            </div>
            <div className="pipeline-steps" style={{ flexWrap: "wrap" }}>
              {["Applied","Screening","Interview","Offer"].map((s,i)=>(
                <div key={s} className={`pipeline-step ${i<2?"done":""} ${i===2?"active":""}`}>
                  {i<2 ? <Icons.Check className="i-sm"/> : <span className="badge-dot" style={{ background: i===2?"var(--color-brand)":"var(--color-border-strong)", width: 8, height: 8 }}/>}
                  {s}
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function Settings() {
  const Icons = window.Icons;
  const sections = [
    { key: "profile", label: "Profile" },
    { key: "workspace", label: "Workspace" },
    { key: "appearance", label: "Appearance" },
    { key: "integrations", label: "Integrations" },
    { key: "billing", label: "Billing" },
    { key: "danger", label: "Danger zone" },
  ];
  const [active, setActive] = useState("appearance");
  const [themePref, setThemePref] = useState("auto");

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1080, width: "100%", margin: "0 auto" }}>
      <h1 className="t-page-title" style={{ margin: "0 0 20px" }}>Settings</h1>
      <div style={{ display: "grid", gridTemplateColumns: "200px 1fr", gap: 24 }}>
        <div className="col gap-4">
          {sections.map(s => (
            <button key={s.key} className={`nav-item ${active===s.key?"active":""}`} onClick={()=>setActive(s.key)}>
              {s.label}
            </button>
          ))}
        </div>
        <div className="col gap-16">
          {active === "appearance" && <>
            <div className="card">
              <div className="t-sub" style={{ marginBottom: 4 }}>Theme</div>
              <div className="t-body muted" style={{ marginBottom: 16 }}>Auto follows your OS preference and time of day.</div>
              <div className="seg">
                {[{k:"light",l:"Light",i:Icons.Sun},{k:"auto",l:"Auto",i:Icons.Sparkle},{k:"dark",l:"Dark",i:Icons.Moon}].map(t => (
                  <button key={t.k} className={`seg-btn ${themePref===t.k?"active":""}`} onClick={()=>setThemePref(t.k)}>
                    <t.i className="i-sm" style={{ display:"inline", verticalAlign:-2, marginRight:6 }}/>{t.l}
                  </button>
                ))}
              </div>
            </div>
            <div className="card">
              <div className="t-sub" style={{ marginBottom: 4 }}>Density</div>
              <div className="t-body muted" style={{ marginBottom: 16 }}>Affects tables, cards, and list surfaces.</div>
              <div className="seg">
                {["Comfortable","Default","Compact"].map((d,i) => (
                  <button key={d} className={`seg-btn ${i===1?"active":""}`}>{d}</button>
                ))}
              </div>
            </div>
          </>}
          {active === "profile" && <div className="card">
            <div className="row gap-12" style={{ marginBottom: 20 }}>
              <div className="avatar avatar-lg">RT</div>
              <div>
                <div className="t-sub">Rafael Torres</div>
                <div className="t-caption">rafael@torres.dev</div>
              </div>
              <button className="btn btn-ghost btn-sm ml-auto">Upload avatar</button>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              <div><label className="t-label-up muted" style={{ display: "block", marginBottom: 6 }}>Full name</label>
                <input className="input" defaultValue="Rafael Torres"/></div>
              <div><label className="t-label-up muted" style={{ display: "block", marginBottom: 6 }}>Headline</label>
                <input className="input" defaultValue="Senior Frontend Engineer"/></div>
              <div><label className="t-label-up muted" style={{ display: "block", marginBottom: 6 }}>Location</label>
                <input className="input" defaultValue="São Paulo, BR (remote)"/></div>
              <div><label className="t-label-up muted" style={{ display: "block", marginBottom: 6 }}>Timezone</label>
                <input className="input" defaultValue="America/Sao_Paulo (GMT-3)"/></div>
            </div>
          </div>}
          {active === "integrations" && <div className="card" style={{ padding: 0 }}>
            {[
              { n: "Gmail", d: "Sync recruiter threads", on: true },
              { n: "Google Calendar", d: "Book interview slots", on: true },
              { n: "LinkedIn", d: "Import jobs + recruiters", on: false },
              { n: "Notion", d: "Mirror notes", on: false },
            ].map((x,i,arr) => (
              <div key={x.n} style={{ padding: "14px 18px", borderBottom: i<arr.length-1?"1px solid var(--color-border-subtle)":"none",
                display: "flex", alignItems: "center", gap: 12 }}>
                <div className="avatar avatar-logo" style={{ width: 34, height: 34 }}>{x.n[0]}</div>
                <div style={{ flex: 1 }}>
                  <div className="t-body-med">{x.n}</div>
                  <div className="t-caption">{x.d}</div>
                </div>
                <button className={`btn btn-sm ${x.on?"btn-ghost":"btn-brand"}`}>{x.on?"Connected":"Connect"}</button>
              </div>
            ))}
          </div>}
          {(active === "workspace" || active === "billing" || active === "danger") && <div className="card">
            <div className="t-sub" style={{ marginBottom: 6 }}>{sections.find(s=>s.key===active).label}</div>
            <div className="t-body muted">Section contents — left deliberately sparse in this mock.</div>
          </div>}
        </div>
      </div>
    </div>
  );
}

window.Landing = Landing;
window.Login = Login;
window.Settings = Settings;
