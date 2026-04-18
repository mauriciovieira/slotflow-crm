/* global React, OPPORTUNITIES, STAGES, COMPANIES */
const { useState } = React;

function Pipeline({ openOpp }) {
  const Icons = window.Icons;
  const { CompanyAvatar } = window;
  const [opps, setOpps] = useState(OPPORTUNITIES);
  const [dragging, setDragging] = useState(null);
  const [dropTarget, setDropTarget] = useState(null);

  const byStage = STAGES.map((s) => ({
    ...s, items: opps.filter((o) => o.stage === s.key),
  }));

  const onDragStart = (id) => (e) => {
    setDragging(id);
    e.dataTransfer.effectAllowed = "move";
    try { e.dataTransfer.setData("text/plain", id); } catch (_) {}
  };
  const onDragEnd = () => { setDragging(null); setDropTarget(null); };
  const onDragOver = (stage) => (e) => { e.preventDefault(); setDropTarget(stage); };
  const onDrop = (stage) => (e) => {
    e.preventDefault();
    if (!dragging) return;
    setOpps((prev) => prev.map((o) => o.id === dragging ? { ...o, stage } : o));
    setDragging(null); setDropTarget(null);
  };

  return (
    <div style={{ padding: "24px 32px", display: "flex", flexDirection: "column", gap: 16, minHeight: 0, flex: 1 }}>
      <div className="row gap-12">
        <h1 className="t-page-title" style={{ margin: 0 }}>Pipeline</h1>
        <span className="t-caption">Drag cards between columns to update stage</span>
        <div className="ml-auto row gap-6">
          <button className="btn btn-ghost btn-sm"><Icons.Filter/> Filter</button>
          <button className="btn btn-ghost btn-sm"><Icons.Calendar/> This week</button>
        </div>
      </div>

      <div className="kanban" style={{ flex: 1, minHeight: 0 }}>
        {byStage.map((col) => (
          <div key={col.key}
            className={`kanban-col ${dropTarget === col.key ? "drop-target" : ""}`}
            onDragOver={onDragOver(col.key)}
            onDrop={onDrop(col.key)}
            onDragLeave={() => setDropTarget(null)}
          >
            <div className="kanban-col-head">
              <span className="badge-dot" style={{ background: col.color, width: 8, height: 8 }}/>
              <span className="kanban-col-title">{col.label}</span>
              <span className="kanban-col-count">{col.items.length}</span>
              <button className="btn-icon"><Icons.Plus/></button>
            </div>
            {col.items.map((o) => (
              <div key={o.id}
                className={`kanban-card ${dragging === o.id ? "dragging" : ""}`}
                draggable
                onDragStart={onDragStart(o.id)}
                onDragEnd={onDragEnd}
                onClick={() => openOpp(o.id)}
              >
                <div className="row gap-8" style={{ marginBottom: 8 }}>
                  <CompanyAvatar company={o.company} size={22}/>
                  <span className="t-body-med" style={{ fontSize: 13 }}>{COMPANIES[o.company].name}</span>
                  <span className="t-mono-micro ml-auto" style={{ color: "var(--color-text-muted)" }}>
                    {o.fit}
                  </span>
                </div>
                <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.3, marginBottom: 8,
                  display: "-webkit-box", WebkitLineClamp: 2, WebkitBoxOrient: "vertical", overflow: "hidden"
                }}>{o.role}</div>
                <div className="t-mono-micro" style={{ color: "var(--color-text-muted)", marginBottom: 10 }}>{o.slug}</div>
                {o.nextActionDate && (
                  <div className="row gap-6" style={{
                    padding: "6px 8px", borderRadius: 6,
                    background: "var(--color-row-stripe)",
                    fontSize: 12,
                  }}>
                    <Icons.Calendar className="i" style={{ width: 12, height: 12, color: "var(--color-text-muted)" }}/>
                    <span style={{ color: "var(--color-text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{o.nextAction}</span>
                  </div>
                )}
                <div className="row gap-6" style={{ marginTop: 8 }}>
                  {o.priority === "high" && <span className="chip chip-amber" style={{ fontSize: 11 }}>High</span>}
                  {o.recruiterInitials && (
                    <span className="avatar avatar-sm ml-auto" title={o.recruiter}>{o.recruiterInitials}</span>
                  )}
                </div>
              </div>
            ))}
            {col.items.length === 0 && (
              <div style={{
                padding: "24px 12px", textAlign: "center",
                fontSize: 12, color: "var(--color-text-placeholder)",
                border: "1px dashed var(--color-border-medium)", borderRadius: 10,
              }}>Drop here</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

window.Pipeline = Pipeline;
