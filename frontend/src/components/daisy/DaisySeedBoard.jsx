import { useRef } from "react";
import "./Daisy.css";

const LEFT_PINS  = ["3V3","D1","D2","D3","D4","D5","D6","D7","D8","D9","D10","D11","D12","D13","D14","D15","D16","D17","D18","D19","D20","D21","D22","D23","D24","D25","D26","D27","D28","BOOT"];
const RIGHT_PINS = ["AGND","D30","D31","D32","D33","D34","D35","D36","D37","D38","D39","D40","D41","D42","D43","D44","D45","D46","D47","D48","D49","D50","D51","D52","D53","D54","D55","D56","D57","GND"];

// Known firmware-mapped pins: D-number → {STM32 label, role, badge text}
const KNOWN_PINS = {
  D33: { stmPin: "PA9",  role: "uart",   tag: "TX"  },
  D34: { stmPin: "PA10", role: "uart",   tag: "RX"  },
  D42: { stmPin: "PB3",  role: "input",  tag: "IN"  },
  D45: { stmPin: "PA15", role: "output", tag: "OUT" },
};

const POWER_PINS = new Set(["3V3", "GND", "AGND", "BOOT"]);

function levelClass(level) {
  return level === true ? "high" : level === false ? "low" : "floating";
}

function DaisyPinButton({ pin, level, selectedPin, onPinSelect, side }) {
  const known   = KNOWN_PINS[pin];
  const isPower = POWER_PINS.has(pin);
  const isGpio  = !!known;
  const lc      = isGpio ? levelClass(level) : "";
  return (
    <div className="pin-row">
      <button
        className={`pin-btn daisy-pin-btn${selectedPin === pin ? " active" : ""} ${lc}${!isGpio && !isPower ? " nc" : ""}`}
        onClick={() => isGpio && onPinSelect(pin)}
        disabled={!isGpio}
        title={known ? `${pin} / ${known.stmPin} (${known.role})` : pin}
      >
        <span className={`pin-inner daisy-pin-inner daisy-pin-${side}`}>
          <span className="pin-dot" />
          <span className="pin-name">{known ? known.stmPin : pin}</span>
          {known && <span className={`pin-role ${known.role}`}>{known.tag}</span>}
        </span>
      </button>
    </div>
  );
}

export function DaisySeedBoard({
  outputLevel,
  inputLevel,
  ledLevel,
  onButtonDown,
  onButtonUp,
  logs = [],
  onClearLogs,
  selectedPin,
  onPinSelect,
  onInjectLevel,
  onPulsePin,
}) {
  const heldRef = useRef(false);

  function handlePointerDown(e) {
    heldRef.current = true;
    onButtonDown(e);
  }
  function handlePointerUp(e) {
    if (!heldRef.current) return;
    heldRef.current = false;
    onButtonUp(e);
  }

  function getLevelForPin(dPin) {
    if (dPin === "D45") return outputLevel;  // PA15
    if (dPin === "D42") return inputLevel;   // PB3
    return null;
  }

  const btnPressed      = inputLevel === false;
  const selectedKnown   = selectedPin ? KNOWN_PINS[selectedPin] : null;
  const selectedPinWritable = selectedKnown && selectedKnown.role !== "output";

  return (
    <div className="board-with-pin-ctrl daisy-board-with-ctrl">
      <div className="board-main-column">

        {/* PCB */}
        <div className="daisy-pcb-panel">
          <div className="daisy-pcb">
            <div className="daisy-silk-top">
              <span className="daisy-brand">ELECTROSMITH</span>
              <span className="daisy-model">DAISY SEED</span>
            </div>

            <div className="daisy-body">
              {/* Left pins */}
              <div className="daisy-pins left">
                {LEFT_PINS.map((pin) => (
                  <DaisyPinButton
                    key={`L-${pin}`}
                    pin={pin}
                    level={getLevelForPin(pin)}
                    selectedPin={selectedPin}
                    onPinSelect={onPinSelect}
                    side="left"
                  />
                ))}
              </div>

              {/* Centre */}
              <div className="daisy-center">
                <div className="daisy-mcu-block">
                  <div className="daisy-mcu">
                    <span className="daisy-mcu-name">STM32H750</span>
                    <span className="daisy-mcu-sub">Cortex-M7 · 480 MHz</span>
                  </div>
                  <div className="daisy-codec">
                    <span>WM8731</span>
                    <span className="daisy-mcu-sub">Audio Codec</span>
                  </div>
                </div>

                {/* PC7 onboard LED indicator (Blink example) */}
                <div className="daisy-indicator-row">
                  <div
                    className={`daisy-led-dot red ${levelClass(ledLevel)}`}
                    title={`PC7 (onboard LED): ${ledLevel === true ? "HIGH" : ledLevel === false ? "LOW" : "FLOAT"}`}
                  />
                  <div className="daisy-ind-labels">
                    <span className="daisy-ind-pin">PC7</span>
                    <span className="daisy-ind-desc">led · onboard</span>
                  </div>
                </div>

                {/* PA15 LED indicator */}
                <div className="daisy-indicator-row">
                  <div
                    className={`daisy-led-dot ${levelClass(outputLevel)}`}
                    title={`PA15 (led0): ${outputLevel === true ? "HIGH" : outputLevel === false ? "LOW" : "FLOAT"}`}
                  />
                  <div className="daisy-ind-labels">
                    <span className="daisy-ind-pin">PA15</span>
                    <span className="daisy-ind-desc">led0 · output</span>
                  </div>
                </div>

                {/* USER button (PB3) */}
                <div className="board-button-wrap">
                  <span className="board-button-label">USER</span>
                  <button
                    className={`board-button${btnPressed ? " active" : ""}`}
                    onPointerDown={handlePointerDown}
                    onPointerUp={handlePointerUp}
                    onPointerLeave={handlePointerUp}
                    title="USER button — PB3 (GPIO_ACTIVE_LOW)"
                  />
                  <span className="board-button-label">PB3 · sw0</span>
                </div>
              </div>

              {/* Right pins */}
              <div className="daisy-pins right">
                {RIGHT_PINS.map((pin) => (
                  <DaisyPinButton
                    key={`R-${pin}`}
                    pin={pin}
                    level={getLevelForPin(pin)}
                    selectedPin={selectedPin}
                    onPinSelect={onPinSelect}
                    side="right"
                  />
                ))}
              </div>
            </div>

            <div className="daisy-silk-bottom">STM32H750IBK6 · 64 MB QSPI · 8 MB SDRAM</div>
          </div>
        </div>{/* /daisy-pcb-panel */}

        {/* COM — USART1 log */}
        <div className="uart-card daisy-com-card">
          <header>
            <div className="uart-card-title">COM</div>
            <div className="uart-filter-bar">
              <span className="daisy-com-label">USART1</span>
              <button className="uart-filter-btn clear" onClick={onClearLogs}>Clear</button>
            </div>
          </header>
          <div className="log-lines">
            {logs.length === 0 && <div className="empty-hint">No data yet.</div>}
            {[...logs].reverse().map((entry) => {
              const t  = new Date(entry.ts);
              const ts = `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}:${String(t.getSeconds()).padStart(2,"0")}.${String(t.getMilliseconds()).padStart(3,"0")}`;
              return (
                <div className="log-line" key={entry.id}>
                  <span className="log-ts">{ts}</span>
                  <span>{entry.line}</span>
                </div>
              );
            })}
          </div>
        </div>

      </div>{/* /board-main-column */}

      {/* Pin control tab */}
      <div className="pin-ctrl-tab daisy-pin-ctrl-tab">
        <div className="pin-ctrl-label">{selectedPin ?? "—"}</div>
        {selectedKnown && (
          <div className="pin-ctrl-label daisy-ctrl-stm">{selectedKnown.stmPin}</div>
        )}
        <div className="pin-ctrl-actions">
          <button
            className="pin-inject-button"
            onClick={() => selectedKnown && onInjectLevel(selectedKnown.stmPin, true)}
            disabled={!selectedPinWritable}
            title={selectedKnown ? `Set ${selectedKnown.stmPin} HIGH` : "Select an input pin"}
          >H</button>
          <button
            className="pin-inject-button"
            onClick={() => selectedKnown && onInjectLevel(selectedKnown.stmPin, false)}
            disabled={!selectedPinWritable}
            title={selectedKnown ? `Set ${selectedKnown.stmPin} LOW` : "Select an input pin"}
          >L</button>
          <button
            className="pin-inject-button pulse"
            onClick={() => selectedKnown && onPulsePin(selectedKnown.stmPin)}
            disabled={!selectedPinWritable}
            title={selectedKnown ? `Pulse ${selectedKnown.stmPin}` : "Select an input pin"}
          >P</button>
        </div>
      </div>

    </div>
  );
}
