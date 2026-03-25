---
applyTo: "zephyr/app/src/**"
---

# Firmware – STM32F411RE Nucleo (Zephyr C)

## Board & Target
- Board: `nucleo_f411re` (STM32F411RE Nucleo, Cortex-M4)
- Build target used by Renode: `west build -b nucleo_f411re`
- Device tree overlay: `zephyr/app/boards/nucleo_f411re.overlay`
- UART console: USART2 (PA2/PA3) — used for `printk` debug output (defined in base DTS)
- Inter-board UART: USART1 (PB6/PB7) — each board has its own server socket terminal in Renode

## Pin Mapping

| Pin | Alias / Node | Function |
|-----|-------------|----------|
| PA2 | USART2 TX | Debug console (printk / shell) |
| PA3 | USART2 RX | Debug console |
| PA5 | `led0` / LD2 | Onboard user LED (GPIO_ACTIVE_HIGH) |
| PB6 | USART1 TX | Inter-board communication |
| PB7 | USART1 RX | Inter-board communication |
| PB12 | `led1` / extra_led0 | Mode indicator LED 1 |
| PB13 | `led2` / extra_led1 | Mode indicator LED 2 |
| PB14 | `led3` / extra_led2 | Mode indicator LED 3 |
| PC13 | `sw0` / B1 | User button (input, GPIO_ACTIVE_LOW) |

## LED Animation Modes

Cycle via user button (PC13). Mode indicators PB12–PB14 reflect active mode.

| Mode | Behaviour |
|------|-----------|
| `BLINK` | LD2 (PA5) + extra LEDs toggle together |
| `CHASE` | Single LED steps through PA5 → PB12 → PB13 → PB14 → repeat |
| `SHOWCASE` | Symmetric wave pattern across all LEDs |

## Module Overview

| File | Responsibility |
|------|---------------|
| `main.c` | Init, button ISR, mode state machine, main loop |
| `outputs.c/h` | `write_pattern()`, `clear_outputs()`, `update_mode_leds()` |
| `uart_comm.c/h` | USART1 ring-buffer RX/TX, `uart_send()`, `uart_try_read_line()` |
| `gpio_irq.c/h` | PC13 interrupt → mode cycle |

## Coding Conventions
- Use `gpio_pin_set_dt()` / `gpio_pin_get_dt()` with device-tree aliases, not raw register writes
- UART: use the ring buffer API (`ring_buf_*`) for RX — never block in ISR
- Keep ISRs minimal: set a flag or write to ring buffer, process in thread context
- `printk` goes to USART2 (debug console); USART1 is reserved for inter-board protocol


## Pin Mapping

| Pin | Alias / Node | Function |
|-----|-------------|----------|
| PA0 | `sw0` | User button (input) |
| PA1 | ADC1 IN1 | ADC channel 1 (voltage → blink speed) |
| PA2 | USART2 TX | Inter-board communication |
| PA3 | USART2 RX | Inter-board communication |
| PA6 | ADC1 IN6 | ADC channel 6 (alternative) |
| PB5 | `gpio_irq` | GPIO interrupt input (triggers inter-board TOGGLE_1) |
| PB10 | USART3 TX | Debug console |
| PB11 | USART3 RX | Debug console |
| PB12 | `mode_led_1` | Mode indicator LED 1 |
| PB13 | `mode_led_2` | Mode indicator LED 2 |
| PB14 | `mode_led_3` | Mode indicator LED 3 |
| PD12 | `led0` / LD4 | Output LED (green) |
| PD13 | `led1` / LD3 | Output LED (orange) |
| PD14 | `led2` / LD5 | Output LED (red) |
| PD15 | `led3` / LD6 | Output LED (blue) |

## LED Animation Modes

Cycle via user button (PA0). Mode indicators PB12–PB14 reflect active mode.

| Mode | Behaviour |
|------|-----------|
| `BLINK` | All 4 LEDs (PD12–PD15) toggle together; period = `blink_interval_ms` |
| `CHASE` | Single LED steps: PD12 → PD13 → PD14 → PD15 → repeat |
| `SHOWCASE` | Symmetric wave pattern across all 4 LEDs |

`blink_interval_ms` is a global updated by the ADC thread (default 500 ms, range driven by 0–3.3V on PA1).

## Module Overview

| File | Responsibility |
|------|---------------|
| `main.c` | Init, button ISR, mode state machine, 120 ms main loop |
| `outputs.c/h` | `write_pattern()`, `clear_outputs()`, `update_mode_leds()` |
| `uart_comm.c/h` | USART2 ring-buffer RX/TX, `uart_send()`, `uart_try_read_line()` |
| `gpio_irq.c/h` | PB5 interrupt → sends `TOGGLE_1` over USART2 |
| `adc.c/h` | Dedicated thread; reads PA1 every 200 ms → updates `blink_interval_ms` |

## Coding Conventions
- Use `gpio_pin_set_dt()` / `gpio_pin_get_dt()` with device-tree aliases, not raw register writes
- UART: use the ring buffer API (`ring_buf_*`) for RX — never block in ISR
- ADC: runs in a separate thread (`K_THREAD_DEFINE`), writes to a global guarded by no lock (single writer, single reader via main thread)
- Keep ISRs minimal: set a flag or write to ring buffer, process in thread context
- `printk` goes to USART3 (debug console); USART2 is reserved for inter-board protocol
