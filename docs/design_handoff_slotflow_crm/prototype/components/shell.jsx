/* global React, Icons, Lockup, Logomark, COMPANIES, STAGES */
const { useState } = React;

function Sidebar({ route, setRoute, counts }) {
  const Icons = window.Icons;
  const items = [
    { key: "dashboard", label: "Dashboard", icon: Icons.Home },
    { key: "opportunities", label: "Opportunities", icon: Icons.Briefcase, count: counts.opportunities },
    { key: "pipeline", label: "Pipeline", icon: Icons.Kanban },
    { key: "inbox", label: "Inbox", icon: Icons.Inbox, count: counts.inbox },
    { key: "resume", label: "Resume Studio", icon: Icons.File },
  ];
  const pinned = [
    { key: "opp_10", slug: "OPENAI · MTS", color: "var(--color-brand)" },
    { key: "opp_03", slug: "LINEAR · SR PE", color: "var(--color-brand-deep)" },
    { key: "opp_01", slug: "STRIPE · SR FE", color: "var(--color-blue)" },
  ];
  return (
    <aside className="shell-nav">
      <div style={{ padding: "4px 6px 14px", display: "flex", alignItems: "center", gap: 8 }}>
        <Lockup size={18} />
      </div>
      {items.map((it) => {
        const I = it.icon;
        return (
          <button key={it.key} className={`nav-item ${route === it.key ? "active" : ""}`} onClick={() => setRoute(it.key)}>
            <I />
            <span>{it.label}</span>
            {it.count != null && <span className="nav-count">{it.count}</span>}
          </button>
        );
      })}

      <div className="nav-section">Pinned</div>
      {pinned.map((p) => (
        <button key={p.key} className="nav-item" onClick={() => setRoute("opportunity:" + p.key)}>
          <span style={{ width: 6, height: 6, borderRadius: 9999, background: p.color, flexShrink: 0 }} />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, letterSpacing: 0.4 }}>{p.slug}</span>
        </button>
      ))}

      <div style={{ marginTop: "auto", padding: "10px 6px 2px" }}>
        <button className={`nav-item ${route === "settings" ? "active" : ""}`} onClick={() => setRoute("settings")}>
          <Icons.Settings />
          <span>Settings</span>
        </button>
        <div style={{
          marginTop: 8, padding: "10px 10px", display: "flex", alignItems: "center", gap: 10,
          borderRadius: 10, background: "var(--color-bg)", border: "1px solid var(--color-border-subtle)"
        }}>
          <div className="avatar avatar-sm" style={{ width: 26, height: 26, fontSize: 11 }}>RT</div>
          <div style={{ minWidth: 0, flex: 1 }}>
            <div style={{ fontSize: 13, fontWeight: 500, lineHeight: 1.2 }}>Rafael Torres</div>
            <div className="t-caption" style={{ fontSize: 11 }}>rafael@torres.dev</div>
          </div>
        </div>
      </div>
    </aside>
  );
}

function Topbar({ title, theme, toggleTheme, onNew }) {
  const Icons = window.Icons;
  return (
    <div className="topbar">
      <div className="t-page-title" style={{ fontSize: 16, letterSpacing: "-0.16px" }}>{title}</div>
      <div style={{ position: "relative", marginLeft: 24, flex: 1, maxWidth: 480 }}>
        <Icons.Search className="i" />
        <span style={{ position: "absolute", left: 10, top: "50%", transform: "translateY(-50%)", color: "var(--color-text-placeholder)" }}>
          <Icons.Search />
        </span>
        <input className="input input-search" placeholder="Search opportunities, companies, messages…" />
        <span style={{
          position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)",
          fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--color-text-muted)",
          letterSpacing: 0.5, border: "1px solid var(--color-border-subtle)",
          padding: "2px 5px", borderRadius: 4
        }}>⌘K</span>
      </div>
      <div className="ml-auto row gap-6">
        <button className="btn-icon" title="Toggle theme" onClick={toggleTheme}>
          {theme === "dark" ? <Icons.Sun /> : <Icons.Moon />}
        </button>
        <button className="btn-icon" title="Notifications"><Icons.Bell /></button>
        {onNew && (
          <button className="btn btn-brand btn-sm" onClick={onNew}>
            <Icons.Plus /> New opportunity
          </button>
        )}
      </div>
    </div>
  );
}

function StageBadge({ stage }) {
  const s = STAGES.find((x) => x.key === stage) ?? STAGES[0];
  const cls = ({
    applied: "", screening: "chip-blue", interview: "chip-mint", offer: "chip-mint", rejected: "chip-red",
  })[s.key];
  const dot = s.color;
  return (
    <span className={`badge ${cls}`} style={{
      background: s.key === "offer" ? "var(--color-brand-light)" : undefined,
    }}>
      <span className="badge-dot" style={{ background: dot }} />
      {s.label}
    </span>
  );
}

function CompanyAvatar({ company, size = 28 }) {
  const c = COMPANIES[company];
  return (
    <span className="avatar avatar-logo" style={{ width: size, height: size, fontSize: Math.round(size * 0.42) }}>
      {c?.initial ?? "?"}
    </span>
  );
}

window.Sidebar = Sidebar;
window.Topbar = Topbar;
window.StageBadge = StageBadge;
window.CompanyAvatar = CompanyAvatar;
