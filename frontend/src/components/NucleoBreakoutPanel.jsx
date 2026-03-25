import { useRef, useState } from "react";

const RAIL_DOTS = 8;

function HoleRow() {
  return (
    <div className="nbb-hole-row">
      {Array.from({ length: RAIL_DOTS }, (_, i) => <div key={i} className="nbb-dot" />)}
    </div>
  );
}

/** Draggable rotary knob — same mechanic as Daisy's Knob. */
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
      className="nbb-knob-wrap"
      onPointerDown={handlePointerDown}
      onPointerMove={handlePointerMove}
      onPointerUp={handlePointerUp}
      onPointerLeave={handlePointerUp}
      title={`PA0 · ${(value * 3.3).toFixed(2)} V`}
    >
      <div className="nbb-knob" style={{ transform: `rotate(${angle}deg)` }}>
        <span className="nbb-knob-dot" />
      </div>
      <div className="nbb-knob-arc">
        <div className="nbb-knob-fill" style={{ width: `${value * 100}%` }} />
      </div>
      <span className="nbb-knob-val">{(value * 3.3).toFixed(2)}V</span>
    </div>
  );
}

function levelClass(out) {
  if (!out || out.level === null) return "floating";
  return out.level ? "high" : "low";
}

/**
 * Breadboard-style panel for external connections.
 *
 * Props:
 *   firmwareOutputs  — array of { pin, level, label }
 *   onPulsePin(pin)  — trigger a HIGH pulse on gpio
 *   onAdc(voltage)   — send analog voltage for PA0
 *   initialAdcVolt   — starting knob voltage (default 1.65)
 */
export function NucleoBreakoutPanel({ firmwareOutputs, onAdc, initialAdcVolt = 1.65 }) {
  const [knobVal, setKnobVal] = useState(initialAdcVolt / 3.3);

  const pb12 = firmwareOutputs?.find((o) => o.pin === "PB12");
  const pb13 = firmwareOutputs?.find((o) => o.pin === "PB13");
  const pb14 = firmwareOutputs?.find((o) => o.pin === "PB14");

  return (
    <div className="nbb-panel">
      <div className="nbb-title">Breadboard</div>

      <div className="nbb-body">
        {/* ── Top decoration rows ── */}
        <HoleRow />
        <HoleRow />

        {/* ── Chase LED rail: PB12 / PB13 / PB14 ── */}
        <div className="nbb-component-row">
          <div className="nbb-rail nbb-rail-sig">
            {[pb12, pb13, pb14].map((out, i) => {
              const pin = ["PB12", "PB13", "PB14"][i];
              const lv = levelClass(out);
              return (
                <div key={pin} className={`nbb-led-hole ${lv}`} title={`${pin}: ${lv}`}>
                  <span className="nbb-led-inner" />
                </div>
              );
            })}
          </div>
          <div className="nbb-component-labels">
            <span className="nbb-hole-label">PB12</span>
            <span className="nbb-hole-label">PB13</span>
            <span className="nbb-hole-label">PB14</span>
          </div>
          <span className="nbb-section-label">CN7 Chase</span>
        </div>

        {/* ── Middle decoration row ── */}
        <HoleRow />

        {/* ── PA0 ADC knob ── */}
        <div className="nbb-component-row nbb-controls-row">
          <div className="nbb-control-slot">
            <Knob
              value={knobVal}
              onChange={setKnobVal}
              onRelease={(v) => onAdc?.(v * 3.3)}
            />
            <span className="nbb-section-label">PA0 · ADC</span>
          </div>
        </div>

        {/* ── Bottom decoration rows ── */}
        <HoleRow />
        <HoleRow />
      </div>
    </div>
  );
}
