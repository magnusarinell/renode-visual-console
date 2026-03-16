import { BOARDS, BOARD_LED_ORDER, FIRMWARE_PIN_PROFILE, PIN_ROWS, isGpioPin, roleTag } from "../constants";

function LedBank({ boardId, firmwareOutputs }) {
  const solo   = firmwareOutputs.filter((o) => o.pin === "PD12");
  const others = firmwareOutputs.filter((o) => o.pin !== "PD12");

  function LedItem({ out }) {
    const level = out.level === true ? "high" : out.level === false ? "low" : "floating";
    return (
      <div className="board-led-item">
        <span
          className={`board-led ${out.pin.toLowerCase()} ${level}`}
          title={`${out.label}: ${out.level === null ? "FLOAT" : out.level ? "HIGH" : "LOW"}`}
        />
        <span className={`board-led-label ${out.pin.toLowerCase()}`}>{out.label}</span>
      </div>
    );
  }

  return (
    <>
      <div className="board-led-solo">
        {solo.map((out) => <LedItem key={`${boardId}-${out.pin}`} out={out} />)}
      </div>
      <div className="board-led-bank">
        {others.map((out) => <LedItem key={`${boardId}-${out.pin}`} out={out} />)}
      </div>
    </>
  );
}

function PinHeader({ side, boardId, pinStates, selectedPin, onPinSelect }) {
  const pins = PIN_ROWS.map((row) => side === "left" ? row[0] : row[1]);
  return (
    <div className={`header ${side}`}>
      {pins.map((pin) => {
        const pinValid = isGpioPin(pin);
        const role = pinValid ? (pinStates[pin]?.role || "io") : "io";
        const level = pinStates[pin]?.level;
        return (
          <div className="pin-row" key={`${boardId}-${side}-pin-${pin}`}>
            <button
              className={`pin pin-btn ${selectedPin === pin ? "active" : ""} ${
                level === true ? "high" : level === false ? "low" : "floating"
              } ${pinValid ? "" : "nc"}`}
              onClick={() => onPinSelect(pin)}
              title={pinValid ? `${pin} (${role})` : `${pin} (not mapped)`}
              disabled={!pinValid}
            >
              <span className="pin-inner">
                <span className="pin-dot" />
                <span className="pin-name">{pin}</span>
                <span className={`pin-role ${role}`}>{roleTag(role)}</span>
              </span>
            </button>
          </div>
        );
      })}
    </div>
  );
}

function UartCard({ board, combinedLogs, uartFilter, onToggleFilter, onClearLogs }) {
  const bothActive = uartFilter.usart2 && uartFilter.usart3;
  const visibleLogs = combinedLogs.filter((e) => uartFilter[e.src]);

  return (
    <aside className="uart-card">
      <header>
        <div className="uart-card-title">COM</div>
        <div className="uart-filter-bar">
          <button
            className={`uart-filter-btn usart3${uartFilter.usart3 ? " active" : ""}`}
            onClick={() => onToggleFilter("usart3")}
            title="Toggle USART3 (debug)"
          >USART3</button>
          <button
            className={`uart-filter-btn usart2${uartFilter.usart2 ? " active" : ""}`}
            onClick={() => onToggleFilter("usart2")}
            title="Toggle USART2 (hub)"
          >USART2</button>
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

function PinCtrlTab({ board, pinStates, selectedPin, voltage, analogActive, selectedPinIsAdc, selectedPinWritable, onInjectLevel, onPulsePin, onToggleAnalog, onVoltageChange, onAnalogCommit }) {
  return (
    <div className={`pin-ctrl-tab${analogActive && selectedPinIsAdc ? " analog-open" : ""}`}>
      <div className="pin-ctrl-label">{selectedPin}</div>
      <div className="pin-ctrl-actions">
        <button
          className="pin-inject-button"
          onClick={() => onInjectLevel(selectedPin, true)}
          disabled={!selectedPinWritable}
          title={`Set ${selectedPin} HIGH`}
        >H</button>
        <button
          className="pin-inject-button"
          onClick={() => onInjectLevel(selectedPin, false)}
          disabled={!selectedPinWritable}
          title={`Set ${selectedPin} LOW`}
        >L</button>
        <button
          className="pin-inject-button pulse"
          onClick={() => onPulsePin(selectedPin)}
          disabled={!selectedPinWritable}
          title={`Pulse ${selectedPin}`}
        >P</button>
        <button
          className={`pin-inject-button adc-btn${analogActive && selectedPinIsAdc ? " active" : ""}`}
          onClick={onToggleAnalog}
          disabled={!selectedPinIsAdc}
          title={selectedPinIsAdc ? `Set analog voltage on ${selectedPin}` : "Select an ADC pin"}
        >A</button>
      </div>
      {analogActive && selectedPinIsAdc && (
        <div className="analog-slider-wrap">
          <span className="analog-vval">{voltage.toFixed(2)}V</span>
          <input
            type="range"
            className="analog-slider"
            min="0" max="3.3" step="0.05"
            value={voltage}
            orient="vertical"
            onChange={(e) => onVoltageChange(selectedPin, parseFloat(e.target.value))}
            onPointerUp={(e) => onAnalogCommit(selectedPin, parseFloat(e.target.value))}
          />
          <span className="analog-vmin">0V</span>
        </div>
      )}
    </div>
  );
}

export function BoardCard({
  board,
  pinStates,
  selectedPin,
  onPinSelect,
  firmwareOutputs,
  uartFilter,
  onToggleFilter,
  onClearLogs,
  combinedUartLogs,
  voltage,            // voltageByBoard[board.id] = { [pin]: number }
  onVoltageChange,    // (pin, value) => void
  analogActive,
  onToggleAnalog,
  send,
  onPulsePin,         // (pin) => void
  onInjectLevel,      // (pin, level) => void
  onBoardButton,
}) {
  const selectedPinRole     = pinStates[selectedPin]?.role || "io";
  const selectedPinWritable = isGpioPin(selectedPin) && selectedPinRole !== "output";
  const selectedPinIsAdc    = selectedPinRole === "adc";
  const selectedVoltage     = voltage?.[selectedPin] ?? 1.65;

  return (
    <div className="board-with-pin-ctrl">
      <div className="board-main-column">
        <div className="board-pcb-panel">
          <article className="board-shell">
            <div className="board-silk">STM32F4 DISCOVERY · {board.id}</div>
            <div className="pin-stack">
              <PinHeader side="left" boardId={board.id} pinStates={pinStates} selectedPin={selectedPin} onPinSelect={onPinSelect} />
              <div className="board-core-row">
                <LedBank boardId={board.id} firmwareOutputs={firmwareOutputs} />
                <div className="chip mcu">
                  <span className="chip-title">STM32F407</span>
                  <span className="chip-sub">Cortex-M4</span>
                </div>
                <div className="board-button-wrap">
                  <button className="board-button" onClick={onBoardButton} title="B1 USER" />
                  <span className="board-button-label">B1 USER</span>
                </div>
              </div>
              <PinHeader side="right" boardId={board.id} pinStates={pinStates} selectedPin={selectedPin} onPinSelect={onPinSelect} />
            </div>
          </article>

          <div className="board-breakaway" />

          {/* Quick-access sub-board: PA1 ADC slider + PB5 pulse */}
          <div className="board-quick-card">
            <div className="quick-slot">
              <span className="quick-label">PA1 · ADC</span>
              <div className="quick-adc-row">
                <span className="quick-vmin">0V</span>
                <input
                  type="range"
                  className="quick-slider"
                  min="0" max="3.3" step="0.05"
                  value={voltage?.["PA1"] ?? 1.65}
                  onChange={(e) => onVoltageChange("PA1", parseFloat(e.target.value))}
                  onPointerUp={(e) => send({ type: "analog", machine: board.id, pin: "PA1", voltage: parseFloat(e.target.value) })}
                />
                <span className="quick-vval">{(voltage?.["PA1"] ?? 1.65).toFixed(2)}V</span>
              </div>
            </div>
            <div className="quick-divider" />
            <div className="quick-slot">
              <span className="quick-label">PB5</span>
              <button
                className="pin-inject-button pulse quick-pulse-btn"
                onClick={() => onPulsePin("PB5")}
                title="Pulse PB5"
              >PULSE</button>
            </div>
          </div>
        </div>{/* /board-pcb-panel */}

        <UartCard
          board={board}
          combinedLogs={combinedUartLogs}
          uartFilter={uartFilter}
          onToggleFilter={onToggleFilter}
          onClearLogs={onClearLogs}
        />
      </div>

      <PinCtrlTab
        board={board}
        pinStates={pinStates}
        selectedPin={selectedPin}
        voltage={selectedVoltage}
        analogActive={analogActive}
        selectedPinIsAdc={selectedPinIsAdc}
        selectedPinWritable={selectedPinWritable}
        onInjectLevel={onInjectLevel}
        onPulsePin={onPulsePin}
        onToggleAnalog={onToggleAnalog}
        onVoltageChange={onVoltageChange}
        onAnalogCommit={(pin, v) => send({ type: "analog", machine: board.id, pin, voltage: v })}
      />
    </div>
  );
}
