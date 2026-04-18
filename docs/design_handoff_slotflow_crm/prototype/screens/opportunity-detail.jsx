/* global React, OPPORTUNITIES, STAGES, COMPANIES */
const { useState } = React;

function OpportunityDetail({ oppId, onClose }) {
  const Icons = window.Icons;
  const { StageBadge, CompanyAvatar } = window;
  const o = OPPORTUNITIES.find((x) => x.id === oppId);
  const [tab, setTab] = useState("overview");
  if (!o) return null;
  const c = COMPANIES[o.company];
  const stageIdx = STAGES.findIndex((s) => s.key === o.stage);

  const timeline = [
    { at: "3h ago", label: "Recruiter confirmed tech screen", kind: "stage" },
    { at: "1d ago", label: "Moved to Interview", kind: "move" },
    { at: "2d ago", label: "Phone screen completed", kind: "stage" },
    { at: "6d ago", label: `Applied via ${o.source}`, kind: "apply" },
  ];

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()} style={{ maxWidth: 880 }}>
        <div style={{ padding: "20px 24px", borderBottom: "1px solid var(--color-border-subtle)" }}>
          <div className="row gap-12">
            <CompanyAvatar company={o.company} size={40}/>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div className="row gap-8">
                <span className="t-body-med" style={{ color: "var(--color-text-secondary)" }}>{c.name}</span>
                <span className="t-caption">·</span>
                <span className="t-caption">{c.location}</span>
              </div>
              <h2 className="t-page-title" style={{ margin: "2px 0 0", fontSize: 24, letterSpacing: "-0.48px" }}>{o.role}</h2>
            </div>
            <button className="btn-icon" onClick={onClose}><Icons.Close/></button>
          </div>
          <div className="row gap-8" style={{ marginTop: 12, flexWrap: "wrap" }}>
            <StageBadge stage={o.stage}/>
            <span className="t-mono-micro" style={{ color: "var(--color-text-muted)" }}>{o.slug}</span>
            <span className="chip">{o.comp}</span>
            <span className="chip chip-mint"><Icons.Sparkle className="i-sm"/> Fit {o.fit}</span>
            <div className="ml-auto row gap-6">
              <button className="btn btn-ghost btn-sm"><Icons.External/> Job post</button>
              <button className="btn btn-primary btn-sm">Log update</button>
            </div>
          </div>

          <div className="pipeline-steps" style={{ marginTop: 16, flexWrap: "wrap" }}>
            {STAGES.filter((s) => s.key !== "rejected").map((s, i) => {
              const done = i < stageIdx;
              const active = i === stageIdx;
              return (
                <div key={s.key} className={`pipeline-step ${done ? "done" : ""} ${active ? "active" : ""}`}>
                  {done ? <Icons.Check className="i-sm"/> :
                    <span className="badge-dot" style={{ background: active ? s.color : "var(--color-border-strong)", width: 8, height: 8 }}/>}
                  {s.label}
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ display: "flex", gap: 4, padding: "0 24px", borderBottom: "1px solid var(--color-border-subtle)" }}>
          {[{k:"overview",l:"Overview"},{k:"timeline",l:"Timeline"},{k:"messages",l:"Messages"},{k:"docs",l:"Documents"}].map((t) => (
            <button key={t.k} onClick={() => setTab(t.k)} style={{
              padding: "12px 14px", fontSize: 13, fontWeight: 500,
              color: tab === t.k ? "var(--color-text-primary)" : "var(--color-text-muted)",
              borderBottom: `2px solid ${tab === t.k ? "var(--color-brand)" : "transparent"}`,
              marginBottom: -1,
            }}>{t.l}</button>
          ))}
        </div>

        <div style={{ padding: "20px 24px" }}>
          {tab === "overview" && (
            <div style={{ display: "grid", gridTemplateColumns: "1.6fr 1fr", gap: 20 }}>
              <div>
                <div className="t-label-up muted" style={{ marginBottom: 8 }}>Next action</div>
                <div className="panel" style={{ padding: 14, marginBottom: 20 }}>
                  <div className="row gap-8">
                    <Icons.Calendar style={{ color: "var(--color-brand-deep)" }}/>
                    <span className="t-body-med">{o.nextAction ?? "—"}</span>
                    {o.nextActionDate && <span className="t-mono-micro ml-auto" style={{ color: "var(--color-text-muted)" }}>
                      {new Date(o.nextActionDate).toLocaleDateString("en-US",{weekday:"short",month:"short",day:"numeric"})}
                    </span>}
                  </div>
                </div>
                <div className="t-label-up muted" style={{ marginBottom: 8 }}>Notes</div>
                <div className="t-body" style={{ color: "var(--color-text-secondary)", marginBottom: 20 }}>
                  {o.notes ?? "Strong recruiter relationship. Team is growing the platform org; expect questions on cross-team coordination and incremental migration."}
                </div>
                <div className="t-label-up muted" style={{ marginBottom: 8 }}>Why this fits</div>
                <ul style={{ margin: 0, paddingLeft: 18, color: "var(--color-text-secondary)" }} className="t-body">
                  <li>Remote-first, senior IC track, comp aligned to target band.</li>
                  <li>Prior {c.name} engineers rate eng culture 4.6 (31 reviews).</li>
                  <li>Role overlaps 82% with your "Senior product eng" resume variant.</li>
                </ul>
              </div>
              <div>
                <div className="panel" style={{ padding: 16, marginBottom: 16 }}>
                  <div className="t-label-up muted" style={{ marginBottom: 10 }}>Recruiter</div>
                  {o.recruiter !== "—" ? (
                    <div className="row gap-10">
                      <div className="avatar">{o.recruiterInitials}</div>
                      <div>
                        <div className="t-body-med">{o.recruiter}</div>
                        <div className="t-caption">{c.name} Talent</div>
                      </div>
                    </div>
                  ) : <div className="t-caption">Not yet assigned</div>}
                </div>
                <div className="panel" style={{ padding: 16 }}>
                  <div className="t-label-up muted" style={{ marginBottom: 10 }}>Details</div>
                  <div className="col gap-10">
                    {[
                      ["Applied", new Date(o.appliedAt).toLocaleDateString("en-US",{month:"short",day:"numeric",year:"numeric"})],
                      ["Source", o.source],
                      ["Priority", o.priority.toUpperCase()],
                      ["Slug", o.slug],
                    ].map(([k,v]) => (
                      <div key={k} className="row gap-8">
                        <span className="t-caption" style={{ width: 74 }}>{k}</span>
                        <span className="t-cell" style={{ color: "var(--color-text-primary)", fontFamily: k==="Slug"?"var(--font-mono)":undefined, fontSize: k==="Slug"?11:13 }}>{v}</span>
                      </div>
                    ))}
                  </div>
                </div>
              </div>
            </div>
          )}
          {tab === "timeline" && (
            <div style={{ position: "relative", paddingLeft: 18 }}>
              <div style={{ position: "absolute", left: 5, top: 6, bottom: 6, width: 1, background: "var(--color-border-subtle)" }}/>
              {timeline.map((t, i) => (
                <div key={i} style={{ position: "relative", paddingBottom: 16 }}>
                  <span className="badge-dot" style={{ position: "absolute", left: -18, top: 6, background: i===0?"var(--color-brand)":"var(--color-border-strong)", width: 10, height: 10, border: "2px solid var(--color-bg)" }}/>
                  <div className="t-body-med" style={{ fontSize: 13 }}>{t.label}</div>
                  <div className="t-caption">{t.at}</div>
                </div>
              ))}
            </div>
          )}
          {tab === "messages" && (
            <div className="t-caption">Thread view — see full inbox for details.</div>
          )}
          {tab === "docs" && (
            <div className="col gap-8">
              {["Resume — senior product eng v3.pdf","Cover letter — custom.pdf","Job description snapshot.md"].map((f) => (
                <div key={f} className="row gap-10" style={{ padding: 12, border: "1px solid var(--color-border-subtle)", borderRadius: 10 }}>
                  <Icons.File style={{ color: "var(--color-text-muted)" }}/>
                  <span className="t-body-med" style={{ fontSize: 13 }}>{f}</span>
                  <button className="btn btn-ghost btn-sm ml-auto">Open</button>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

window.OpportunityDetail = OpportunityDetail;
