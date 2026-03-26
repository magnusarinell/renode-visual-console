import nucleoSvg from "../assets/nucleo_board.svg";

// Original SVG: W=237.129, H=198.24
// Displayed after 90° CW rotation.
// Transform on <image>: translate(H, 0) rotate(90)
//   rotate(90) maps (x,y) → (-y, x)
//   translate(H, 0) shifts → (H - y, x)
// New viewBox: "0 0 H W" = "0 0 198.24 237.129"
//
// Coordinate mapping from original (orig_x, orig_y) to rotated canvas (rx, ry):
//   rx = ORIG_H - orig_y
//   ry = orig_x
//
// Key positions recalculated:
//   NRST button:  orig=(87.33, 76.22)   → rot=(198.24-76.22, 87.33)  = (122.02, 87.33)
//   B1 USER:      orig=(87.33, 126.56)  → rot=(198.24-126.56, 87.33) = (71.68, 87.33)
//   D13 pin (PA5): orig=(124.92, 30.76) → rot=(198.24-30.76, 124.92) = (167.48, 124.92)
//   D4 pin (PB5):  orig=(194.04, 30.76) → rot=(198.24-30.76, 194.04) = (167.48, 194.04)
//
// Right-side Arduino pins at orig_y=30.76 (18 pins, pitch 7.2).
// SVG text labels have a ~22.35 offset from their pin circle cx positions.
// Pin mapping verified: D13 label group x=102.569 → pin cx=124.92 (5th from top).
//
// CN10 Morpho even column (PB12/PB13/PB14) is on the right side,
// at orig_y≈37.96 (inner row is 7.2 units closer to board center).

const ORIG_W = 237.129;
const ORIG_H = 198.24;

const POS = {
  nrst:       { x: ORIG_H - 76.22,  y: 87.33  },   // 122.02, 87.33
  user:       { x: ORIG_H - 126.56, y: 87.33  },   //  71.68, 87.33
  ld2:        { x: 90,              y: 95     },    // between B1 and chip
  pinD13:     { x: ORIG_H - 30.76,  y: 124.92 },   // 167.48, 124.92 — Arduino D13, PA5 (CN10-11)
  pinD4:      { x: ORIG_H - 30.76,  y: 194.04 },   // 167.48, 194.04 — Arduino D4, PB5 (CN10-29)
  // CN10 Morpho even column: orig_y≈37.96 (inner row offset +7.2 from Arduino row at 30.76)
  // PB12 (CN10-16) next to PA7/D11 (CN10-15) at orig_x=139.32
  // PB14 (CN10-28) next to PB4/D5 (CN10-27) at orig_x=186.84
  // PB13 (CN10-30) next to PB5/D4 (CN10-29) at orig_x=194.04
  morphoPB12: { x: ORIG_H - 9,  y: 143.5 },  // 160.28, 139.32 — CN10-16 even, PB12
  morphoPB13: { x: ORIG_H - 9,  y: 194.04 },  // 160.28, 194.04 — CN10-30 even, PB13
  morphoPB14: { x: ORIG_H - 9,  y: 186.84 },  // 160.28, 186.84 — CN10-28 even, PB14
  // PA0 / A0 — CN7 left-side Arduino connector (approximate, adjust as needed)
  pinPA0:     { x: 99, y: 50 },
};

function pinFill(out) {
  if (!out || out.level === null) return "transparent";
  return out.level ? "#59ff6a" : "#1a3320";
}

function pinStroke(out) {
  if (!out || out.level === null) return "#444";
  return out.level ? "#59ff6a" : "#2a4430";
}

export function NucleoBoard({ firmwareOutputs, pinStates, onBoardButton, pa0AdcVoltage }) {
  const ld2  = firmwareOutputs?.find((o) => o.pin === "PA5");
  const pb5  = pinStates?.["PB5"];
  const pb12 = firmwareOutputs?.find((o) => o.pin === "PB12");
  const pb13 = firmwareOutputs?.find((o) => o.pin === "PB13");
  const pb14 = firmwareOutputs?.find((o) => o.pin === "PB14");

  // PA0 ADC voltage indicator: green intensity proportional to voltage (0–3.3 V)
  const pa0Ratio  = pa0AdcVoltage !== undefined ? Math.max(0, Math.min(1, pa0AdcVoltage / 3.3)) : null;
  const pa0Fill   = pa0Ratio !== null ? `rgba(89,255,106,${0.08 + pa0Ratio * 0.92})` : "transparent";
  const pa0Stroke = pa0Ratio !== null ? `rgba(89,255,106,${0.3 + pa0Ratio * 0.7})` : "#444";
  const pa0Glow   = pa0Ratio !== null && pa0Ratio > 0.05 ? `drop-shadow(0 0 ${(pa0Ratio * 5).toFixed(1)}px #59ff6a)` : "none";

  // LD2 colour: green when HIGH, dim green outline when LOW, dark when floating
  const ld2Fill    = ld2?.level === true  ? "#59ff6a" : ld2?.level === false ? "#1c3822" : "#2a2e30";
  const ld2Glow    = ld2?.level === true  ? "drop-shadow(0 0 4px #59ff6a)" : "none";
  const ld2Opacity = ld2?.level === null ? 0.4 : 1;

  return (
    <svg
      className="nucleo-svg-rotated"
      viewBox={`0 0 ${ORIG_H} ${ORIG_W}`}
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label="Nucleo F411RE board"
    >
      {/* Board image rotated 90° CW: translate(H, 0) rotate(90) */}
      <image
        href={nucleoSvg}
        width={ORIG_W}
        height={ORIG_H}
        transform={`translate(${ORIG_H}, 0) rotate(90)`}
        style={{ imageRendering: "crisp-edges" }}
      />

      {/* ── LD2 LED indicator (between B1 and chip) ── */}
      <rect
        x={POS.ld2.x + 25}
        y={POS.ld2.y + 29}
        width={9}
        height={4}
        rx={1}
        fill={ld2Fill}
        opacity={ld2Opacity}
        style={{ filter: ld2Glow, transition: "fill 0.15s" }}
      >
        <title>{`LD2 (PA5): ${ld2?.level === true ? "HIGH" : ld2?.level === false ? "LOW" : "FLOAT"}`}</title>
      </rect>

      {/* ── B1 USER button ── */}
      <circle
        cx={POS.user.x}
        cy={POS.user.y}
        r={6}
        fill="#1565c0"
        stroke="#0d47a1"
        strokeWidth={1}
        onClick={onBoardButton}
        style={{ cursor: "pointer" }}
      >
        <title>B1 USER (PC13) — click to toggle</title>
      </circle>
      <circle
        cx={POS.user.x}
        cy={POS.user.y}
        r={3.5}
        fill="#2779d8"
        style={{ pointerEvents: "none" }}
      />

      {/* ── D13 / PA5: Arduino connector (right) — CN10-11 inner = same physical pin ── */}
      <rect
        x={POS.pinD13.x - 1.5}
        y={POS.pinD13.y - 1.5}
        width={3}
        height={3}
        fill={pinFill(ld2)}
        stroke={pinStroke(ld2)}
        strokeWidth={0.7}
        style={{ filter: ld2?.level ? "drop-shadow(0 0 3px #59ff6a)" : "none", transition: "fill 0.15s" }}
      >
        <title>{`PA5 (LD2) D13: ${ld2?.level === true ? "HIGH" : ld2?.level === false ? "LOW" : "FLOAT"}`}</title>
      </rect>

      {/* ── PB12 / PB13 / PB14: Morpho CN10 even column (right side, inner row) ── */}
      {[{ p: pb12, pos: POS.morphoPB12, name: "PB12" },
        { p: pb13, pos: POS.morphoPB13, name: "PB13" },
        { p: pb14, pos: POS.morphoPB14, name: "PB14" }].map(({ p, pos, name }) => (
        <rect
          key={name}
          x={pos.x - 1.5}
          y={pos.y - 1.5}
          width={3}
          height={3}
          fill={p?.level === true ? "#59ff6a" : p?.level === false ? "#1a3320" : "transparent"}
          stroke={p?.level != null ? (p.level ? "#59ff6a" : "#2a4430") : "#444"}
          strokeWidth={0.7}
          style={{ filter: p?.level ? "drop-shadow(0 0 3px #59ff6a)" : "none", transition: "fill 0.15s" }}
        >
          <title>{`${name}: ${p?.level === true ? "HIGH" : p?.level === false ? "LOW" : "FLOAT"}`}</title>
        </rect>
      ))}

      {/* ── PA0 / A0: ADC voltage indicator — position is approximate, adjust x/y as needed ── */}
      <rect
        x={POS.pinPA0.x - 69.7}
        y={POS.pinPA0.y + 135.3}
        width={3}
        height={3}
        fill={pa0Fill}
        stroke={pa0Stroke}
        strokeWidth={0.7}
        style={{ filter: pa0Glow, transition: "fill 0.25s, filter 0.25s" }}
      >
        <title>{`PA0 (A0) ADC: ${pa0AdcVoltage !== undefined ? pa0AdcVoltage.toFixed(2) + " V" : "—"}`}</title>
      </rect>
    </svg>
  );
}
