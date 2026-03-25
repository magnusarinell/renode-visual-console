import { NucleoBoard } from "./NucleoBoard";
import { NucleoBreakoutPanel } from "./NucleoBreakoutPanel";

function UartCard({ logs, onClearLogs }) {
  return (
    <aside className="uart-card">
      <header>
        <div className="uart-card-title">COM · USART2</div>
        <div className="uart-filter-bar">
          <button className="uart-filter-btn clear" onClick={onClearLogs}>Clear</button>
        </div>
      </header>
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
    </aside>
  );
}

export function BoardCard({
  board,
  pinStates,
  firmwareOutputs,
  onClearLogs,
  uartLogs,
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
        />
      </div>
  );
}
