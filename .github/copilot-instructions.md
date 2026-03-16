# Copilot Instructions – STM32F4 Disco Zephyr + Renode Project

## Project Context
- Firmware: **C** (Zephyr RTOS), targeting **STM32F4 Discovery Kit** (`stm32f4_disco`, Cortex-M4)
- Simulation: **Renode** dual-board setup — two `stm32f4_disco` instances connected via UART Hub
- Backend: **Node.js** WebSocket bridge between web UI and Renode robot server (XML-RPC)
- Frontend: **React + Vite** web UI for monitoring and controlling simulated boards
- Environment: Corporate Windows, Git Bash, no admin rights, no Docker

## Build & Run Commands
- **`npm run build`**: Build firmware for Renode (`west build -b stm32f4_disco`)
- **`npm start`**: Start Renode robot server + backend + frontend concurrently
- **`bash dev.sh build-disco`**: Build firmware (same as `npm run build`)
- **`bash dev.sh renode`**: Build + launch Renode standalone
- **`bash dev.sh rebuild`**: Clean then build

## Terminal Workflow
- **`npm run build`**: Use for all firmware changes — triggers west build and can be followed by `npm start`
- **`npm start`**: Starts services on ports 55555 (Renode), 8787 (backend), 5173 (frontend)
  - **NEVER run without asking the user first** — conflicts with already-running processes
- For isolated service testing: `npm --prefix backend run start` or `npm --prefix frontend run dev`

## Validation After Changes
- **Firmware changes** (`zephyr/app/src/*.c`):
  - Run `npm run build` to verify compilation
  - Backend streams UART logs automatically when Renode is running
- **Frontend/Backend changes** (`frontend/src/**`, `backend/index.mjs`):
  - Use VS Code diagnostics / lint — do NOT run `npm run build` (triggers firmware rebuild)
  - Backend: `npm --prefix backend run lint` if available
- **When uncertain**: Ask the user before running heavy or time-consuming build commands

