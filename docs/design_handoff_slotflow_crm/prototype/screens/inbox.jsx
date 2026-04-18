/* global React, OPPORTUNITIES, COMPANIES, MESSAGES */
const { useState } = React;

function Inbox({ openOpp }) {
  const Icons = window.Icons;
  const { CompanyAvatar } = window;
  const [selectedId, setSelectedId] = useState(MESSAGES[0].id);
  const selected = MESSAGES.find((m) => m.id === selectedId);
  const opp = selected && OPPORTUNITIES.find((o) => o.id === selected.oppId);

  return (
    <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 16, flex: 1, minHeight: 0 }}>
      <div className="row gap-12">
        <h1 className="t-page-title" style={{ margin: 0 }}>Inbox</h1>
        <span className="chip chip-mint">{MESSAGES.filter(m => m.unread).length} unread</span>
      </div>

      <div style={{
        display: "grid", gridTemplateColumns: "360px 1fr", gap: 0,
        border: "1px solid var(--color-border-subtle)", borderRadius: 14,
        overflow: "hidden", flex: 1, minHeight: 0, background: "var(--color-card)",
      }}>
        {/* List */}
        <div style={{ borderRight: "1px solid var(--color-border-subtle)", display: "flex", flexDirection: "column", minHeight: 0 }}>
          <div style={{ padding: "10px 14px", borderBottom: "1px solid var(--color-border-subtle)", background: "var(--color-panel)" }}>
            <div className="seg" style={{ width: "100%" }}>
              {["All", "Unread", "Interviews", "Offers"].map((t, i) => (
                <button key={t} className={`seg-btn ${i === 0 ? "active" : ""}`} style={{ flex: 1 }}>{t}</button>
              ))}
            </div>
          </div>
          <div style={{ overflow: "auto", flex: 1 }}>
            {MESSAGES.map((m) => {
              const o = OPPORTUNITIES.find((o) => o.id === m.oppId);
              const active = m.id === selectedId;
              return (
                <div key={m.id} onClick={() => setSelectedId(m.id)} style={{
                  padding: "12px 14px", display: "flex", gap: 10,
                  cursor: "pointer",
                  borderBottom: "1px solid var(--color-border-subtle)",
                  background: active ? "var(--color-brand-light)" : (m.unread ? "var(--color-bg)" : "var(--color-row-stripe)"),
                  position: "relative",
                }}>
                  {active && <span style={{ position: "absolute", left: 0, top: 0, bottom: 0, width: 2, background: "var(--color-brand)" }}/>}
                  <div className="avatar avatar-sm" style={{ marginTop: 2 }}>{m.initials}</div>
                  <div style={{ minWidth: 0, flex: 1 }}>
                    <div className="row gap-6">
                      <span className="t-body-med" style={{ color: active ? "var(--color-brand-deep)" : undefined }}>{m.from}</span>
                      {m.unread && <span className="badge-dot" style={{ background: "var(--color-brand)" }}/>}
                      <span className="t-caption ml-auto" style={{ fontSize: 11 }}>{m.at}</span>
                    </div>
                    {o && <div className="t-mono-micro" style={{ color: active ? "var(--color-brand-deep)" : "var(--color-text-muted)", marginTop: 2 }}>{o.slug}</div>}
                    <div className="t-caption" style={{ color: "var(--color-text-secondary)", marginTop: 4,
                      display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden"
                    }}>{m.preview}</div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Detail */}
        <div style={{ display: "flex", flexDirection: "column", minHeight: 0, background: "var(--color-bg)" }}>
          {selected && (
            <>
              <div style={{ padding: "14px 20px", borderBottom: "1px solid var(--color-border-subtle)" }}>
                <div className="row gap-12">
                  <div>
                    <div className="t-sub">{selected.from}</div>
                    <div className="t-caption">to me · {selected.at}</div>
                  </div>
                  <div className="ml-auto row gap-6">
                    <button className="btn btn-ghost btn-sm"><Icons.Archive/> Archive</button>
                    <button className="btn btn-ghost btn-sm"><Icons.Pin/> Pin</button>
                    <button className="btn-icon"><Icons.More/></button>
                  </div>
                </div>
                {opp && (
                  <div className="row gap-8" style={{ marginTop: 12, padding: "8px 12px",
                    background: "var(--color-panel)", borderRadius: 10,
                    border: "1px solid var(--color-border-subtle)", cursor: "pointer"
                  }} onClick={() => openOpp(opp.id)}>
                    <CompanyAvatar company={opp.company} size={24}/>
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="t-body-med" style={{ fontSize: 13 }}>{opp.role}</div>
                      <div className="t-mono-micro" style={{ color: "var(--color-text-muted)", marginTop: 2 }}>{opp.slug}</div>
                    </div>
                    <Icons.ChevronR/>
                  </div>
                )}
              </div>
              <div style={{ padding: "20px 24px", flex: 1, overflow: "auto" }}>
                <p className="t-body-lg" style={{ marginTop: 0, color: "var(--color-text-secondary)" }}>{selected.body}</p>
                <p className="t-body" style={{ color: "var(--color-text-muted)", marginTop: 24 }}>— {selected.from}</p>

                {/* AI draft reply */}
                <div style={{
                  marginTop: 24, padding: 14,
                  border: "1px solid var(--color-border-subtle)",
                  borderLeft: "2px solid var(--color-purple)",
                  borderRadius: 10, background: "var(--color-panel)",
                }}>
                  <div className="row gap-6" style={{ marginBottom: 8 }}>
                    <Icons.Sparkle className="i" style={{ color: "var(--color-purple)", width: 14, height: 14 }}/>
                    <span className="t-label-up" style={{ color: "var(--color-purple)", fontSize: 11 }}>AI Draft · needs review</span>
                    <span className="t-caption ml-auto">Rafael's voice · professional</span>
                  </div>
                  <p className="t-body" style={{ margin: 0, color: "var(--color-text-secondary)" }}>
                    Thanks, {selected.from.split(" ")[0]} — Thursday 2pm PT works great. I'll be ready.
                    Could you share who I'll be meeting and any prep material you'd recommend?
                    Appreciate the thoughtful context on what the team is optimizing for.
                  </p>
                  <div className="row gap-6" style={{ marginTop: 12 }}>
                    <button className="btn btn-brand btn-sm">Use draft</button>
                    <button className="btn btn-ghost btn-sm">Regenerate</button>
                    <button className="btn btn-ghost btn-sm">Edit</button>
                  </div>
                </div>
              </div>
              <div style={{ padding: "12px 20px", borderTop: "1px solid var(--color-border-subtle)",
                display: "flex", gap: 8, alignItems: "center"
              }}>
                <input className="input" placeholder={`Reply to ${selected.from.split(" ")[0]}…`} />
                <button className="btn btn-primary btn-sm"><Icons.ArrowUp/> Send</button>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

window.Inbox = Inbox;
