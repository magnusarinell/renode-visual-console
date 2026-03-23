const TAB_LABELS = {
  system:  "Web Server",
  monitor: "Monitor",
};

export function LogPanel({ systemLogs, monitorLogs, pcLog = [], activeTab, onTabChange }) {
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
          {activeTab === "system" && systemLogs.map((entry) => (
            <div className="log-plain-line" key={entry.id}>
              {entry.machine && <span className="log-plain-board">[{entry.machine}]</span>}
              {entry.line}
            </div>
          ))}
          {activeTab === "monitor" && monitorLogs.map((entry) => (
            <div className="log-plain-line" key={entry.id}>
              {entry.machine && <span className="log-plain-board">[{entry.machine}]</span>}
              <span className="log-plain-tag">{entry.stream}</span>{entry.line}
            </div>
          ))}
        </div>
      </div>

      {/* ── PC trace panel ─────────────────────────────────────── */}
      <div className="log-pc-panel">
        <div className="log-pc-panel-header">DEBUG</div>
        <div className="log-pc-area">
          {pcLog.length === 0
            ? <span className="log-pc-empty">No data yet.</span>
            : pcLog.map((entry) => (
              <div className="log-pc-line" key={entry.id}>
                <span className="log-plain-ts">{new Date(entry.ts).toLocaleTimeString()}</span>
                {entry.file ? (
                  <>
                    <span className="log-pc-file">{entry.file}:{entry.line}</span>
                    <span className="log-pc-func" title={entry.func}>{entry.func}</span>
                    <span className="log-pc-addr">{entry.pc}</span>
                  </>
                ) : (
                  <span className="log-pc-addr">{entry.pc}</span>
                )}
              </div>
            ))
          }
        </div>
      </div>
    </aside>
  );
}
