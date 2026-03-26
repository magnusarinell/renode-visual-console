import { useState } from "react";
import "./Daisy.css";
import {
  DAISY_PIN_LEGEND,
  DAISY_PINOUT_LEFT,
  DAISY_PINOUT_RIGHT,
} from "../../daisy-constants";

function levelClass(level) {
  return level === true ? "high" : level === false ? "low" : "floating";
}

function pinLevelClass(row, pinStates) {
  if (!row.stmPin) return "floating";
  return levelClass(pinStates[row.stmPin] ?? null);
}

// Pair: right-side pins 1-20 with left-side pins 21-40, interleaved so grid row N = (N, N+20)
const PINS_A = DAISY_PINOUT_RIGHT.slice().sort((a, b) => a.number - b.number); // 1-20
const PINS_B = DAISY_PINOUT_LEFT.slice().sort((a, b) => a.number - b.number);  // 21-40
const PAIRED_PINS = PINS_A.flatMap((p, i) => [p, PINS_B[i]]);

export function DaisySeedBoard({
  ledLevel,
  logs = [],
  pcLogs = [],
  breadboardElement,
  pinStates = {},
}) {
  const [activeTab, setActiveTab] = useState("usart1");
  return (
    <div className="daisy-outer-wrap">

      {/* ── Main column: board + components top, COM card bottom ── */}
      <div className="daisy-main-col">

        <div className="daisy-board-strip">
          {/* ── Yellow PCB board shell ── */}
          <div className="daisy-board-shell">
            <div className="daisy-pin-stack">
              {/* Left pin header: hole on outer (left) edge, label toward board */}
              <div className="header left">
                {DAISY_PINOUT_LEFT.map((row) => (
                  <div className="pin-row" key={`left-${row.number}`}>
                    <button
                      className={`pin pin-btn ${pinLevelClass(row, pinStates)} nc daisy-hw-pin`}
                      disabled
                      title={`Pin ${row.number}: ${row.pinLabel}${row.stmPin ? " · " + row.stmPin : ""}`}
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

              {/* Center board body */}
              <div className="daisy-board-body">
                <div className="daisy-chip daisy-chip-top" aria-hidden="true" />
                <span className="daisy-chip-label">ELECTROSMITH</span>
                <div className="daisy-chip daisy-chip-main">
                  <span className="daisy-chip-title">STM32H750</span>
                  <span className="daisy-chip-sub">Cortex-M7</span>
                </div>
                <span className="daisy-chip-label">DAISY SEED</span>
                <div className="daisy-chip daisy-chip-bottom" aria-hidden="true" />
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
                      className={`pin pin-btn ${pinLevelClass(row, pinStates)} nc daisy-hw-pin`}
                      disabled
                      title={`Pin ${row.number}: ${row.pinLabel}${row.stmPin ? " · " + row.stmPin : ""}`}
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

          {/* ── Floating components (pot / button / LED / OLED) ── */}
          {breadboardElement}
        </div>

        {/* ── COM card below board ── */}
        <div className="uart-card daisy-com-card">
          <div className="uart-card-header">
            <button
              className={`uart-tab-btn${activeTab === "usart1" ? " active" : ""}`}
              onClick={() => setActiveTab("usart1")}
              type="button"
            >USART1</button>
            <button
              className={`uart-tab-btn${activeTab === "debug" ? " active" : ""}`}
              onClick={() => setActiveTab("debug")}
              type="button"
            >Debug</button>
          </div>
          {activeTab === "usart1" ? (
            <div className="log-lines">
              {logs.length === 0 && <div className="empty-hint">No data yet.</div>}
              {[...logs].reverse().map((entry) => {
                const t  = new Date(entry.ts);
                const ts = `${String(t.getHours()).padStart(2,"0")}:${String(t.getMinutes()).padStart(2,"0")}:${String(t.getSeconds()).padStart(2,"0")}.${String(t.getMilliseconds()).padStart(3,"0")}`;
                return (
                  <div className="log-line uart" key={entry.id}>
                    <span className="log-ts">{ts}</span>
                    <span>{entry.line}</span>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="log-lines">
              {pcLogs.length === 0 && <div className="empty-hint">No PC data yet.</div>}
              {[...pcLogs].reverse().map((entry) => {
                const t  = new Date(entry.ts);
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

      </div>{/* /daisy-main-col */}

      {/* ── Pin legend on the right ── */}
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
