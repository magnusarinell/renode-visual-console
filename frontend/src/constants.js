export const MAX_LOG_LINES = 800;
export const BACKEND_WS_URL = import.meta.env.VITE_BACKEND_WS_URL || "ws://localhost:8787";

export const BOARDS = [
  { id: "board_0", label: "Board A" },
  { id: "board_1", label: "Board B" },
];

export const LEFT_HEADER_PINS = [
  "PC13", "PC14", "PC15", "PH0", "PH1",
  "PC0", "PC1", "PC2", "PC3", "PA0", "PA1", "PA2", "PA3", "PA4", "PA5",
  "PA6", "PA7", "PC4", "PC5", "PB0", "PB1", "PB2",
  "PE7", "PE8", "PE9", "PE10", "PE11", "PE12", "PE13", "PE14", "PE15",
];

export const RIGHT_HEADER_PINS = [
  "PB10", "PB11", "PB12", "PB13", "PB14",
  "PB15", "PD8", "PD9", "PD10", "PD11", "PD12", "PD13", "PD14", "PD15",
  "PA8", "PA9", "PA10", "PA11", "PA12", "PA15",
  "PB3", "PB4", "PB5", "PB6", "PB7", "PB8", "PB9", "PC6", "PC7", "PC8",
  "PC9", "PC10", "PC11", "PC12", "PD0", "PD1", "PD2", "PD3", "PD4",
];

export const PIN_ROWS = LEFT_HEADER_PINS.map((left, idx) => [left, RIGHT_HEADER_PINS[idx]]);

export const FIRMWARE_PIN_PROFILE = {
  PA0: { role: "input",  label: "sw0 / B1" },
  PA1: { role: "adc",   label: "ADC1 IN1" },
  PA2: { role: "uart",  label: "USART2 TX" },
  PA3: { role: "uart",  label: "USART2 RX" },
  PA6: { role: "adc",   label: "ADC1 IN6" },
  PB5: { role: "input", label: "GPIO IRQ" },
  PB10: { role: "uart",   label: "USART3 TX" },
  PB11: { role: "uart",   label: "USART3 RX" },
  PB12: { role: "output", label: "MODE 1" },
  PB13: { role: "output", label: "MODE 2" },
  PB14: { role: "output", label: "MODE 3" },
  PD12: { role: "output", label: "led0 / LD4" },
  PD13: { role: "output", label: "LD3" },
  PD14: { role: "output", label: "LD5" },
  PD15: { role: "output", label: "LD6" },
};

export const OUTPUT_PINS = Object.entries(FIRMWARE_PIN_PROFILE)
  .filter(([, cfg]) => cfg.role === "output")
  .map(([pin]) => pin);

export const BOARD_LED_ORDER = ["PD13", "PD12", "PD14", "PD15"]; // LD3, LD4, LD5, LD6

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
