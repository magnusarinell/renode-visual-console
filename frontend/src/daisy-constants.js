// Constants for the Daisy Seed simulation scenario.
// yd_stm32h750vb board pin mapping:
//   led0  → PA15 (yellow LED, GPIO_ACTIVE_HIGH)  — our toggle output
//   sw0   → PB3  (user button, GPIO_ACTIVE_LOW | GPIO_PULL_UP)
//   uart  → USART1 (PA9 TX, PA10 RX, 115200 baud)

export const DAISY_MACHINE    = "daisy_0";
export const DAISY_OUTPUT_PIN = "PA15";   // toggled by firmware on each button press
export const DAISY_INPUT_PIN  = "PB3";    // user button (physical LOW = pressed)
