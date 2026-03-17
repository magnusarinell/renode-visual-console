import { BOARDS } from "../constants";

const TAB_LABELS = {
  system:  "Web Server",
  monitor: "Monitor",
  hub:     "UART Hub",
  uart:    "UART",
};

export function LogPanel({ systemLogs, monitorLogs, uartHubLogs, daisyUartLogs = [], activeTab, onTabChange }) {
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
        {activeTab === "hub" && uartHubLogs.map((entry) => (
          <div className="log-plain-line" key={entry.id}>
            <span className="log-plain-board">[{entry.machine || BOARDS[0].id}]</span>{entry.line}
          </div>
        ))}
        {activeTab === "uart" && daisyUartLogs.map((entry) => (
          <div className="log-plain-line" key={entry.id}>
            {entry.line}
          </div>
        ))}
      </div>
    </aside>
  );
}
