# Renode Simulation Scripts

This directory contains Renode platform descriptions (`.repl`) and simulation scripts (`.resc`) for the three supported targets.

---

## nucleo/ — STM32F411RE Nucleo (dual-board)

### `nucleo_dual.resc`

Dual-board simulation with two `nucleo_f411re` instances, each with independent UART terminals.

- Both boards load the same Zephyr ELF (`zephyr/build/zephyr/zephyr.elf`).
- `usart2` is exposed via the Renode analyzer for debug output (console/printk).
- `usart1` on each board gets its own server socket terminal for inter-board communication.
- GDB servers on ports 3334 (board_0) and 3335 (board_1).

---

## daisy/ — Electrosmith Daisy Seed (STM32H750IBK6)

### `daisy_seed.repl`

Platform description for the Electrosmith Daisy Seed board (STM32H750IBK6).

The Daisy Seed uses an STM32H750IBK6 (BGA144), which is the value-line variant of the STM32H743 family — identical core (Cortex-M7) and peripherals, with 128 KB of internal flash instead of 2 MB. For simulation we base on `stm32h743.repl` (same peripheral set) and add the two external memories present on the hardware:

- `IS25LP064A` QSPI NOR flash — code XIP region (`0x90000000`)
- `IS42S16400J-6BLI` SDRAM — audio/heap RAM (`0xC0000000`, already provided by `stm32h743.repl` as `sdramBank1`)

libDaisy ELFs built with `APP_TYPE = BOOT_SRAM` link to SRAM at `0x24000000`. The script (`daisy_seed.resc`) sets VTOR, SP and PC from the vector table after loading the ELF.

| Peripheral | Address | Details |
|---|---|---|
| `qspiFlash` | `0x90000000` | IS25LP064A, 64 MB (modelled at max size to cover all Daisy Seed variants) |
| `led0` | PC7 | Onboard user LED (GPIO_ACTIVE_HIGH) |
| `led_pa2` | PA2 | External breadboard LED driven by soft-PWM in the Knob example |

### `daisy_stubs.repl`

Python peripheral stubs that replace built-in Renode models incompatible with the STM32H7 HAL.

libDaisy's `System::Init()` aggressively configures clocks, power, and flash wait-states, then polls ready-flags. Renode's built-in models do not set these ready bits, so firmware hangs in busy-wait. The actual Python stubs are registered by `daisy_seed.resc` **after** loading `daisy_seed.repl` — the script removes the built-in `rcc`, `flashController`, `syscfg`, `qspi`, and `adcM1S2` models and replaces them with stubs.

| Peripheral | Address | Purpose |
|---|---|---|
| `rcc_stub` | `0x58024400` | RCC clock controller — prevents busy-wait hang in HAL clock init |
| `pwr_stub` | `0x58024800` | PWR power control |
| `flash_stub` | `0x52002000` | Flash controller stub |
| `syscfg_stub` | `0x58000400` | System configuration |
| `qspi_stub` | `0x52005000` | QSPI controller |
| `adc_stub` | `0x40022000` | ADC1/ADC2 master-slave — replaces `STM32F0_ADC` whose register layout is incompatible with the STM32H7 HAL (`CHSELR` vs `PCSEL`/`SQR`). Without this, firmware hangs in `HAL_ADCEx_Calibration_Start()`. |
| `spi1_stub` | `0x40013000` | SPI1 — intercepts SSD1306 OLED traffic and writes framebuffer to SRAM4 |

### `daisy_seed.resc`

Simulation script for loading a libDaisy ELF into the Daisy Seed machine.

- ELF path is configurable via `$elf`; defaults to `DaisyExamples/seed/Blink/build/Blink.elf`.
- Unregisters built-in peripheral models, then loads stubs from `daisy_stubs.repl`.
- GDB server on port 3333. Connect with `arm-none-eabi-gdb -ex "target remote localhost:3333"`.
- `VectorTableOffset` set to `0x08000000` for flash-linked ELFs (`APP_TYPE = BOOT_NONE`).
- For SRAM-linked ELFs (`APP_TYPE = BOOT_SRAM`, base `0x24000000`): override VTOR and set SP/PC manually from the vector table (commented-out lines in the script).
- `showAnalyzer` and `start` are intentionally omitted — the backend creates the TerminalTester before starting the machine so that firmware startup messages are captured.

---

## esp32c3/ — ESP32-C3 (RISC-V)

### `esp32c3.repl`

Minimal platform description for Renode simulation of the ESP32-C3. Not a full hardware-accurate model — designed to run esp-idf firmware built with `idf.py target esp32c3`.

**Key design choices:**

- `uart0` uses NS16550 at `0x60000000` — firmware writes a char to offset 0 (THR), NS16550 passes it to the backend's TerminalTester.
- GPIO registers are plain `MappedMemory` — firmware writes `GPIO_OUT` at `0x60004004`; backend reads it back with `sysbus ReadDoubleWord 0x60004004`.
- Stub `MappedMemory` absorbs all other peripheral space accesses (clock init, system registers, etc.) without generating faults.

**Memory map:**

| Region | Address | Size | Purpose |
|---|---|---|---|
| `drom` | `0x3C000000` | 4 MB | Flash-cached read-only data (`.rodata`) |
| `dram` | `0x3FC80000` | 512 KB | Data RAM |
| `rom_data` | `0x3FF00000` | 128 KB | ROM function-pointer tables and rodata |
| `rom` | `0x40000000` | 384 KB | Mask ROM — pre-filled via `rom_stub.bin` with `c.jr ra` so every ROM call returns immediately |
| `iram` | `0x4037C000` | 400 KB | Internal SRAM for code/data loaded from flash at boot |
| `flash` | `0x42000000` | 4 MB | Application flash |
| `rtcram` | `0x50000000` | 8 KB | RTC RAM |
| `soc_pre_spi` | `0x60001000` | 4 KB | APB catch-all below SPI registers |
| `soc_post_spi` | `0x60004000` | 768 KB | APB catch-all above SPI (GPIO `0x60004004`, WDTs, SYSTIMER…) |
| `soc_high` | `0x600C0000` | 64 KB | SYSTEM, SENSITIVE, INTERRUPT_CORE0, EXTMEM/cache-MMU |
| `high_mem` | `0xFFFFF000` | 4 KB | Absorbs stack writes near the top of address space during boot |

**CPU:** RISC-V RV32IMC + `_zicsr` (required for CSR instructions; without it, trap-vector setup silently fails). Privilege spec: `Priv1_11`. Time source: CLINT at `0x02000000` (Renode requirement — ESP32-C3 does not have a standard RISC-V CLINT).

**SPI1/SPI0 stub note:** The SPI register range `0x60002000`–`0x60003FFF` uses `Tag` entries (in `.resc`) rather than `MappedMemory`. The firmware polls `SPI_CMD_REG` waiting for hardware to clear the USR bit. A `MappedMemory` would persist the written value and cause an infinite loop in `bootloader_flash_execute_command_common` — `Tag` always returns 0 and silently drops writes, so the poll exits immediately.

### `esp32c3_stubs.repl`

Intentionally empty — the ROM stub is handled via `sysbus LoadBinary` in `esp32c3.resc`.

### `esp32c3.resc`

Simulation script for the ESP32-C3. ELF path is configurable via `$elf`; defaults to `esp-idf/examples/get-started/hello_world`.

**ROM stub binary (`rom_stub.bin`):** Fills the ROM region with `c.li a0, 0` + `c.jr ra` per 4 bytes. At any 4-byte aligned ROM function entry this returns `a0=0` (ESP_OK). Prevents esp-idf startup's many `esp_rom_*` calls from entering error-retry loops.

**`uart_tx_one_char` ROM trampoline (patch at `0x40000068`):**
The ROM symbol `uart_tx_one_char` is the final character-output function used by `ets_printf`/`esp_rom_printf` and the console layer. Patched to write the character (in `a0`) directly to the NS16550 THR at `0x60000000`, so the TerminalTester captures every byte.

```
0x40000068  lui  t0, 0x60000    ; 0x600002B7
0x4000006C  sb   a0, 0(t0)      ; 0x00A28023
0x40000070  c.jr ra             ; already 0x8082 from stub
```

**SPI1/SPI0 register stubs:** See `esp32c3.repl` above.

**Espressif custom CSR patches:** Renode raises `Illegal instruction` for unimplemented CSRs including Espressif-specific ones (`0x7C0`–`0x7FF`: `mexstatus`, `cpu_gpio`, etc.). Detected via `scripts/read_elf.py`. Each CSR read is replaced with `li rd, 0`; each CSR write with `nop`.

| Address | Patch | Reason |
|---|---|---|
| `0x40387096` (IRAM) | `csrrs x8, CSR_0x7E2` → `li s0, 0` | `cpu_gpio_out_user` read |
| `0x420011e0` (IROM) | `csrrs x10, CSR_0x7E2` → `li a0, 0` | `cpu_gpio_out_user` read |
| `0x4200120a` (IROM) | `csrrw x0, CSR_0x7E2` → `nop` | `cpu_gpio_out_user` write |

**NS16550 UART init:** LCR set to `0x03` (8-bit, no parity, 1 stop bit, DLAB=0) so THR is active. UART0 extended register range (`0x60000020`–`0x600000FF`) tagged as stub. TX FIFO status at `0x6000000C` preset to `0x03` (ready).
