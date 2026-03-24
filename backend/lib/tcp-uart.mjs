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
