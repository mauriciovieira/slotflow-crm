/* global React, OPPORTUNITIES, STAGES, COMPANIES, MESSAGES */
const { useState, useMemo } = React;

// ============ DASHBOARD ============
function Dashboard({ setRoute, openOpp }) {
  const Icons = window.Icons;
  const { StageBadge, CompanyAvatar } = window;
  const active = OPPORTUNITIES.filter(o => o.stage !== "rejected");
  const byStage = STAGES.filter(s => s.key !== "rejected").map(s => ({
    ...s, count: OPPORTUNITIES.filter(o => o.stage === s.key).length
  }));
  const upcoming = OPPORTUNITIES
    .filter(o => o.nextActionDate && o.stage !== "rejected")
    .sort((a, b) => a.nextActionDate.localeCompare(b.nextActionDate))
    .slice(0, 5);
  const recentMsgs = MESSAGES.slice(0, 3);

  return (
    <div style={{ padding: "24px 32px", maxWidth: 1280, margin: "0 auto", width: "100%" }}>
      <div className="row gap-12" style={{ marginBottom: 6 }}>
        <h1 className="t-page-title" style={{ margin: 0 }}>Good morning, Rafael</h1>
        <span className="chip chip-mint"><span className="badge-dot" style={{ background: "var(--color-brand)" }}/>3 new this week</span>
      </div>
      <p className="t-body" style={{ color: "var(--color-text-muted)", margin: "0 0 24px" }}>
        You have <strong style={{ color: "var(--color-text-primary)" }}>2 interviews</strong> this week and an offer from Linear pending your reply.
      </p>

      {/* Stat strip */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 12, marginBottom: 20 }}>
        {[
          { label: "Active", value: active.length, delta: "+3", tone: "mint" },
          { label: "In interview", value: OPPORTUNITIES.filter(o => o.stage === "interview").length, delta: "2 onsite", tone: "mint" },
          { label: "Response rate", value: "41%", delta: "+6pp", tone: "mint" },
          { label: "Avg. cycle time", value: "18d", delta: "−2d", tone: "mint" },
        ].map((s) => (
          <div key={s.label} className="card" style={{ padding: 16 }}>
            <div className="t-label-up" style={{ color: "var(--color-text-muted)", fontSize: 11 }}>{s.label}</div>
            <div style={{ fontSize: 28, fontWeight: 600, letterSpacing: "-0.56px", lineHeight: 1.1, marginTop: 6 }}>{s.value}</div>
            <div className="t-caption" style={{ marginTop: 4, color: "var(--color-brand-deep)", fontWeight: 500 }}>
              <Icons.ArrowUp className="i" style={{ display: "inline", width: 12, height: 12, verticalAlign: -2 }}/> {s.delta} vs last week
            </div>
          </div>
        ))}
      </div>

      {/* Pipeline overview strip */}
      <div className="card" style={{ padding: 0, marginBottom: 20, overflow: "hidden" }}>
        <div style={{ padding: "14px 20px", display: "flex", alignItems: "center" }}>
          <div className="t-sub">Pipeline overview</div>
          <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setRoute("pipeline")}>Open board <Icons.ChevronR /></button>
        </div>
        <hr className="divider" />
        <div style={{ display: "grid", gridTemplateColumns: `repeat(${byStage.length}, 1fr)` }}>
          {byStage.map((s, i) => (
            <div key={s.key} style={{
              padding: "16px 20px",
              borderRight: i < byStage.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
            }}>
              <div className="row gap-6" style={{ marginBottom: 6 }}>
                <span className="badge-dot" style={{ background: s.color, width: 8, height: 8 }}/>
                <span className="t-label-up" style={{ fontSize: 11 }}>{s.label}</span>
              </div>
              <div style={{ fontSize: 22, fontWeight: 600, letterSpacing: "-0.44px" }}>{s.count}</div>
              <div className="progress" style={{ marginTop: 8 }}>
                <div className="progress-bar" style={{
                  width: `${(s.count / Math.max(...byStage.map(x => x.count))) * 100}%`,
                  background: s.color,
                }}/>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Two-col: upcoming + inbox */}
      <div style={{ display: "grid", gridTemplateColumns: "1.4fr 1fr", gap: 16 }}>
        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "14px 20px", display: "flex", alignItems: "center" }}>
            <div className="t-sub">Upcoming actions</div>
            <span className="chip" style={{ marginLeft: 8 }}>{upcoming.length}</span>
            <button className="btn-icon ml-auto"><Icons.Calendar/></button>
          </div>
          <hr className="divider" />
          {upcoming.map((o, i) => (
            <div key={o.id} onClick={() => openOpp(o.id)} style={{
              padding: "12px 20px",
              borderBottom: i < upcoming.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
              display: "flex", alignItems: "center", gap: 12, cursor: "pointer",
            }} className="row-hover">
              <CompanyAvatar company={o.company} />
              <div style={{ minWidth: 0, flex: 1 }}>
                <div className="row gap-8">
                  <span className="t-body-med" style={{ color: "var(--color-text-primary)" }}>{o.role}</span>
                  <span className="t-mono-micro" style={{ color: "var(--color-text-muted)" }}>{o.slug}</span>
                </div>
                <div className="t-caption" style={{ marginTop: 2 }}>{o.nextAction}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="t-mono-label" style={{ color: "var(--color-text-primary)" }}>
                  {new Date(o.nextActionDate).toLocaleDateString("en-US", { month: "short", day: "numeric" })}
                </div>
                <div style={{ marginTop: 4 }}><StageBadge stage={o.stage}/></div>
              </div>
            </div>
          ))}
        </div>

        <div className="card" style={{ padding: 0 }}>
          <div style={{ padding: "14px 20px", display: "flex", alignItems: "center" }}>
            <div className="t-sub">Recent messages</div>
            <button className="btn btn-ghost btn-sm ml-auto" onClick={() => setRoute("inbox")}>Open inbox <Icons.ChevronR/></button>
          </div>
          <hr className="divider" />
          {recentMsgs.map((m, i) => {
            const opp = OPPORTUNITIES.find(o => o.id === m.oppId);
            return (
              <div key={m.id} onClick={() => setRoute("inbox")} style={{
                padding: "12px 20px",
                borderBottom: i < recentMsgs.length - 1 ? "1px solid var(--color-border-subtle)" : "none",
                display: "flex", gap: 12, cursor: "pointer",
              }}>
                <div className="avatar avatar-sm" style={{ marginTop: 2 }}>{m.initials}</div>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row gap-6">
                    <span className="t-body-med">{m.from}</span>
                    {m.unread && <span className="badge-dot" style={{ background: "var(--color-brand)" }}/>}
                    <span className="t-caption ml-auto">{m.at}</span>
                  </div>
                  <div className="t-caption" style={{ color: "var(--color-text-secondary)", marginTop: 2,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.preview}</div>
                  {opp && <div style={{ marginTop: 6 }}>
                    <span className="t-mono-micro" style={{ color: "var(--color-text-muted)" }}>{opp.slug}</span>
                  </div>}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

window.Dashboard = Dashboard;
