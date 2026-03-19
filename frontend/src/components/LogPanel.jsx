const TAB_LABELS = {
  system:  "Web Server",
  monitor: "Monitor",
  uart:    "UART",
  pc:      "PC",
};

export function LogPanel({ systemLogs, monitorLogs, allUartLogs = [], pcLog = [], activeTab, onTabChange }) {
  return (
    <aside className="logs-panel">
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
        {activeTab === "uart" && allUartLogs.map((entry) => (
          <div className="log-plain-line" key={entry.id}>
            {entry.machine && <span className="log-plain-board">[{entry.machine}]</span>}
            {entry.stream === "hub" && <span className="log-plain-tag">hub</span>}
            {entry.line}
          </div>
        ))}
        {activeTab === "pc" && pcLog.map((entry) => (
          <div className="log-plain-line" key={entry.id}>
            <span className="log-plain-ts">{new Date(entry.ts).toLocaleTimeString()}</span>
            {entry.pc}
          </div>
        ))}
      </div>
    </aside>
  );
}
