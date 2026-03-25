---
name: renode-simulation
description: 'Guide for running and troubleshooting the Renode dual-board simulation. Use when: starting the simulation, configuring Renode, working with nucleo_dual.resc, using robot mode XML-RPC commands, inspecting GPIO or UART state in Renode, or debugging inter-board communication.'
---

# Renode Simulation – Dual STM32F411RE Nucleo Board Setup

## When to Use
- Starting the full simulation stack (`npm start`)
- Running Renode standalone (`bash dev.sh renode`)
- Modifying `renode/nucleo/nucleo_dual.resc`
- Debugging GPIO, UART, or inter-board communication in Renode
- Sending manual XML-RPC / robot framework commands to Renode

## Quick Start (Full Stack)

```bash
# Build firmware first:
npm run build:nucleo

# Start everything (Renode + backend + frontend):
npm start
# Renode robot server: :55555
# Backend WebSocket:   :8787
# Frontend (Vite):     http://localhost:5173
```

## Renode Standalone (without web UI)

```bash
bash dev.sh renode
# Builds firmware, then starts Renode with nucleo_dual.resc
```

## Simulation Script: `renode/nucleo/nucleo_dual.resc`

The script:
1. Creates `board_0` and `board_1` — each loads `nucleo_f411re.repl`
2. Opens an analyzer window for `usart2` on each board (debug console)
3. Loads `zephyr/build/zephyr/zephyr.elf` onto both boards
4. Creates independent server socket terminals for `usart2` (ports 12345/12346) and `usart1` (ports 12347/12348)
5. Sets deterministic quantum and serial execution
6. Starts both machines

### UART channels

| Channel | Role | Connected to |
|---------|------|-------------|
| `usart2` (PA2/PA3) | Debug console (`printk`) | Server socket terminal per board |
| `usart1` (PB6/PB7) | Inter-board protocol | Server socket terminal per board |

## Robot Mode (XML-RPC)

The backend connects to Renode's built-in Robot Framework server on port 55555.

Useful manual Renode commands (can be sent from the web UI Monitor tab):

```
# Read GPIO pin state
board_0 sysbus.gpioPortA ReadPin 5      # PA5 (LD2 LED)
board_0 sysbus.gpioPortC ReadPin 13     # PC13 (B1 button)

# Set a GPIO pin high
board_0 sysbus.gpioPortA WritePin 5 true  # PA5 LED on
```

## Backend Environment Variables (Renode-related)

| Variable | Default | Description |
|----------|---------|-------------|
| `RENODE_MODE` | `robot` | `robot` (XML-RPC) \| `external` \| `spawn` |
| `RENODE_ROBOT_PORT` | `55555` | Robot server port |
| `RENODE_ROBOT_HOST` | `localhost` | Robot server host |
| `RENODE_MACHINES` | `board_0,board_1` | Machine names in Renode |
| `RENODE_SCRIPT` | `renode/nucleo/nucleo_dual.resc` | Renode script to load |
| `AUTO_START_RENODE` | `true` | Auto-start on backend launch |

## Common Issues

### Renode window doesn't open / hangs
Use `--disable-gui --hide-monitor --hide-log --plain` flags (already set in `npm start:renode`).

### ELF not found error in Renode
Run `npm run build:nucleo` first. The `.resc` file references `$ORIGIN/../../zephyr/build/zephyr/zephyr.elf` (relative to the `.resc` file location in `renode/nucleo/`).

### Port 55555 already in use
A previous Renode instance is still running. Kill it:
```bash
taskkill /F /IM renode.exe   # Windows
```

### GPIO reads always return null
The backend scans ports A, B, C. Pins on other ports won't appear in the web UI.


## Quick Start (Full Stack)

```bash
# Build firmware first:
npm run build

# Start everything (Renode + backend + frontend):
npm start
# Renode robot server: :55555
# Backend WebSocket:   :8787
# Frontend (Vite):     http://localhost:5173
```

## Renode Standalone (without web UI)

```bash
bash dev.sh renode
# Builds firmware, then starts Renode with discovery_dual.resc
```

## Simulation Script: `renode/discovery/discovery_dual.resc`

The script:
1. Creates a **UART Hub** named `uartHub` for inter-board communication
2. Creates `board_0` and `board_1` — each loads `stm32f4_discovery-kit.repl`
3. Opens an analyzer window for `usart3` on each board (debug console)
4. Loads `zephyr/build/zephyr/zephyr.elf` onto both boards
5. Connects each board's `usart2` to the UART Hub
6. Sets deterministic quantum (`0.000025`) and serial execution
7. Starts both machines

### UART channels

| Channel | Role | Connected to |
|---------|------|-------------|
| `usart2` (PA2/PA3) | Inter-board protocol | UART Hub (shared between boards) |
| `usart3` (PB10/PB11) | Debug console (`printk`) | Renode analyzer window |

## Robot Mode (XML-RPC)

The backend connects to Renode's built-in Robot Framework server on port 55555.

Useful manual Renode commands (can be sent from the web UI Monitor tab):

```
# Read GPIO pin state
board_0 sysbus.gpioPortA ReadPin 0      # PA0 (button)

# Set a GPIO pin high
board_0 sysbus.gpioPortD WritePin 12 true  # PD12 LED

# Inject ADC voltage
board_0 sysbus.adc1 VoltageOnChannel 1 1.65  # PA1 = 1.65V
```

## Backend Environment Variables (Renode-related)

| Variable | Default | Description |
|----------|---------|-------------|
| `RENODE_MODE` | `robot` | `robot` (XML-RPC) \| `external` \| `spawn` |
| `RENODE_ROBOT_PORT` | `55555` | Robot server port |
| `RENODE_ROBOT_HOST` | `localhost` | Robot server host |
| `RENODE_MACHINES` | `board_0,board_1` | Machine names in Renode |
| `RENODE_SCRIPT` | `renode/discovery/discovery_dual.resc` | Renode script to load |
| `AUTO_START_RENODE` | `true` | Auto-start on backend launch |

## Common Issues

### Renode window doesn't open / hangs
Use `--disable-gui --hide-monitor --hide-log --plain` flags (already set in `npm start:renode`).

### ELF not found error in Renode
Run `npm run build` first. The `.resc` file references `$ORIGIN/../../zephyr/build/zephyr/zephyr.elf` (relative to the `.resc` file location in `renode/discovery/`).

### UART Hub not receiving data
Verify both boards have `usart2` connected: `connector Connect sysbus.usart2 uartHub` must appear for each machine in the `.resc` file.

### Port 55555 already in use
A previous Renode instance is still running. Kill it:
```bash
taskkill /F /IM renode.exe   # Windows
```

### GPIO reads always return null
The backend scans ports A, B, D. Pins on other ports won't appear in the web UI.
