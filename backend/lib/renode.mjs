import { spawn } from "node:child_process";
import net from "node:net";
import { state } from "../state.mjs";
import {
  RENODE_MODE, RENODE_MONITOR_HOST, RENODE_MONITOR_PORT,
  renodeCmd, simScript, MACHINES,
} from "../config.mjs";
import { emit, emitLog } from "./broadcast.mjs";
import { startUartStreaming, startUartDrainLoop, drainUartLines, stopUartDrainLoops } from "./uart.mjs";
import { stopAllTcpUartStreams } from "./tcp-uart.mjs";
import { connectToRobotServer } from "./scenarios.mjs";
import { resolveMachine } from "./utils.mjs";
import { callXmlRpc, executeRenodeCommand } from "./rpc.mjs";

export function startRenode() {
  if (RENODE_MODE === "robot") {
    if (state.renodeRunning && state.renodeReady) {
      for (const machine of state.activeMachines) {
        if (!state.uartTesterReadyByMachine.get(machine)) {
          startUartStreaming(machine)
            .then(() => {
              startUartDrainLoop(machine);
              return drainUartLines(machine).catch(() => {});
            })
            .catch(() => {});
        }
      }
      return;
    }
    connectToRobotServer();
    return;
  }

  if (RENODE_MODE === "external") {
    connectToExternalRenode();
    return;
  }

  if (state.renode) return;

  state.renodeReady = false;
  state.renode = spawn(renodeCmd, [simScript], {
    cwd: process.cwd(),
    stdio: ["pipe", "pipe", "pipe"],
    shell: false,
  });

  state.renodeRunning = true;
  emit({ type: "status", running: true, ts: Date.now() });
  emitLog("system", `Started Renode with ${simScript}`);

  state.renode.stdout.setEncoding("utf8");
  state.renode.stderr.setEncoding("utf8");

  state.renode.stdout.on("data", (chunk) => {
    const output = chunk.toString();
    emitLog("stdout", output);
    if (output.includes("Machine started")) {
      state.renodeReady = true;
      emitLog("system", "Renode is ready to receive commands.");
    }
  });

  state.renode.stderr.on("data", (chunk) => {
    emitLog("stderr", chunk);
  });

  state.renode.on("error", (err) => {
    emitLog("system", `Renode spawn error: ${err.message}`);
  });

  state.renode.on("close", (code, signal) => {
    emitLog("system", `Renode stopped (code=${code}, signal=${signal || "none"})`);
    state.renode = null;
    state.renodeRunning = false;
    state.renodeReady = false;
    emit({ type: "status", running: false, ts: Date.now() });
  });
}

export function connectToExternalRenode() {
  if (!RENODE_MONITOR_PORT || Number.isNaN(RENODE_MONITOR_PORT)) {
    emitLog("system", "External mode requires RENODE_MONITOR_PORT. Example: RENODE_MODE=external RENODE_MONITOR_PORT=33334");
    return;
  }
  if (state.renodeSocket) return;

  state.renodeSocket = net.createConnection(
    { host: RENODE_MONITOR_HOST, port: RENODE_MONITOR_PORT },
    () => {
      state.renodeRunning = true;
      state.renodeReady = true;
      emit({ type: "status", running: true, ts: Date.now() });
      emitLog("system", `Connected to external Renode monitor at ${RENODE_MONITOR_HOST}:${RENODE_MONITOR_PORT}`);
    }
  );
  state.renodeSocket.setEncoding("utf8");
  state.renodeSocket.on("data", (chunk) => emitLog("monitor", chunk.toString()));
  state.renodeSocket.on("error", (err) => emitLog("system", `External Renode connection error: ${err.message}`));
  state.renodeSocket.on("close", () => {
    emitLog("system", "Disconnected from external Renode monitor");
    state.renodeSocket = null;
    state.renodeRunning = false;
    state.renodeReady = false;
    emit({ type: "status", running: false, ts: Date.now() });
  });
}

export function stopRenode() {
  if (RENODE_MODE === "robot") {
    state.uartTesterReadyByMachine.clear();
    state.uartTesterIdByMachine.clear();
    stopUartDrainLoops();
    stopAllTcpUartStreams();
    state.renodeRunning = false;
    state.renodeReady = false;
    emit({ type: "status", running: false, ts: Date.now() });
    emitLog("system", "Disconnected from Renode robot server (Renode process still running)");
    return;
  }
  if (RENODE_MODE === "external") {
    if (state.renodeSocket) state.renodeSocket.end();
    return;
  }
  if (state.renode) state.renode.kill("SIGINT");
}

export function sendMonitorCommand(command, machine) {
  const resolvedMachine = resolveMachine(machine);
  if (!state.renodeReady) {
    if (!state.renodeLoading) emitLog("system", "Renode is not running or not ready yet. Start simulator first.");
    return;
  }

  if (RENODE_MODE === "robot") {
    emitLog("command", `${command}\n`, resolvedMachine);
    executeRenodeCommand(command, resolvedMachine).catch((err) => {
      emitLog("system", `XML-RPC error: ${err.message}`);
    }).finally(() => {
      for (const boardMachine of MACHINES) {
        drainUartLines(boardMachine).catch((err) =>
          emitLog("system", `UART drain error: ${err.message}`, boardMachine)
        );
      }
    });
    return;
  }

  const fullCommand = `${command}\n`;
  if (RENODE_MODE === "external") {
    if (!state.renodeSocket || state.renodeSocket.destroyed || !state.renodeSocket.writable) {
      emitLog("system", "External Renode monitor is not connected.");
      return;
    }
    state.renodeSocket.write(fullCommand);
  } else {
    if (!state.renode || !state.renode.stdin.writable) {
      emitLog("system", "Renode process is not available.");
      return;
    }
    state.renode.stdin.write(fullCommand);
  }
  emitLog("command", fullCommand);
}
