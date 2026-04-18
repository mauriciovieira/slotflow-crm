/* global React, OPPORTUNITIES, STAGES, COMPANIES */
const { useState, useMemo } = React;

function Opportunities({ openOpp }) {
  const Icons = window.Icons;
  const { StageBadge, CompanyAvatar } = window;
  const [q, setQ] = useState("");
  const [stageFilter, setStageFilter] = useState("all");
  const [priorityFilter, setPriorityFilter] = useState("all");
  const [sort, setSort] = useState("updated");

  const filtered = useMemo(() => {
    let r = OPPORTUNITIES.filter((o) => {
      const c = COMPANIES[o.company]?.name ?? "";
      const hay = (o.role + " " + c + " " + o.slug + " " + o.recruiter).toLowerCase();
      if (q && !hay.includes(q.toLowerCase())) return false;
      if (stageFilter !== "all" && o.stage !== stageFilter) return false;
      if (priorityFilter !== "all" && o.priority !== priorityFilter) return false;
      return true;
    });
    if (sort === "fit") r = [...r].sort((a, b) => b.fit - a.fit);
    if (sort === "stage") r = [...r].sort((a, b) => b.stageIndex - a.stageIndex);
    return r;
  }, [q, stageFilter, priorityFilter, sort]);

  return (
    <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div className="row gap-12">
        <h1 className="t-page-title" style={{ margin: 0 }}>Opportunities</h1>
        <span className="chip">{OPPORTUNITIES.length} total</span>
        <span className="chip chip-mint">{OPPORTUNITIES.filter(o => o.stage !== "rejected").length} active</span>
      </div>

      {/* Toolbar */}
      <div className="row gap-8" style={{ flexWrap: "wrap" }}>
        <div style={{ position: "relative", width: 320 }}>
          <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-placeholder)" }}>
            <Icons.Search />
          </span>
          <input className="input input-search" placeholder="Filter by role, company, slug…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>

        <div className="seg">
          {["all", ...STAGES.map((s) => s.key)].map((k) => (
            <button key={k} className={`seg-btn ${stageFilter === k ? "active" : ""}`} onClick={() => setStageFilter(k)}>
              {k === "all" ? "All" : STAGES.find((s) => s.key === k).label}
            </button>
          ))}
        </div>

        <div className="seg">
          {[
            { k: "all", l: "Any" }, { k: "high", l: "High" }, { k: "med", l: "Medium" }, { k: "low", l: "Low" }
          ].map((x) => (
            <button key={x.k} className={`seg-btn ${priorityFilter === x.k ? "active" : ""}`} onClick={() => setPriorityFilter(x.k)}>{x.l}</button>
          ))}
        </div>

        <div className="row gap-6 ml-auto">
          <select className="input" style={{ width: "auto", height: 34 }} value={sort} onChange={(e) => setSort(e.target.value)}>
            <option value="updated">Sort: Last updated</option>
            <option value="fit">Sort: Fit score</option>
            <option value="stage">Sort: Stage (furthest)</option>
          </select>
          <button className="btn btn-ghost btn-sm"><Icons.Filter /> Save view</button>
        </div>
      </div>

      {/* Table */}
      <div className="table-wrap">
        <table className="tbl">
          <thead>
            <tr>
              <th style={{ width: 34 }}></th>
              <th>Role</th>
              <th>Stage</th>
              <th>Next action</th>
              <th>Recruiter</th>
              <th>Comp</th>
              <th style={{ textAlign: "right" }}>Fit</th>
              <th>Updated</th>
              <th style={{ width: 40 }}></th>
            </tr>
          </thead>
          <tbody>
            {filtered.map((o) => (
              <tr key={o.id} onClick={() => openOpp(o.id)}>
                <td>
                  <CompanyAvatar company={o.company} size={24} />
                </td>
                <td>
                  <div style={{ fontWeight: 500, color: "var(--color-text-primary)" }}>{o.role}</div>
                  <div className="row gap-6" style={{ marginTop: 2 }}>
                    <span className="t-caption" style={{ color: "var(--color-text-secondary)" }}>{COMPANIES[o.company].name}</span>
                    <span className="t-mono-micro" style={{ color: "var(--color-text-muted)" }}>{o.slug}</span>
                  </div>
                </td>
                <td><StageBadge stage={o.stage} /></td>
                <td>
                  {o.nextActionDate ? (
                    <div>
                      <div style={{ fontSize: 13 }}>{o.nextAction}</div>
                      <div className="t-mono-micro" style={{ color: "var(--color-text-muted)", marginTop: 2 }}>
                        {new Date(o.nextActionDate).toLocaleDateString("en-US", { weekday: "short", month: "short", day: "numeric" })}
                      </div>
                    </div>
                  ) : (
                    <span className="t-caption" style={{ color: "var(--color-text-placeholder)" }}>—</span>
                  )}
                </td>
                <td>
                  {o.recruiter !== "—" ? (
                    <div className="row gap-8">
                      <div className="avatar avatar-sm">{o.recruiterInitials}</div>
                      <span className="t-cell">{o.recruiter}</span>
                    </div>
                  ) : (
                    <span className="t-caption" style={{ color: "var(--color-text-placeholder)" }}>—</span>
                  )}
                </td>
                <td className="t-cell" style={{ color: "var(--color-text-secondary)" }}>{o.comp}</td>
                <td style={{ textAlign: "right" }}>
                  <span style={{
                    display: "inline-block", minWidth: 34,
                    fontFamily: "var(--font-mono)", fontSize: 12, fontWeight: 600,
                    color: o.fit >= 85 ? "var(--color-brand-deep)" : o.fit >= 75 ? "var(--color-text-primary)" : "var(--color-text-muted)",
                  }}>{o.fit}</span>
                </td>
                <td className="t-caption">{o.updatedAt}</td>
                <td onClick={(e) => e.stopPropagation()}>
                  <button className="btn-icon"><Icons.More /></button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        {filtered.length === 0 && (
          <div style={{ padding: 48, textAlign: "center" }}>
            <div className="t-sub" style={{ marginBottom: 6 }}>No results</div>
            <div className="t-caption">Try removing a filter or clearing search.</div>
          </div>
        )}
      </div>
    </div>
  );
}

window.Opportunities = Opportunities;
