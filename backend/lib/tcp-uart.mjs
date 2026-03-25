import net from "node:net";
import { state } from "../state.mjs";
import { emitLog } from "./broadcast.mjs";

const RECONNECT_DELAYS_MS = [200, 500, 1000, 2000, 5000];

/**
 * Connect to a Renode ServerSocketTerminal and stream UART lines to the frontend.
 * Renode acts as TCP server; we connect as client. Reconnects automatically on
 * disconnect (e.g. while Renode is still starting up the socket).
 *
 * @param {string} machine  - machine name, e.g. "board_0"
 * @param {number} port     - TCP port matching the ServerSocketTerminal in the .resc
 * @param {string} [host]   - defaults to "127.0.0.1"
 */
export function startTcpUartStream(machine, port, host = "127.0.0.1") {
  stopTcpUartStream(machine);

  let stopped = false;
  let retries = 0;
  let socket = null;
  let buffer = "";

  function connect() {
    if (stopped) return;

    socket = net.createConnection({ host, port });

    socket.setEncoding("utf8");

    socket.on("connect", () => {
      retries = 0;
      emitLog("system", `TCP UART stream connected on port ${port} (${machine})`, machine);
      state.tcpUartSockets.set(machine, socket);
    });

    socket.on("data", (chunk) => {
      buffer += chunk;
      const lines = buffer.split("\n");
      buffer = lines.pop(); // retain incomplete last segment
      for (const line of lines) {
        const trimmed = line.replace(/\r$/, "");
        if (trimmed) emitLog("uart", trimmed, machine);
      }
    });

    socket.on("error", () => {
      // Handled by 'close'; suppress unhandled-error crash.
    });

    socket.on("close", () => {
      state.tcpUartSockets.delete(machine);
      socket = null;
      buffer = "";
      if (stopped) return;
      const delay = RECONNECT_DELAYS_MS[Math.min(retries, RECONNECT_DELAYS_MS.length - 1)];
      retries += 1;
      setTimeout(connect, delay);
    });
  }

  state.tcpUartStoppers.set(machine, () => {
    stopped = true;
    if (socket) {
      socket.destroy();
      socket = null;
    }
    state.tcpUartSockets.delete(machine);
    state.tcpUartStoppers.delete(machine);
  });

  connect();
}

export function stopTcpUartStream(machine) {
  const stopper = state.tcpUartStoppers.get(machine);
  if (stopper) stopper();
}

export function stopAllTcpUartStreams() {
  for (const machine of [...state.tcpUartStoppers.keys()]) {
    stopTcpUartStream(machine);
  }
}

// ── Inter-board UART relay ──────────────────────────────────────────────────
// Connects to two Renode ServerSocketTerminals and cross-relays data so each
// board only receives what the OTHER board transmits (no hub echo).

/**
 * @param {string} machineA - e.g. "board_0"
 * @param {number} portA    - ServerSocketTerminal port for machineA's usart1
 * @param {string} machineB - e.g. "board_1"
 * @param {number} portB    - ServerSocketTerminal port for machineB's usart1
 * @param {string} [host]
 */
export function startInterBoardRelay(machineA, portA, machineB, portB, host = "127.0.0.1") {
  stopInterBoardRelay();

  let stopped = false;
  let sockA = null;
  let sockB = null;
  let retriesA = 0;
  let retriesB = 0;
  let bufA = "";
  let bufB = "";

  function connectA() {
    if (stopped) return;
    sockA = net.createConnection({ host, port: portA });
    sockA.setEncoding("utf8");
    sockA.on("connect", () => {
      retriesA = 0;
      emitLog("system", `Inter-board relay connected to ${machineA} on port ${portA}`, machineA);
    });
    sockA.on("data", (chunk) => {
      // Forward machineA TX → machineB RX
      if (sockB && !sockB.destroyed) sockB.write(chunk);
      // Log hub lines for the frontend
      bufA += chunk;
      const lines = bufA.split("\n");
      bufA = lines.pop();
      for (const line of lines) {
        const trimmed = line.replace(/\r$/, "");
        if (trimmed) emitLog("hub", trimmed, machineA);
      }
    });
    sockA.on("error", () => {});
    sockA.on("close", () => {
      sockA = null;
      bufA = "";
      if (stopped) return;
      const delay = RECONNECT_DELAYS_MS[Math.min(retriesA, RECONNECT_DELAYS_MS.length - 1)];
      retriesA += 1;
      setTimeout(connectA, delay);
    });
  }

  function connectB() {
    if (stopped) return;
    sockB = net.createConnection({ host, port: portB });
    sockB.setEncoding("utf8");
    sockB.on("connect", () => {
      retriesB = 0;
      emitLog("system", `Inter-board relay connected to ${machineB} on port ${portB}`, machineB);
    });
    sockB.on("data", (chunk) => {
      // Forward machineB TX → machineA RX
      if (sockA && !sockA.destroyed) sockA.write(chunk);
      // Log hub lines for the frontend
      bufB += chunk;
      const lines = bufB.split("\n");
      bufB = lines.pop();
      for (const line of lines) {
        const trimmed = line.replace(/\r$/, "");
        if (trimmed) emitLog("hub", trimmed, machineB);
      }
    });
    sockB.on("error", () => {});
    sockB.on("close", () => {
      sockB = null;
      bufB = "";
      if (stopped) return;
      const delay = RECONNECT_DELAYS_MS[Math.min(retriesB, RECONNECT_DELAYS_MS.length - 1)];
      retriesB += 1;
      setTimeout(connectB, delay);
    });
  }

  state._interBoardRelayStopper = () => {
    stopped = true;
    if (sockA) { sockA.destroy(); sockA = null; }
    if (sockB) { sockB.destroy(); sockB = null; }
    state._interBoardRelayStopper = null;
  };

  connectA();
  connectB();
}

export function stopInterBoardRelay() {
  if (state._interBoardRelayStopper) state._interBoardRelayStopper();
}
