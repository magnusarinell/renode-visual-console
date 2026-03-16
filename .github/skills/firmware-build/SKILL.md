---
name: firmware-build
description: 'Guide for building and troubleshooting Zephyr firmware for the STM32F4 Discovery Kit. Use when: building firmware, running west build, cross-compiling, setting up Zephyr workspace, initialising west, handling CMake or compile errors, adding Kconfig options, or modifying device tree overlays.'
---

# Firmware Build – STM32F4 Discovery Kit

## When to Use
- Setting up the Zephyr workspace for the first time
- Building firmware (`npm run build` / `bash dev.sh build-disco`)
- Diagnosing CMake, west, or compiler errors
- Adding or changing Kconfig options (`prj.conf`)
- Modifying the device tree overlay (`boards/stm32f4_disco.overlay`)

## Prerequisites

Ensure these are installed and in `PATH`:
- Zephyr SDK 0.17.x (extracted to any user-writable folder)
- `west` (`pip install --user west`)
- CMake ≥ 3.20
- Git Bash (Windows)

Environment variable required: `ZEPHYR_SDK_INSTALL_DIR`

```bash
export ZEPHYR_SDK_INSTALL_DIR=~/zephyr-sdk/zephyr-sdk-0.17.4
```

## One-Time Workspace Setup

```bash
cd zephyr
west init -l app        # initialise from local manifest
west update             # fetch Zephyr + modules (~2 GB)
west zephyr-export      # register CMake packages
```

## Build Firmware

```bash
# Preferred (from repo root):
npm run build

# Or via dev.sh:
bash dev.sh build-disco

# Or directly:
cd zephyr
west build -p always -b stm32f4_disco app
```

Build output: `zephyr/build/zephyr/zephyr.elf`

## Clean Build

```bash
bash dev.sh rebuild   # clean then build
bash dev.sh clean     # remove zephyr/build/ only
```

## Common Errors

### `west: command not found`
Add Python user scripts to PATH:
```bash
export PATH="$HOME/AppData/Roaming/Python/Python313/Scripts:$PATH"
```
Or add permanently to `~/.bashrc`.

### `ZEPHYR_SDK_INSTALL_DIR not set`
Set the env variable pointing to your extracted SDK directory.

### CMake error: compiler not found
Verify `ZEPHYR_SDK_INSTALL_DIR` points to the correct SDK version (0.17.x).
Run `west zephyr-export` again.

### `DT_CHOSEN_Z_CONSOLE` undefined / console device error
Check that `boards/stm32f4_disco.overlay` defines the `chosen` node with `zephyr,console = &usart3`.

## Modifying Kconfig (`prj.conf`)

Common options:
```kconfig
CONFIG_GPIO=y
CONFIG_UART_INTERRUPT_DRIVEN=y
CONFIG_RING_BUFFER=y
CONFIG_ADC=y
CONFIG_PINCTRL=y
```

After changing `prj.conf`, `west build -p always` (pristine build) ensures the config is reapplied cleanly.

## Modifying Device Tree (`boards/stm32f4_disco.overlay`)

- USART2 (inter-board, PA2/PA3): do not change baud rate — backend expects 115200
- USART3 (debug, PB10/PB11): pinctrl group `usart3_pb10_pb11`
- Mode LEDs added as `leds` child nodes: `mode_led_1` (PB12), `mode_led_2` (PB13), `mode_led_3` (PB14)
