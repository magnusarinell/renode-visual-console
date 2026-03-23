export const ESP32C3_MACHINE = "esp32c3_0";
export const ESP32C3_LED_PIN = "GPIO5";

export const ESP32C3_MODE_BY_ELF = {
  hello_world: "hello",
  blink: "blink",
};

export function esp32c3ModeFromElf(elfPath) {
  const name = String(elfPath || "").toLowerCase();
  if (name.includes("blink")) return "blink";
  if (name.includes("hello")) return "hello";
  return "hello";
}
