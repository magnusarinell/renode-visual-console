import { useRef, useState } from "react";
import "./Daisy.css";

const RAIL_DOTS = 12;

/** Single row of breadboard holes (decoration for blink/empty mode). */
function HoleRow() {
  return (
    <div className="bb-hole-row">
      {Array.from({ length: RAIL_DOTS }, (_, i) => <div key={i} className="bb-dot" />)}
    </div>
  );
}

/**
 * Full-width breadboard pin row.
 * variant: "vcc" (red) | "gnd" (blue) | "sig" (grey)
 */
function PinRow({ pinNum, variant }) {
  return (
    <div className={`bb-rail bb-rail-${variant}`}>
      <span className="bb-pin-num">{pinNum}</span>
      <div className="bb-rail-dots">
        {Array.from({ length: RAIL_DOTS }, (_, i) => <div key={i} className="bb-dot" />)}
      </div>
    </div>
  );
}

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
 *   oledElement       — <OledDisplay small> (only shown in "oled" mode)
 *   onDown()          — PA2 driven LOW (button held)
 *   onUp()            — PA2 released HIGH
 *   onKnobRelease(v)  — fires on pointer-up only (triggers WebSocket ADC send)
 *   ledDuty           — 0–1 rolling average of PA2 GPIO samples → LED brightness
 *   mode              — "knob" | "button" | "oled" | "blink"
 */
export function BreadboardPanel({ oledElement, onDown, onUp, onKnobRelease, ledDuty = 0, mode = "blink" }) {
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

      {/* ── OLED mode: only the display, no components ───── */}
      {mode === "oled" && (
        <div className="bb-oled-slot">
          {oledElement}
          <div className="bb-oled-conn">
            <span className="bb-pin-ref"><em>OLED</em> SSD1306 · I²C</span>
          </div>
        </div>
      )}

      {/* ── Blink mode: empty board (just hole rows) ─────── */}
      {mode === "blink" && (
        <div className="bb-body">
          <HoleRow />
          <HoleRow />
          <HoleRow />
        </div>
      )}

      {/* ── Button mode: tact switch, pin 35 (grey) → GND (40) ── */}
      {mode === "button" && (
        <div className="bb-body">
          <PinRow pinNum={35} variant="sig" />
          <div className="bb-comp-block">
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
          </div>
          <PinRow pinNum={40} variant="gnd" />
        </div>
      )}

      {/* ── Knob mode: pot rows (21/28/20) then LED rows (35/40) ── */}
      {mode === "knob" && (
        <div className="bb-body">
          {/* Pot section */}
          <PinRow pinNum={21} variant="vcc" />
          <div className="bb-comp-block">
            <div className="bb-comp-label">Pot</div>
            <Knob value={localKnob} onChange={handleKnobChange} onRelease={onKnobRelease} />
          </div>
          <PinRow pinNum={28} variant="sig" />
          <PinRow pinNum={20} variant="gnd" />

          <div className="bb-section-gap" />

          {/* LED section */}
          <PinRow pinNum={35} variant="sig" />
          <div className="bb-comp-block">
            <div className="bb-comp-label">LED</div>
            <div className="bb-led-housing" title={`pin 35 duty ≈ ${Math.round(ledDuty * 100)}%`}>
              <div className="bb-led-bulb" style={{ "--led-duty": ledDuty }} />
            </div>
          </div>
          <PinRow pinNum={40} variant="gnd" />
        </div>
      )}
    </div>
  );
}
