import { useState } from "react";
import { NucleoBoard } from "./NucleoBoard";
import { NucleoBreakoutPanel } from "./NucleoBreakoutPanel";

function UartCard({ logs, onClearLogs, pcLogs, onClearPcLogs }) {
  const [activeTab, setActiveTab] = useState("usart2");
  return (
    <div className="uart-card">
      <div className="uart-card-header">
        <button
          className={`uart-tab-btn${activeTab === "usart2" ? " active" : ""}`}
          onClick={() => setActiveTab("usart2")}
        >USART2</button>
        <button
          className={`uart-tab-btn${activeTab === "debug" ? " active" : ""}`}
          onClick={() => setActiveTab("debug")}
        >Debug</button>
        <div className="uart-filter-bar">
          <button
            className="uart-filter-btn clear"
            onClick={activeTab === "usart2" ? onClearLogs : onClearPcLogs}
          >Clear</button>
        </div>
      </div>
      {activeTab === "usart2" ? (
        <div className="log-lines">
          {logs.length === 0 && <div className="empty-hint">No data yet.</div>}
          {[...logs].reverse().map((entry) => {
            const t = new Date(entry.ts);
            const ts = `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}:${String(t.getSeconds()).padStart(2,"0")}.${String(t.getMilliseconds()).padStart(3,"0")}`;
            return (
              <div className="log-line uart" key={entry.id}>
                <span className="log-ts">{ts}</span><span>{entry.line}</span>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="log-lines">
          {pcLogs.length === 0 && <div className="empty-hint">No PC data yet.</div>}
          {[...pcLogs].reverse().map((entry) => {
            const t = new Date(entry.ts);
            const ts = `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}:${String(t.getSeconds()).padStart(2,"0")}.${String(t.getMilliseconds()).padStart(3,"0")}`;
            return (
              <div className="log-pc-line log-line" key={entry.id}>
                <span className="log-ts">{ts}</span>
                {entry.file && <span className="log-pc-file">{entry.file.split("/").pop()}:{entry.line}</span>}
                {entry.func && <span className="log-pc-func">{entry.func}</span>}
                <span className="log-pc-addr">{entry.pc}</span>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

export function BoardCard({
  board,
  pinStates,
  firmwareOutputs,
  onClearLogs,
  uartLogs,
  pcLogs,
  onClearPcLogs,
  voltage,
  onVoltageChange,
  send,
  onBoardButton,
}) {
  return (
    <div className="board-main-column">
        {/* Board label + SVG visual (no green card wrapper) */}
        <div className="nucleo-board-section">
          <div className="board-shell-label">NUCLEO F411RE · {board.id}</div>
          <div className="nucleo-strip">
            <NucleoBoard
              firmwareOutputs={firmwareOutputs}
              pinStates={pinStates}
              onBoardButton={onBoardButton}
            />
          </div>


        </div>
          {/* Breadboard panel: replaces ADC slider + PB5 quick-card */}
          <NucleoBreakoutPanel
            initialAdcVolt={voltage?.["PA0"] ?? 1.65}
            onAdc={(v) => {
              onVoltageChange("PA0", v);
              send({ type: "analog", machine: board.id, pin: "PA0", voltage: v });
            }}
          />
        <UartCard
          logs={uartLogs}
          onClearLogs={onClearLogs}
          pcLogs={pcLogs}
          onClearPcLogs={onClearPcLogs}
        />
      </div>
  );
}
