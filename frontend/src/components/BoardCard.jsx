import { NucleoBoard } from "./NucleoBoard";
import { NucleoBreakoutPanel } from "./NucleoBreakoutPanel";

function UartCard({ combinedLogs, uartFilter, onToggleFilter, onClearLogs }) {
  const bothActive = uartFilter.usart2 && uartFilter.usart1;
  const visibleLogs = combinedLogs.filter((e) => uartFilter[e.src]);

  return (
    <aside className="uart-card">
      <header>
        <div className="uart-card-title">COM</div>
        <div className="uart-filter-bar">
          <button
            className={`uart-filter-btn usart2${uartFilter.usart2 ? " active" : ""}`}
            onClick={() => onToggleFilter("usart2")}
            title="Toggle USART2 (debug console)"
          >USART2</button>
          <button
            className={`uart-filter-btn usart1${uartFilter.usart1 ? " active" : ""}`}
            onClick={() => onToggleFilter("usart1")}
            title="Toggle USART1 (hub)"
          >USART1</button>
          <button className="uart-filter-btn clear" onClick={onClearLogs}>Clear</button>
        </div>
      </header>
      <div className="log-lines">
        {visibleLogs.length === 0 && <div className="empty-hint">No data yet.</div>}
        {[...visibleLogs].reverse().map((entry) => {
          const t = new Date(entry.ts);
          const ts = `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}:${String(t.getSeconds()).padStart(2,"0")}.${String(t.getMilliseconds()).padStart(3,"0")}`;
          return (
            <div className={`log-line uart${bothActive ? " src-" + entry.src : ""}`} key={entry.id}>
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
  uartFilter,
  onToggleFilter,
  onClearLogs,
  combinedUartLogs,
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

          {/* Breadboard panel: replaces ADC slider + PB5 quick-card */}
          <NucleoBreakoutPanel
            firmwareOutputs={firmwareOutputs}
            initialAdcVolt={voltage?.["PA0"] ?? 1.65}
            onAdc={(v) => {
              onVoltageChange("PA0", v);
              send({ type: "analog", machine: board.id, pin: "PA0", voltage: v });
            }}
          />
        </div>

        <UartCard
          board={board}
          combinedLogs={combinedUartLogs}
          uartFilter={uartFilter}
          onToggleFilter={onToggleFilter}
          onClearLogs={onClearLogs}
        />
      </div>
  );
}
