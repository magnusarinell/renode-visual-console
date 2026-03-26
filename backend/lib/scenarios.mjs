import path from "node:path";
import { unlinkSync } from "node:fs";
import { state } from "../state.mjs";
import { repoRoot, RENODE_ROBOT_HOST, RENODE_ROBOT_PORT, DEFAULT_MACHINE, DAISY_ELF, simScriptPosix, MACHINES, UART_SOCKET_PORT_BASE } from "../config.mjs";
import { emit, emitLog } from "./broadcast.mjs";
import { callXmlRpc, executeRenodeCommandSilent, executeRenodeScript } from "./rpc.mjs";
import { startUartStreaming, drainUartLines, startUartDrainLoop, stopUartDrainLoops, startHubStreaming, startHubDrainLoop, stopHubDrainLoops } from "./uart.mjs";
import { startTcpUartStream, stopAllTcpUartStreams, startInterBoardRelay, stopInterBoardRelay } from "./tcp-uart.mjs";
import { startGpioPushLoop, stopGpioPushLoops } from "./gpio.mjs";
import { startOledPollLoop, stopOledPollLoop, startPcPollLoop, stopPcPollLoop, startAdcReadbackPollLoop, stopAdcReadbackPollLoop, OLED_FRAME_PATH } from "./polls.mjs";
import { sleep } from "./utils.mjs";

export async function setDaisyElfVariable(elfPath) {
  const elf = elfPath || state._daisyElfOverride;
  if (!elf || state.activeScenario !== "daisy") return;
  const elfPosix = path.resolve(repoRoot, elf).replace(/\\/g, "/");
  emitLog("system", `Setting Renode $elf = ${elfPosix}`);
  await callXmlRpc("ExecuteCommand", [`$elf=@${elfPosix}`]);
}

export async function setEsp32c3ElfVariable(elfPath) {
  const elf = elfPath || state._esp32c3ElfOverride;
  if (!elf || state.activeScenario !== "esp32c3") return;
  const elfPosix = path.resolve(repoRoot, elf).replace(/\\/g, "/");
  emitLog("system", `Setting Renode $elf = ${elfPosix}`);
  await callXmlRpc("ExecuteCommand", [`$elf=@${elfPosix}`]);
}

export async function connectToRobotServer() {
  if (state.renodeConnecting) return;
  if (state._renodeRetryTimer) {
    clearTimeout(state._renodeRetryTimer);
    state._renodeRetryTimer = null;
  }

  state.renodeConnecting = true;
  state.renodeReady = false;
  state.uartTesterReadyByMachine.clear();
  state.uartTesterIdByMachine.clear();
  stopUartDrainLoops();
  stopAllTcpUartStreams();
  stopInterBoardRelay();
  state.hubTesterReadyByMachine.clear();
  state.hubTesterIdByMachine.clear();
  stopHubDrainLoops();
  stopGpioPushLoops();

  try {
    emitLog("system", `Connecting to Renode XML-RPC robot server at ${RENODE_ROBOT_HOST}:${RENODE_ROBOT_PORT}\u2026`);
    const ping = await callXmlRpc("ExecuteCommand", ["version"]);
    if (ping.status === "FAIL") throw new Error(ping.error || "version command failed");
    const version = [ping.output, ping.return].filter(Boolean).join(" ").trim();
    emitLog("system", `Connected to Renode robot server. ${version}`);

    if (state.activeScenario !== "none") {
      emitLog("system", `Loading script: ${simScriptPosix}`);
      await setDaisyElfVariable();
      const includeResult = await executeRenodeScript(simScriptPosix);
      if (includeResult.status === "FAIL") {
        emitLog("system", `Include warning: ${includeResult.error || "unknown include failure"}`);
      }
    } else {
      emitLog("system", "No scenario selected — waiting for user to load a board.");
    }

    state.renodeRunning = true;
    state.renodeReady = true;
    emit({ type: "status", running: true, ts: Date.now() });

    for (const machine of state.activeMachines) {
      if (state.activeScenario === "discovery") {
        // Use event-driven TCP stream instead of XML-RPC polling for usart3.
        const portIndex = state.activeMachines.indexOf(machine);
        startTcpUartStream(machine, UART_SOCKET_PORT_BASE + portIndex);
      } else {
        await startUartStreaming(machine);
        if (state.activeScenario === "daisy" || state.activeScenario === "esp32c3") {
          const startRes = await callXmlRpc("ExecuteCommand", ["start"]).catch((e) => ({ status: "FAIL", error: e.message }));
          emitLog("system", `Simulation start: ${startRes.status}${startRes.error ? " — " + startRes.error : ""}`, machine);
        }
        const initDrainLines   = state.activeScenario === "daisy" ? 15 : (state.activeScenario === "esp32c3" ? 5 : 15);
        const initDrainTimeout = state.activeScenario === "daisy" ? "0.05" : (state.activeScenario === "esp32c3" ? "2.0" : "0.05");
        await drainUartLines(machine, initDrainLines, initDrainTimeout);
        startUartDrainLoop(machine);
      }
      if (state.activeHubPeripheral && state.activeScenario !== "discovery") {
        await startHubStreaming(machine);
        startHubDrainLoop(machine);
      }
      startGpioPushLoop(machine);
    }
    // Discovery: start point-to-point relay for usart1 (no hub echo)
    if (state.activeScenario === "discovery" && state.activeMachines.length >= 2) {
      startInterBoardRelay(
        state.activeMachines[0], UART_SOCKET_PORT_BASE + 2,
        state.activeMachines[1], UART_SOCKET_PORT_BASE + 3,
      );
    }
    if (state.activeScenario === "daisy") startOledPollLoop();
    if (state.activeScenario === "daisy" || state.activeScenario === "esp32c3" || state.activeScenario === "discovery") {
      startPcPollLoop();
    }
    if (state.activeScenario === "discovery") startAdcReadbackPollLoop();
  } catch (err) {
    state.renodeRunning = false;
    state.renodeReady = false;
    state.uartTesterReadyByMachine.clear();
    state.uartTesterIdByMachine.clear();
    stopUartDrainLoops();    stopAllTcpUartStreams();    state.hubTesterReadyByMachine.clear();
    state.hubTesterIdByMachine.clear();
    stopHubDrainLoops();
    stopGpioPushLoops();
    stopOledPollLoop();
    stopPcPollLoop();
    stopAdcReadbackPollLoop();
    emit({ type: "status", running: false, ts: Date.now() });
    emitLog("system", `Cannot connect to Renode: ${err.message || "no response"} — retrying in 5s\u2026`);
    state._renodeRetryTimer = setTimeout(() => {
      state._renodeRetryTimer = null;
      if (!state.renodeRunning) connectToRobotServer();
    }, 5000);
  } finally {
    state.renodeConnecting = false;
  }
}

export async function handleLoadScript(scenario) {
  if (!state.renodeReady) {
    emitLog("system", "Cannot switch scenario: Renode not ready.");
    return;
  }

  emitLog("system", `Switching to ${scenario} scenario\u2026`);
  state.renodeLoading = true;
  state.renodeReady = false;
  emit({ type: "status", running: false, ts: Date.now() });

  stopUartDrainLoops();
  stopHubDrainLoops();
  stopAllTcpUartStreams();
  stopInterBoardRelay();
  stopGpioPushLoops();
  stopOledPollLoop();
  stopPcPollLoop();
  stopAdcReadbackPollLoop();
  state.uartTesterReadyByMachine.clear();
  state.uartTesterIdByMachine.clear();
  state.hubTesterReadyByMachine.clear();
  state.hubTesterIdByMachine.clear();
  state._gpioPrevState = {};
  state._daisyAdcDmaBufAddr = undefined;
  Object.keys(state.gpioWriteOverrides).forEach((k) => delete state.gpioWriteOverrides[k]);

  const machinesToRemove = [...state.activeMachines];

  if (scenario === "daisy") {
    state.activeMachines       = ["daisy_0"];
    state.activeUartPeripheral = "sysbus.usart1";
    state.activeHubPeripheral  = null;
  } else if (scenario === "esp32c3") {
    state.activeMachines       = ["esp32c3_0"];
    state.activeUartPeripheral = "sysbus.uart0";
    state.activeHubPeripheral  = null;
  } else {
    state.activeMachines       = ["board_0", "board_1"];
    state.activeUartPeripheral = "sysbus.usart2";
    state.activeHubPeripheral  = null;  // hub replaced by inter-board relay
  }
  state.activeScenario = scenario;
  state.rpcQueue = Promise.resolve();

  for (const m of machinesToRemove) {
    emitLog("system", `Clearing machine ${m}\u2026`);
  }
  const clearResult = await executeRenodeCommandSilent("Clear", null).catch((e) => ({ status: "FAIL", error: e.message }));
  emitLog("system", `Clear: ${clearResult.status === "PASS" ? "OK" : (clearResult.error || clearResult.status)}`);
  await sleep(300);
  try { unlinkSync(OLED_FRAME_PATH); } catch { /* ok if missing */ }

  const newScript =
    scenario === "daisy" ? path.join(repoRoot, "renode", "daisy", "daisy_seed.resc") :
    scenario === "esp32c3" ? path.join(repoRoot, "renode", "esp32c3", "esp32c3.resc") :
    path.join(repoRoot, "renode", "nucleo", "nucleo_dual.resc");
  const newScriptPosix = newScript.replace(/\\/g, "/");
  emitLog("system", `Loading script: ${newScriptPosix}`);

  await setDaisyElfVariable();
  await setEsp32c3ElfVariable();
  if (scenario === "discovery" && state._discoveryElfOverride) {
    const elfPosix = path.resolve(repoRoot, state._discoveryElfOverride).replace(/\\/g, "/");
    emitLog("system", `Setting Renode $elf = ${elfPosix}`);
    await callXmlRpc("ExecuteCommand", [`$elf=@${elfPosix}`]);
  }

  const result = await executeRenodeScript(newScriptPosix);
  emitLog("system", `ExecuteScript result: ${result.status}${result.error ? " — " + result.error : ""}`);
  if (result.status === "FAIL") {
    emitLog("system", `Load failed: ${result.error}`);
    state.renodeLoading = false;
    return;
  }

  state.renodeRunning = true;
  state.renodeReady   = true;
  state.renodeLoading = false;
  emit({ type: "status", running: true, ts: Date.now() });
  emit({ type: "script_loaded", scenario, machines: state.activeMachines, ts: Date.now() });

  for (const machine of state.activeMachines) {
    if (state.activeScenario === "discovery") {
      const portIndex = state.activeMachines.indexOf(machine);
      startTcpUartStream(machine, UART_SOCKET_PORT_BASE + portIndex);
    } else {
      await startUartStreaming(machine);
      if (state.activeScenario === "daisy" || state.activeScenario === "esp32c3") {
        const startRes = await callXmlRpc("ExecuteCommand", ["start"]).catch((e) => ({ status: "FAIL", error: e.message }));
        emitLog("system", `Simulation start: ${startRes.status}${startRes.error ? " — " + startRes.error : ""}`, machine);
      }
      const drainTimeout = state.activeScenario === "daisy" ? "0.0005" : "2.0";
      const drainLines   = state.activeScenario === "daisy" ? 2 : 5;
      await drainUartLines(machine, drainLines, drainTimeout);
      startUartDrainLoop(machine);
    }
    if (state.activeHubPeripheral && state.activeScenario !== "discovery") {
      await startHubStreaming(machine);
      startHubDrainLoop(machine);
    }
    startGpioPushLoop(machine);
  }

  // Discovery: start point-to-point relay for usart1 (no hub echo)
  if (state.activeScenario === "discovery" && state.activeMachines.length >= 2) {
    startInterBoardRelay(
      state.activeMachines[0], UART_SOCKET_PORT_BASE + 2,
      state.activeMachines[1], UART_SOCKET_PORT_BASE + 3,
    );
  }

  // PC13 (B1 USER button, GPIO_ACTIVE_LOW) defaults to 0 (LOW) in Renode,
  // which the firmware reads as "button pressed". Release it on all discovery
  // machines so the firmware starts with the correct idle state and doesn't
  // fire a spurious TOGGLE_1 on the very first loop iteration.
  if (state.activeScenario === "discovery") {
    for (const m of state.activeMachines) {
      await executeRenodeCommandSilent("sysbus.gpioPortC OnGPIO 13 true", m).catch(() => {});
    }
    emitLog("system", "PC13 (B1) released on all machines — button state initialised");
  }

  if (state.activeScenario === "daisy") startOledPollLoop();
  if (state.activeScenario === "daisy" || state.activeScenario === "esp32c3" || state.activeScenario === "discovery") {
    startPcPollLoop();
  }
  if (state.activeScenario === "discovery") startAdcReadbackPollLoop();
}

export async function handleClear() {
  emitLog("system", "Clearing simulation\u2026");
  stopUartDrainLoops();
  stopHubDrainLoops();
  stopAllTcpUartStreams();
  stopInterBoardRelay();
  stopGpioPushLoops();
  stopOledPollLoop();
  stopPcPollLoop();
  stopAdcReadbackPollLoop();
  state.uartTesterReadyByMachine.clear();
  state.uartTesterIdByMachine.clear();
  state.hubTesterReadyByMachine.clear();
  state.hubTesterIdByMachine.clear();
  state._gpioPrevState = {};
  Object.keys(state.gpioWriteOverrides).forEach((k) => delete state.gpioWriteOverrides[k]);
  state.renodeRunning = false;
  state.renodeReady = false;
  state.activeMachines = [];
  state.activeScenario = "none";
  state._daisyElfOverride = DAISY_ELF;
  state._discoveryElfOverride = "";
  state._esp32c3ElfOverride = "";
  state.rpcQueue = Promise.resolve();
  emit({ type: "status", running: false, ts: Date.now() });
  try { unlinkSync(OLED_FRAME_PATH); } catch { /* ok if missing */ }
  const cr = await executeRenodeCommandSilent("Clear", null).catch(() => ({ status: "PASS" }));
  emitLog("system", `Clear: ${cr.status === "PASS" ? "OK" : (cr.error || "done")}`);
  await sleep(300);
  state.renodeReady = true;
  emit({ type: "cleared", ts: Date.now() });
}
