const TAB_LABELS = {
  system:  "Web Server",
  monitor: "Monitor",
};

export function LogPanel({ systemLogs, monitorLogs, activeTab, onTabChange }) {
  return (
    <aside className="logs-panel">
      {/* ── Tabs: Web Server / Monitor ─────────────────────────── */}
      <div className="log-tabs-section">
        <div className="log-subtabs">
          {Object.keys(TAB_LABELS).map((t) => (
            <button
              key={t}
              className={`log-subtab-btn${activeTab === t ? " active" : ""}`}
              onClick={() => onTabChange(t)}
            >{TAB_LABELS[t]}</button>
          ))}
        </div>
        <div className="log-plain-area">
          {activeTab === "system" && [...systemLogs].reverse().map((entry) => (
            <div className="log-plain-line" key={entry.id}>
              {entry.machine && <span className="log-plain-board">[{entry.machine}]</span>}
              {entry.line}
            </div>
          ))}
          {activeTab === "monitor" && [...monitorLogs].reverse().map((entry) => (
            <div className="log-plain-line" key={entry.id}>
              {entry.machine && <span className="log-plain-board">[{entry.machine}]</span>}
              <span className="log-plain-tag">{entry.stream}</span>{entry.line}
            </div>
          ))}
        </div>
      </div>
    </aside>
  );
}
