/* global React, ReactDOM */
const { useState, useEffect, useMemo } = React;

function App() {
  const [route, setRoute] = useState("app"); // "landing" | "login" | "app"
  const [screen, setScreen] = useState("dashboard");
  const [openOppId, setOpenOppId] = useState(null);

  const counts = useMemo(() => ({
    opportunities: window.OPPORTUNITIES.filter(o => o.stage !== "rejected").length,
    inbox: window.MESSAGES.filter(m => m.unread).length,
  }), []);

  const openOpp = (id) => setOpenOppId(id);
  const closeOpp = () => setOpenOppId(null);

  const { Sidebar, Topbar, Dashboard, Opportunities, Pipeline, Inbox, Resume, Settings,
          Landing, Login, OpportunityDetail } = window;

  if (route === "landing") return <Landing goLogin={() => setRoute("login")} />;
  if (route === "login") return <Login goApp={() => setRoute("app")} goLanding={() => setRoute("landing")} />;

  const titles = {
    dashboard: "Dashboard", opportunities: "Opportunities", pipeline: "Pipeline",
    inbox: "Inbox", resume: "Resume Studio", settings: "Settings",
  };

  return (
    <div className="shell" style={{ minHeight: "100vh" }}>
      <Sidebar route={screen} setRoute={(r) => {
        if (r.startsWith("opportunity:")) { openOpp(r.split(":")[1]); return; }
        setScreen(r);
      }} counts={counts} />
      <div className="shell-main">
        <Topbar
          title={titles[screen] ?? "Slotflow"}
          theme={window.__theme}
          toggleTheme={window.__toggleTheme}
          onNew={screen === "opportunities" || screen === "pipeline" ? () => {} : null}
        />
        <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
          {screen === "dashboard" && <Dashboard setRoute={setScreen} openOpp={openOpp} />}
          {screen === "opportunities" && <Opportunities openOpp={openOpp} />}
          {screen === "pipeline" && <Pipeline openOpp={openOpp} />}
          {screen === "inbox" && <Inbox openOpp={openOpp} />}
          {screen === "resume" && <Resume />}
          {screen === "settings" && <Settings />}
        </main>
      </div>
      {openOppId && <OpportunityDetail oppId={openOppId} onClose={closeOpp} />}
    </div>
  );
}

// ===== Dual theme wrapper =====
function DualPreview() {
  const [route, setRoute] = useState(() => localStorage.getItem("sf_route") ?? "app");
  const [screen, setScreen] = useState(() => localStorage.getItem("sf_screen") ?? "dashboard");
  const [openOppId, setOpenOppId] = useState(null);

  useEffect(() => { localStorage.setItem("sf_route", route); }, [route]);
  useEffect(() => { localStorage.setItem("sf_screen", screen); }, [screen]);

  const routes = [
    { k: "landing", l: "Landing" },
    { k: "login", l: "Login" },
    { k: "app:dashboard", l: "Dashboard" },
    { k: "app:opportunities", l: "Opportunities" },
    { k: "app:pipeline", l: "Pipeline" },
    { k: "app:inbox", l: "Inbox" },
    { k: "app:resume", l: "Resume Studio" },
    { k: "app:settings", l: "Settings" },
  ];

  const active = route === "landing" ? "landing" : route === "login" ? "login" : `app:${screen}`;
  const go = (k) => {
    if (k === "landing") { setRoute("landing"); return; }
    if (k === "login") { setRoute("login"); return; }
    const s = k.split(":")[1];
    setRoute("app"); setScreen(s);
  };

  const openOpp = (id) => setOpenOppId(id);
  const closeOpp = () => setOpenOppId(null);

  const { Sidebar, Topbar, Dashboard, Opportunities, Pipeline, Inbox, Resume, Settings,
          Landing, Login, OpportunityDetail, Lockup, Logomark } = window;

  const titles = {
    dashboard: "Dashboard", opportunities: "Opportunities", pipeline: "Pipeline",
    inbox: "Inbox", resume: "Resume Studio", settings: "Settings",
  };

  const renderScreen = (themeKey) => {
    const content = route === "landing" ? <Landing goLogin={() => setRoute("login")} />
      : route === "login" ? <Login goApp={() => { setRoute("app"); setScreen("dashboard"); }} goLanding={() => setRoute("landing")} />
      : (
        <div className="shell" style={{ minHeight: "100%", height: "100%" }}>
          <Sidebar route={screen} setRoute={(r) => {
            if (r.startsWith("opportunity:")) { openOpp(r.split(":")[1]); return; }
            setScreen(r);
          }} counts={{
            opportunities: window.OPPORTUNITIES.filter(o => o.stage !== "rejected").length,
            inbox: window.MESSAGES.filter(m => m.unread).length,
          }}/>
          <div className="shell-main">
            <Topbar
              title={titles[screen] ?? "Slotflow"}
              theme={themeKey}
              toggleTheme={() => {}}
              onNew={screen === "opportunities" || screen === "pipeline" ? () => {} : null}
            />
            <main style={{ flex: 1, overflow: "auto", display: "flex", flexDirection: "column" }}>
              {screen === "dashboard" && <Dashboard setRoute={setScreen} openOpp={openOpp} />}
              {screen === "opportunities" && <Opportunities openOpp={openOpp} />}
              {screen === "pipeline" && <Pipeline openOpp={openOpp} />}
              {screen === "inbox" && <Inbox openOpp={openOpp} />}
              {screen === "resume" && <Resume />}
              {screen === "settings" && <Settings />}
            </main>
          </div>
        </div>
      );
    return content;
  };

  return (
    <div style={{ minHeight: "100vh", background: "#f3f3f3", color: "#0d0d0d" }}>
      {/* Canvas nav */}
      <div style={{
        position: "sticky", top: 0, zIndex: 50,
        background: "rgba(255,255,255,0.82)", backdropFilter: "blur(10px)",
        borderBottom: "1px solid rgba(0,0,0,0.08)",
        padding: "12px 20px", display: "flex", alignItems: "center", gap: 14, flexWrap: "wrap"
      }}>
        <Lockup size={18}/>
        <span style={{ fontSize: 12, color: "#666", fontFamily: "var(--font-mono)", letterSpacing: 0.5, marginRight: 8 }}>
          DESIGN REVIEW · v2
        </span>
        <div style={{ display: "flex", gap: 4, background: "#ededed", borderRadius: 8, padding: 2, flexWrap: "wrap" }}>
          {routes.map(r => (
            <button key={r.k} onClick={() => go(r.k)} style={{
              padding: "5px 10px", borderRadius: 6,
              fontSize: 12, fontWeight: 500,
              color: active === r.k ? "#0d0d0d" : "#666",
              background: active === r.k ? "#fff" : "transparent",
              boxShadow: active === r.k ? "rgba(0,0,0,0.05) 0 1px 2px" : "none",
            }}>{r.l}</button>
          ))}
        </div>
        <span style={{ marginLeft: "auto", fontSize: 12, color: "#666" }}>
          Light · Dark side-by-side
        </span>
      </div>

      {/* Dual frames */}
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 16, padding: 16 }}>
        {["light", "dark"].map((t) => (
          <div key={t} style={{
            borderRadius: 18, overflow: "hidden",
            border: "1px solid rgba(0,0,0,0.08)",
            background: t === "light" ? "#fff" : "#0d0d0d",
            boxShadow: "rgba(0,0,0,0.04) 0 2px 6px",
          }}>
            <div style={{
              display: "flex", alignItems: "center", gap: 6,
              padding: "8px 14px", background: t === "light" ? "#fafafa" : "#171717",
              borderBottom: `1px solid ${t === "light" ? "rgba(0,0,0,0.06)" : "rgba(255,255,255,0.08)"}`,
              height: 32,
            }}>
              <span style={{ width: 9, height: 9, borderRadius: 9999, background: t === "light" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.15)" }}/>
              <span style={{ width: 9, height: 9, borderRadius: 9999, background: t === "light" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.15)" }}/>
              <span style={{ width: 9, height: 9, borderRadius: 9999, background: t === "light" ? "rgba(0,0,0,0.12)" : "rgba(255,255,255,0.15)" }}/>
              <span style={{
                marginLeft: 10,
                fontFamily: "ui-monospace, monospace", fontSize: 10, letterSpacing: 0.5,
                color: t === "light" ? "#666" : "#8a8a8a", textTransform: "uppercase",
              }}>
                {t === "light" ? "Light" : "Dark"}
              </span>
            </div>
            <div data-theme={t} style={{ height: 780, overflow: "auto" }}>
              {renderScreen(t)}
            </div>
          </div>
        ))}
      </div>

      {openOppId && (
        <div data-theme="light">
          <OpportunityDetail oppId={openOppId} onClose={closeOpp}/>
        </div>
      )}

      <div style={{ padding: "16px 20px 32px", textAlign: "center", fontSize: 12, color: "#888" }}>
        Tip: drag cards in Pipeline · click any opportunity row to open detail · filters + search on Opportunities
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<DualPreview />);
