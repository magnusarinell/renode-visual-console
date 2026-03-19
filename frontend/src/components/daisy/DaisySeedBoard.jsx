import "./Daisy.css";
import {
  DAISY_INPUT_PIN,
  DAISY_PIN_LEGEND,
  DAISY_PINOUT_LEFT,
  DAISY_PINOUT_RIGHT,
  DAISY_SIGNAL_CARDS,
} from "../../daisy-constants";

function levelClass(level) {
  return level === true ? "high" : level === false ? "low" : "floating";
}

function DaisyPinCtrlTab({ selectedSignal, selectedPinWritable, onInjectLevel, onPulsePin }) {
  const canDriveSignal =
    selectedPinWritable &&
    typeof onInjectLevel === "function" &&
    typeof onPulsePin === "function";
  return (
    <div className="pin-ctrl-tab daisy-pin-ctrl-tab">
      <div className="pin-ctrl-label">{selectedSignal.alias}</div>
      <div className="pin-ctrl-label daisy-ctrl-stm">{selectedSignal.stmPin}</div>
      <div className="pin-ctrl-actions">
        <button
          className="pin-inject-button"
          onClick={() => onInjectLevel?.(selectedSignal.stmPin, true)}
          disabled={!canDriveSignal}
          title={`Set ${selectedSignal.stmPin} HIGH`}
          type="button"
        >H</button>
        <button
          className="pin-inject-button"
          onClick={() => onInjectLevel?.(selectedSignal.stmPin, false)}
          disabled={!canDriveSignal}
          title={`Set ${selectedSignal.stmPin} LOW`}
          type="button"
        >L</button>
        <button
          className="pin-inject-button pulse"
          onClick={() => onPulsePin?.(selectedSignal.stmPin)}
          disabled={!canDriveSignal}
          title={`Pulse ${selectedSignal.stmPin}`}
          type="button"
        >P</button>
      </div>
    </div>
  );
}

// Pair: right-side pins 1-20 with left-side pins 21-40, interleaved so grid row N = (N, N+20)
const PINS_A = DAISY_PINOUT_RIGHT.slice().sort((a, b) => a.number - b.number); // 1-20
const PINS_B = DAISY_PINOUT_LEFT.slice().sort((a, b) => a.number - b.number);  // 21-40
const PAIRED_PINS = PINS_A.flatMap((p, i) => [p, PINS_B[i]]);

export function DaisySeedBoard({
  ledLevel,
  logs = [],
  onClearLogs,
  selectedPin,
  onInjectLevel,
  onPulsePin,
  oledElement,
  breadboardElement,
}) {
  const activeSignalPin = selectedPin ?? DAISY_INPUT_PIN;
  const selectedSignal  = DAISY_SIGNAL_CARDS.find((s) => s.stmPin === activeSignalPin)
    ?? DAISY_SIGNAL_CARDS[0];
  const selectedPinWritable = selectedSignal.role === "input";

  return (
    <div className="daisy-outer-wrap">
      <div className="board-with-pin-ctrl daisy-board-with-ctrl">
        <div className="board-main-column">

        {/* ── Yellow PCB board shell — single visual board ── */}
        <div className="daisy-board-shell">
          <div className="daisy-pin-stack">
            {/* Left pin header: hole on outer (left) edge, label toward board */}
            <div className="header left">
              {DAISY_PINOUT_LEFT.map((row) => (
                <div className="pin-row" key={`left-${row.number}`}>
                  <button
                    className="pin pin-btn floating nc daisy-hw-pin"
                    disabled
                    title={`Pin ${row.number}: ${row.pinLabel}`}
                    type="button"
                  >
                    <span className="daisy-pin-inner-left">
                      <span className="daisy-pin-hole">{row.number}</span>
                      <span className="pin-name">{row.pinLabel}</span>
                    </span>
                  </button>
                </div>
              ))}
            </div>

            {/* Center board body: chips + signal pills + USER button + USB */}
            <div className="daisy-board-body">
              {/* Power chip — no text */}
              <div className="daisy-chip daisy-chip-top" aria-hidden="true" />

              <span className="daisy-chip-label">ELECTROSMITH</span>

              {/* Main MCU chip */}
              <div className="daisy-chip daisy-chip-main">
                <span className="daisy-chip-title">STM32H750</span>
                <span className="daisy-chip-sub">Cortex-M7</span>
              </div>

              <span className="daisy-chip-label">DAISY SEED</span>

              {/* Audio + SDRAM chip — no text */}
              <div className="daisy-chip daisy-chip-bottom" aria-hidden="true" />

              {/* Onboard LED + USB connector at board bottom */}
              <div className="daisy-bottom-row">
                <div
                  className={`daisy-onboard-led ${levelClass(ledLevel)}`}
                  title={`PC7 onboard LED · ${ledLevel === true ? "ON" : ledLevel === false ? "OFF" : "?"}`}
                  aria-label="Onboard LED PC7"
                />
                <div className="daisy-usb-port" aria-hidden="true" />
              </div>
            </div>

            {/* Right pin header: label toward board, hole on outer (right) edge */}
            <div className="header right">
              {DAISY_PINOUT_RIGHT.map((row) => (
                <div className="pin-row" key={`right-${row.number}`}>
                  <button
                    className="pin pin-btn floating nc daisy-hw-pin"
                    disabled
                    title={`Pin ${row.number}: ${row.pinLabel}`}
                    type="button"
                  >
                    <span className="daisy-pin-inner-right">
                      <span className="pin-name">{row.pinLabel}</span>
                      <span className="daisy-pin-hole">{row.number}</span>
                    </span>
                  </button>
                </div>
              ))}
            </div>
          </div>

        </div>

        {/* ── COM card ── */}
        <div className="uart-card daisy-com-card">
          <header>
            <div className="uart-card-title">COM</div>
            <div className="uart-filter-bar">
              <span className="daisy-com-label">USART1</span>
              <button className="uart-filter-btn clear" onClick={onClearLogs} type="button">Clear</button>
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

      </div>

        <DaisyPinCtrlTab
          selectedSignal={selectedSignal}
          selectedPinWritable={selectedPinWritable}
          onInjectLevel={onInjectLevel}
          onPulsePin={onPulsePin}
        />
      </div>

      {oledElement && breadboardElement ? (
        <div className="daisy-center-column">
          {oledElement}
          {breadboardElement}
        </div>
      ) : (
        oledElement || breadboardElement || null
      )}

      <div className="daisy-info-column">
        <div className="daisy-badge-panel">
          <div className="daisy-pinlist">
            {PAIRED_PINS.map((row) => (
              <div key={row.number} className="daisy-pinlist-row">
                <span className="daisy-pinlist-num">{row.number}</span>
                <span className="daisy-pinlist-label">{row.pinLabel}</span>
                <span className="daisy-pinlist-badges">
                  {row.badges.map((b) => (
                    <span key={b.label} className={`daisy-row-badge ${b.tone}`}>{b.label}</span>
                  ))}
                </span>
              </div>
            ))}
          </div>
        </div>

        <div className="daisy-legend-panel">
          {DAISY_PIN_LEGEND.map((item) => (
            <span key={item.tone} className={`daisy-row-badge ${item.tone}`}>
              {item.label}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
