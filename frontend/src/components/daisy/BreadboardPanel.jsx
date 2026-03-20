import { useRef, useState } from "react";
import "./Daisy.css";

/**
 * Knob — draggable rotary potentiometer (drag up = increase).
 * onChange fires on every move (for real-time PWM ring feedback).
 * onRelease fires only on pointer-up (for WebSocket ADC send).
 */
function Knob({ value, onChange, onRelease }) {
  const dragRef = useRef(null);

  function handlePointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    dragRef.current = { startY: e.clientY, startVal: value };
  }

  function handlePointerMove(e) {
    if (!dragRef.current) return;
    const dy = dragRef.current.startY - e.clientY;
    const next = Math.max(0, Math.min(1, dragRef.current.startVal + dy / 80));
    onChange?.(next);
  }

  function handlePointerUp() {
    if (!dragRef.current) return;
    dragRef.current = null;
    onRelease?.(value);
  }

  const angle = -135 + value * 270;

  return (
    <div
      className="bb-knob-wrap"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
    >
      <div className="bb-knob" style={{ transform: `rotate(${angle}deg)` }}>
        <span className="bb-knob-dot" />
      </div>
      <div className="bb-knob-arc">
        <div className="bb-knob-fill" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

/**
 * Combined breadboard panel for Daisy Seed external components.
 *
 * Props:
 *   oledElement       — <OledDisplay small> to embed at top of panel
 *   onDown()          — PA2 driven LOW (button held)
 *   onUp()            — PA2 released HIGH
 *   onKnobRelease(v)  — fires on pointer-up only (triggers WebSocket ADC send)
 *   ledDuty           — 0–1 rolling average of PA2 GPIO samples → LED brightness
 *   mode              — "knob" (pot + LED) | "button" (tact switch only)
 */
export function BreadboardPanel({ oledElement, onDown, onUp, onKnobRelease, ledDuty = 0, mode = "knob" }) {
  const [pressed, setPressed] = useState(false);
  const [localKnob, setLocalKnob] = useState(0);

  function handlePointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressed(true);
    onDown?.();
  }

  function handlePointerUp() {
    if (!pressed) return;
    setPressed(false);
    onUp?.();
  }

  function handleKnobChange(v) {
    setLocalKnob(v);
  }

  return (
    <div className="bb-panel">
      <div className="bb-title">Breadboard</div>

      {/* ── Embedded OLED display ─────────────────────── */}
      {oledElement && (
        <div className="bb-oled-slot">
          {oledElement}
          <div className="bb-oled-conn">
            <span className="bb-pin-ref"><em>OLED</em> SSD1306</span>
          </div>
        </div>
      )}

      <div className="bb-components">

        {/* ── Tact switch (button mode only) ───────────── */}
        {mode === "button" && <div className="bb-comp">
          <div className="bb-comp-label">Tact Switch</div>
          <div className="bb-center">
            <div className="bb-wire bb-wire-left" />
            <button
              className={`bb-tact${pressed ? " pressed" : ""}`}
              onPointerDown={handlePointerDown}
              onPointerUp={handlePointerUp}
              onPointerLeave={handlePointerUp}
              type="button"
            >
              <span className="bb-tact-cap" />
              <span className="bb-tact-body" />
            </button>
            <div className="bb-wire bb-wire-right" />
          </div>
          <div className="bb-comp-pins">
            <span className="bb-pin-ref"><em>D28</em> input</span>
            <span className="bb-pin-ref"><em>GND</em></span>
          </div>
        </div>}

        {/* ── Potentiometer (knob mode only) ──────────── */}
        {mode === "knob" && <div className="bb-comp">
          <div className="bb-comp-label">Pot</div>
          <Knob value={localKnob} onChange={handleKnobChange} onRelease={onKnobRelease} />
          <div className="bb-comp-pins">
            <span className="bb-pin-ref">3V3</span>
            <span className="bb-pin-ref"><em>D21</em> wiper</span>
            <span className="bb-pin-ref">GND</span>
          </div>
        </div>}

        {/* ── LED indicator (knob mode only) ───────────── */}
        {/* Brightness = rolling average of sampled D28 (PA2) GPIO state */}
        {mode === "knob" && <div className="bb-comp">
          <div className="bb-comp-label">LED</div>
          <div className="bb-led-housing" title={`D28 duty ≈ ${Math.round(ledDuty * 100)}%`}>
            <div className="bb-led-bulb" style={{ "--led-duty": ledDuty }} />
          </div>
          <div className="bb-comp-pins">
            <span className="bb-pin-ref"><em>D28</em> output</span>
            <span className="bb-pin-ref">GND</span>
          </div>
        </div>}

      </div>
    </div>
  );
}
