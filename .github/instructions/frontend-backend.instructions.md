---
applyTo: "{frontend/src/**,backend/**}"
---

# Frontend & Backend – Web UI + Renode Bridge

## Architecture

```
React frontend (Vite :5173)
  ↕ WebSocket
Node.js backend (:8787)
  ↕ XML-RPC (Robot Framework protocol)
Renode robot server (:55555)
```

## WebSocket Message Protocol

All messages are JSON objects with a `type` field.

### Server → Client

| Type | Payload | Description |
|------|---------|-------------|
| `hello` | `{ boards, pins, logs }` | Initial state on connect |
| `status` | `{ running: bool }` | Renode simulation state |
| `pin_state` | `{ board, pin, value: true\|false\|null }` | GPIO level changed |
| `log` | `{ source, text, ts }` | UART or system log line |

### Client → Server

| Type | Payload | Description |
|------|---------|-------------|
| `action` | `{ board, action: "toggle"\|"press"\|"release" }` | Button control |
| `command` | `{ cmd: string }` | Raw Renode monitor command |
| `gpio` | `{ board, pin, value: "high"\|"low"\|"pulse" }` | Set GPIO pin |
| `analog` | `{ board, channel, voltage: number }` | Inject ADC voltage (0–3.3) |

## Boards

| ID | Display Name |
|----|-------------|
| `board_0` | Board A |
| `board_1` | Board B |

## Backend Specifics (`backend/index.mjs`)

- **Default mode**: `robot` — connects to Renode robot server via XML-RPC on port 55555
- **GPIO scan ports**: A, B, D (polled every 100 ms)
- **UART terminals**: created for `usart3` (debug) and `usart2` (inter-board hub) on each machine
- **Log buffer**: 500 lines, replayed to new WebSocket clients on `hello`

### Environment Variables

| Variable | Default | Description |
|----------|---------|-------------|
| `RENODE_BRIDGE_PORT` | `8787` | WebSocket listen port |
| `RENODE_MODE` | auto | `robot` \| `external` \| `spawn` |
| `RENODE_ROBOT_PORT` | `55555` | Renode robot server port |
| `RENODE_ROBOT_HOST` | `localhost` | Renode robot server host |
| `RENODE_MACHINES` | `board_0,board_1` | Comma-separated machine names |
| `RENODE_SCRIPT` | `zephyr/renode/discovery_dual.resc` | Path to Renode script |
| `AUTO_START_RENODE` | `true` | Auto-start simulation on backend launch |

## Frontend Component Structure (`frontend/src/`)

| File | Role |
|------|------|
| `App.jsx` | Root: WebSocket state, board/pin/log aggregation, layout |
| `components/BoardCard.jsx` | Per-board UI: LED bank, pin headers, pin control, analog slider, UART log |
| `components/LogPanel.jsx` | Tabbed log panel: Web Server / Monitor / UART Hub |
| `hooks/useWebSocket.js` | WebSocket connection with reconnect; callbacks in refs (stale-closure-safe) |
| `constants.js` | `BOARDS`, `PIN_ROWS`, `FIRMWARE_PIN_PROFILE`, `BOARD_LED_ORDER`, helpers |

### LED Display Order

`BOARD_LED_ORDER = [PD13, PD12, PD14, PD15]` — visual order in `BoardCard`, not the same as PD12–15 sequential.

### Pin Roles (from `FIRMWARE_PIN_PROFILE`)

| Role | Pins |
|------|------|
| `output` | PD12, PD13, PD14, PD15, PB12, PB13, PB14 |
| `input` | PA0 (button), PB5 (GPIO IRQ) |
| `uart` | PA2, PA3 (USART2), PB10, PB11 (USART3) |
| `adc` | PA1, PA6 |

## Coding Conventions
- WebSocket callbacks must be stored in `useRef` (not `useState`) to avoid stale closures in the reconnect loop
- GPIO pin names in the protocol are bare strings like `"PA0"`, `"PD12"` — match exactly what Renode exposes
- Do not introduce new WebSocket message types without updating both `backend/index.mjs` and the relevant frontend handler in `App.jsx`
