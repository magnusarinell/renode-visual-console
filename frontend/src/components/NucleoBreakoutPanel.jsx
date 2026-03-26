import { useRef, useState } from "react";
import "./daisy/Daisy.css";

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
    onChange(next);
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
      title={`A0 · ${(value * 3.3).toFixed(2)} V`}
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
 * Breadboard-style panel with potentiometer for PA0 ADC input.
 *
 * Props:
 *   onAdc(voltage)   — send analog voltage for PA0
 *   initialAdcVolt   — starting knob voltage (default 1.65)
 *   adcReadback      — voltage read back from Renode memory (undefined = not yet available)
 */
export function NucleoBreakoutPanel({ onAdc, initialAdcVolt = 1.65, adcReadback }) {
  const [knobVal, setKnobVal] = useState(initialAdcVolt / 3.3);

  return (
    <div className="bb-comp-block">
      <div className="bb-comp-label">A0</div>
      <Knob
        value={knobVal}
        onChange={(v) => { setKnobVal(v); onAdc?.(v * 3.3); }}
      />
      <span className="bb-pin-ref" style={{ color: "#59ff6a" }}>{(knobVal * 3.3).toFixed(2)} V</span>
    </div>
  );
}
