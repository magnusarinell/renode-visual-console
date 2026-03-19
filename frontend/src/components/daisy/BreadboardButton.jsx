import { useState } from "react";
import "./Daisy.css";

/**
 * Simulates an external tactile button wired on a breadboard:
 *   Pin 35 (D28 / PA2)  →  button  →  Pin 40 (DGND)
 *
 * Hold-semantics: PA2 driven LOW while pointer is held, HIGH on release.
 * This matches libDaisy Switch::Pressed() which reads current pin level.
 */
export function BreadboardButton({ onDown, onUp }) {
  const [pressed, setPressed] = useState(false);

  function handlePointerDown(e) {
    e.currentTarget.setPointerCapture(e.pointerId);
    setPressed(true);
    onDown?.();
  }

  function handlePointerUp() {
    setPressed(false);
    onUp?.();
  }

  return (
    <div className="bb-panel">
      <div className="bb-title">Breadboard</div>
      <div className="bb-body">

        {/* Top rail — pin 35 / PA2 */}
        <div className="bb-rail bb-rail-top">
          <div className="bb-rail-dots">
            {[0,1,2,3,4].map((i) => <span key={i} className="bb-dot" />)}
          </div>
          <span className="bb-rail-label">
            <span className="bb-pin-num">35</span>
            <span className="bb-pin-name">D28 · PA2</span>
          </span>
        </div>

        {/* Tactile button in the center */}
        <div className="bb-center">
          <div className="bb-wire bb-wire-left" />
          <button
            className={`bb-tact${pressed ? " pressed" : ""}`}
            onPointerDown={handlePointerDown}
            onPointerUp={handlePointerUp}
            onPointerLeave={handlePointerUp}
            title="Håll ned för att trycka (PA2 → GND, active LOW)"
            type="button"
          >
            <span className="bb-tact-cap" />
            <span className="bb-tact-body" />
          </button>
          <div className="bb-wire bb-wire-right" />
        </div>

        {/* Bottom rail — pin 40 / GND */}
        <div className="bb-rail bb-rail-bottom">
          <div className="bb-rail-dots">
            {[0,1,2,3,4].map((i) => <span key={i} className="bb-dot" />)}
          </div>
          <span className="bb-rail-label">
            <span className="bb-pin-num">40</span>
            <span className="bb-pin-name">DGND</span>
          </span>
        </div>

      </div>
    </div>
  );
}
