import "../daisy/Daisy.css";

function HoleRow({ count = 5 }) {
  return (
    <div className="bb-hole-row">
      <div className="bb-hole-group">
        {Array.from({ length: count }).map((_, i) => (
          <span key={`l-${i}`} className="bb-hole" />
        ))}
      </div>
      <div className="bb-hole-gap" />
      <div className="bb-hole-group">
        {Array.from({ length: count }).map((_, i) => (
          <span key={`r-${i}`} className="bb-hole" />
        ))}
      </div>
    </div>
  );
}

export function Esp32C3Breadboard({ mode = "hello", ledLevel = null }) {
  const ledOn = mode === "blink" ? !!ledLevel : false;

  return (
    <div className="bb-panel">
      <h4>Breadboard View</h4>

      <div className="bb-stage" style={{ minHeight: "500px" }}>
        <div className="bb-label">ESP32-C3 DevKit-M1</div>
        <div className="bb-mini-muted">GPIO5 drives the virtual LED in blink firmware.</div>

        <div className="bb-led-stack" style={{ marginTop: 10, marginBottom: 14 }}>
          <div className="bb-led-caption">GPIO5</div>
          <div className={`bb-led ${ledOn ? "on" : "off"}`} />
          <div className="bb-mini-muted">{mode === "blink" ? (ledOn ? "ON" : "OFF") : "idle"}</div>
        </div>

        <HoleRow count={5} />
        <HoleRow count={5} />
        <HoleRow count={5} />

        {mode === "hello" && (
          <div className="bb-mini-muted" style={{ marginTop: 8 }}>
            hello_world prints UART logs only.
          </div>
        )}
      </div>
    </div>
  );
}
