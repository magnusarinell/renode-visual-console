import { useRef, useState } from "react";
import "./Daisy.css";

/**
 * Knob — draggable rotary potentiometer (drag up = increase).
 * onChange fires on every move (for real-time feedback).
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
 * Daisy component panel — floating components without breadboard container.
 *
 * Props:
 *   oledElement       — <OledDisplay small> (only in "oled" mode)
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

  if (mode === "blink") return null;

  return (
    <div className="daisy-component-panel">

      {/* ── OLED mode ── */}
      {mode === "oled" && (
        <div className="bb-comp-block">
          {oledElement}
        </div>
      )}

      {/* ── Button mode: tact switch on pin 35 ── */}
      {mode === "button" && (
        <div className="bb-comp-block">
          <div className="bb-comp-label-row">
            <span className="bb-comp-label">35</span>
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
            <span className="bb-comp-label">40</span>
          </div>
        </div>
      )}

      {/* ── Knob mode: pot (pin 28) + LED (pin 35) ── */}
      {mode === "knob" && (
        <>
          <div className="bb-comp-block">
            <div className="bb-comp-label">28</div>
            <Knob value={localKnob} onChange={setLocalKnob} onRelease={onKnobRelease} />
            <span className="bb-pin-ref" style={{ color: "#59ff6a" }}>{(localKnob * 3.3).toFixed(2)} V</span>
          </div>
          <div className="bb-comp-block">
            <div className="bb-comp-label-row">
              <span className="bb-comp-label">35</span>
              <div className="bb-led-housing" title={`Pin 35 duty ≈ ${Math.round(ledDuty * 100)}%`}>
                <div className="bb-led-bulb" style={{ "--led-duty": ledDuty }} />
              </div>
              <span className="bb-comp-label">40</span>
            </div>
          </div>
        </>
      )}

    </div>
  );
}

