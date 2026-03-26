export const MAX_LOG_LINES = 5000;
export const BACKEND_WS_URL = import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8787";

export const BOARDS = [
  { id: "board_0", label: "Board A" },
  { id: "board_1", label: "Board B" },
];

// Nucleo F411RE Arduino header CN5 (left side, top to bottom)
export const LEFT_HEADER_PINS = [
  "PC10", "PC11", "PC12", "PD2",           // CN7 Morpho left (4)
  "VDD",  "BOOT0", "NC",  "NC",            // Power/boot (skip)
  "PA13", "PA14", "PA15", "PB7",
  "PC13", "PC14", "PC15",
  "PH0",  "PH1",
  "VBAT", "PC2",  "PC3",
  // Arduino left column CN6 (A0-A5)
  "PA0",  "PA1",  "PA4",  "PB0",  "PC1",  "PC0",
];

// Nucleo F411RE Arduino header CN5 (right side, top to bottom)
export const RIGHT_HEADER_PINS = [
  // Arduino right column CN5 (D0-D15)
  "PA3",  "PA2",  "PA10", "PB3",
  "PB5",  "PB4",  "PB10", "PA8",
  "PA9",  "PC7",  "PB6",  "PA7",
  "PA6",  "PA5",  "PB9",  "PB8",
  // Morpho right CN10
  "PC9",  "PC8",  "PC6",  "PC5",
  "PA12", "PA11", "PB12", "PB11",
  "PB2",  "PB1",
];

export const PIN_ROWS = LEFT_HEADER_PINS.map((left, idx) => [left, RIGHT_HEADER_PINS[idx]]);

// Nucleo F411RE firmware pin assignment:
//   LD2    : PA5  (led0, active HIGH) — TOGGLE_1 indicator
//   B1     : PC13 (sw0,  active LOW) — mode cycle button
//   USART2 : PA2 TX / PA3 RX  — Zephyr console (ST-Link VCP)
//   USART1 : PB6 TX / PB7 RX  — inter-board UART hub
//   PB5    : GPIO IRQ input → sends TOGGLE_1 on rising edge
export const FIRMWARE_PIN_PROFILE = {
  PA5:  { role: "output", label: "led0 / LD2" },
  PC13: { role: "input",  label: "sw0 / B1" },
  PA0:  { role: "adc",    label: "ADC1 IN0 (A0)" },
  PA1:  { role: "adc",    label: "ADC1 IN1 (A1)" },
  PA2:  { role: "uart",   label: "USART2 TX" },
  PA3:  { role: "uart",   label: "USART2 RX" },
  PB5:  { role: "input",  label: "GPIO IRQ (D4)" },
  PB6:  { role: "uart",   label: "USART1 TX" },
  PB7:  { role: "uart",   label: "USART1 RX" },
  PB12: { role: "output", label: "Chase 1 (CN7)" },
  PB13: { role: "output", label: "Chase 2 (CN7)" },
  PB14: { role: "output", label: "Chase 3 (CN7)" },
};

export const OUTPUT_PINS = Object.entries(FIRMWARE_PIN_PROFILE)
  .filter(([, cfg]) => cfg.role === "output")
  .map(([pin]) => pin);

// PA5 = LD2 (TOGGLE_1 indicator), PB12-14 = chase pattern outputs
export const BOARD_LED_ORDER = ["PA5", "PB12", "PB13", "PB14"];

export const ALL_TRACKED_PINS = Array.from(
  new Set([...PIN_ROWS.flat(), ...OUTPUT_PINS, ...Object.keys(FIRMWARE_PIN_PROFILE)])
);

export function isGpioPin(pin) {
  return /^P[A-Z]\d+$/.test(String(pin || ""));
}

export function roleTag(role) {
  if (role === "input")  return "IN";
  if (role === "output") return "OUT";
  if (role === "uart")   return "UART";
  if (role === "adc")    return "ADC";
  return "IO";
}

export function buildPinMap() {
  const map = {};
  for (const [left, right] of PIN_ROWS) {
    for (const pin of [left, right]) {
      if (isGpioPin(pin)) {
        map[pin] = {
          role:  FIRMWARE_PIN_PROFILE[pin]?.role  || "io",
          label: FIRMWARE_PIN_PROFILE[pin]?.label || pin,
          level: null,
        };
      }
    }
  }
  for (const pin of OUTPUT_PINS) {
    if (!map[pin]) {
      map[pin] = {
        role:  FIRMWARE_PIN_PROFILE[pin]?.role  || "output",
        label: FIRMWARE_PIN_PROFILE[pin]?.label || pin,
        level: null,
      };
    }
  }
  return map;
}

export function firmwareOutputsFor(boardId, pinStatesByBoard) {
  const pinStates = pinStatesByBoard[boardId] || buildPinMap();
  return BOARD_LED_ORDER.map((pin) => ({
    pin,
    label: FIRMWARE_PIN_PROFILE[pin]?.label || pin,
    level: pinStates[pin]?.level ?? null,
  }));
}
