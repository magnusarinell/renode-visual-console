import "./Esp32C3.css";

export function Esp32C3Board({ logs, onClearLogs }) {
  return (
    <div className="esp32c3-outer-wrap">
      {/* ── Board ── */}
      <div className="esp32c3-board-column">
        <div className="esp32c3-board-shell">
          <svg
            viewBox="0 0 170 290"
            width="170"
            height="290"
            style={{ display: "block" }}
          >
            {/* PCB body — dark navy/black */}
            <rect x="8" y="8" width="154" height="274" rx="6" ry="6" fill="#0e1522" stroke="#1e2d48" strokeWidth="1.5" />

            {/* Silkscreen PCB outline line */}
            <rect x="12" y="12" width="146" height="266" rx="4" ry="4" fill="none" stroke="#192640" strokeWidth="0.8" />

            {/* Blue stripe at top (antenna area) */}
            <rect x="8" y="8" width="154" height="50" rx="6" ry="6" fill="#0d1e3a" stroke="none" />
            <rect x="8" y="48" width="154" height="5" fill="#0e1522" stroke="none" />

            {/* Antenna (castellated PCB stub with trace) */}
            <rect x="42" y="10" width="86" height="34" rx="3" fill="#0a1428" stroke="#1e3462" strokeWidth="1" />
            <text x="85" y="34" textAnchor="middle" fill="#1e4070" fontSize="7" fontWeight="bold" fontFamily="monospace">╔══ ANTENNA ══╗</text>

            {/* Espressif logo area / module text */}
            <text x="85" y="58" textAnchor="middle" fill="#334a70" fontSize="5.5" fontFamily="monospace">ESPRESSIF</text>

            {/* Main module (metal shield — slightly lighter than PCB) */}
            <rect x="30" y="64" width="110" height="120" rx="3" fill="#121b2c" stroke="#1e3060" strokeWidth="1.2" />
            {/* Module inner detail lines (suggest metal casing texture) */}
            <rect x="33" y="67" width="104" height="114" rx="2" fill="none" stroke="#182440" strokeWidth="0.6" />

            {/* ESP32-C3 chip (slightly indented) */}
            <rect x="55" y="100" width="60" height="60" rx="3" fill="#0d141e" stroke="#1a2840" strokeWidth="1" />
            <text x="85" y="127" textAnchor="middle" fill="#2a4878" fontSize="8" fontWeight="bold" fontFamily="monospace">ESP32-C3</text>
            <text x="85" y="139" textAnchor="middle" fill="#1e3460" fontSize="6" fontFamily="monospace">RISC-V</text>
            <text x="85" y="149" textAnchor="middle" fill="#1e3460" fontSize="5" fontFamily="monospace">RV32IMC</text>

            {/* Module label */}
            <text x="85" y="192" textAnchor="middle" fill="#2a4878" fontSize="6" fontFamily="monospace">ESP32-C3-WROOM-02</text>

            {/* Left pin headers — 15 pins each side, golden/brass colored */}
            {Array.from({ length: 15 }, (_, i) => (
              <g key={`lh${i}`}>
                {/* PCB pad */}
                <rect x="4" y={70 + i * 14} width="12" height="8" rx="1" fill="#8b6914" stroke="#6b4f10" strokeWidth="0.5" />
                {/* Pin hole */}
                <circle cx="10" cy={74 + i * 14} r="1.5" fill="#3a2c08" />
              </g>
            ))}
            {/* Right pin headers */}
            {Array.from({ length: 15 }, (_, i) => (
              <g key={`rh${i}`}>
                <rect x="154" y={70 + i * 14} width="12" height="8" rx="1" fill="#8b6914" stroke="#6b4f10" strokeWidth="0.5" />
                <circle cx="160" cy={74 + i * 14} r="1.5" fill="#3a2c08" />
              </g>
            ))}

            {/* Reset button (EN) */}
            <rect x="14" y="215" width="16" height="12" rx="2" fill="#1a2a44" stroke="#2a4060" strokeWidth="1" />
            <rect x="18" y="217" width="8" height="8" rx="1.5" fill="#243a58" stroke="#3a5a80" strokeWidth="0.8" />
            <text x="22" y="235" textAnchor="middle" fill="#2a4060" fontSize="5" fontFamily="monospace">EN</text>

            {/* GPIO9 / BOOT button */}
            <rect x="140" y="215" width="16" height="12" rx="2" fill="#1a2a44" stroke="#2a4060" strokeWidth="1" />
            <rect x="144" y="217" width="8" height="8" rx="1.5" fill="#243a58" stroke="#3a5a80" strokeWidth="0.8" />
            <text x="148" y="235" textAnchor="middle" fill="#2a4060" fontSize="5" fontFamily="monospace">IO9</text>

            {/* LED marker (GPIO2 / onboard LED) */}
            <circle cx="85" cy="245" r="4" fill="#1a3a1a" stroke="#2a6a2a" strokeWidth="1" />
            <text x="85" y="260" textAnchor="middle" fill="#2a5a2a" fontSize="5" fontFamily="monospace">LED</text>

            {/* USB-C connector */}
            <rect x="62" y="268" width="46" height="13" rx="4" fill="#1c1c24" stroke="#3a3a50" strokeWidth="1.2" />
            <rect x="68" y="271" width="34" height="7" rx="2" fill="#141418" stroke="#28284a" strokeWidth="0.8" />
            <text x="85" y="278" textAnchor="middle" fill="#2a2a44" fontSize="5.5" fontFamily="monospace">USB-C</text>

            {/* Board label at bottom */}
            <text x="85" y="288" textAnchor="middle" fill="#1a2a40" fontSize="5" fontFamily="monospace">ESP32-C3-DevKitM-1</text>
          </svg>
        </div>
      </div>

      {/* ── COM panel — to the right, styled like Daisy/Discovery ── */}
      <div className="esp32c3-com-column">
        <div className="uart-card esp32c3-com-card">
          <header>
            <div className="uart-card-title">COM</div>
            <div className="uart-filter-bar">
              <span className="esp32c3-com-label">UART0</span>
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
    </div>
  );
}

